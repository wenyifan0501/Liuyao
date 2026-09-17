import { randomUUID } from "node:crypto";
import type { Database, Queryable } from "./database.js";
import { digest, ServiceError } from "./security.js";
import type { AiConversationView, AiRunKind, AiRunView, ConsultationView, FramingView } from "../../packages/contracts/index.js";
import { ConsultationService } from "./service.js";

interface Run extends Record<string, unknown> {
  id: string; owner_id: string; consultation_id: string; request_hash: string;
  kind: AiRunKind; question: string; status: AiRunView["status"];
  partial_text: string; error_message: string | null; created_at: Date | string;
  reservation_id: string | null; result: { report?: string; framing?: FramingView } | null;
  model: string; skill_hash: string;
}
export interface AiExecution {
  kind: AiRunKind;
  question: string;
  consultation: ConsultationView;
  conversation: AiConversationView;
}
export interface AiProcessor {
  model: string;
  skillHash: string;
  execute(input: AiExecution, progress: (text: string) => Promise<void>, telemetry: (usage: unknown) => Promise<void>): Promise<{ report?: string; framing?: FramingView; auditIssues?: unknown; usage?: unknown }>;
}
const view = (run: Run): AiRunView => ({ id: run.id, kind: run.kind, question: run.question, status: run.status, text: run.status === "succeeded" ? run.result?.report ?? "" : run.status === "running" ? run.partial_text : "", error: run.error_message, createdAt: new Date(run.created_at).toISOString() });
const reject = (status: number, code: string, message: string): never => { throw new ServiceError(status, code, message); };
const CALL_TOKEN_HOLD = 120_000; // 96 KB of input + at most 24K output tokens; failed calls retain their hold.

export class WebAi {
  private timer: ReturnType<typeof setInterval> | undefined;
  private active: Promise<void> | undefined;
  constructor(private readonly db: Database, private readonly processor: AiProcessor, private readonly limits = { dailyTokens: 2_400_000, userDailyCalls: 12 }) {}

  async conversation(owner: string, id: string): Promise<AiConversationView> {
    const c = await this.db.query<{ framing: FramingView | null }>("SELECT framing FROM consultations WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL", [id, owner]);
    if (!c.rows[0]) reject(404, "not_found", "咨询不存在");
    const runs = await this.db.query<Run>("SELECT * FROM ai_runs WHERE consultation_id=$1 AND owner_id=$2 ORDER BY created_at,id", [id, owner]);
    const account = await this.db.query<{ follow_ups_per_consultation: number }>("SELECT follow_ups_per_consultation FROM trial_accounts WHERE user_id=$1", [owner]);
    const used = runs.rows.filter(r => r.kind === "follow_up" && r.status !== "failed").length;
    return { runs: runs.rows.map(view), framing: c.rows[0]!.framing, remainingFollowUps: Math.max(0, (account.rows[0]?.follow_ups_per_consultation ?? 0) - used) };
  }

  async enqueue(owner: string, consultationId: string, key: string, kind: AiRunKind, question = ""): Promise<AiRunView> {
    question = question.trim();
    if (question.length > 2000 || (kind === "follow_up" && !question)) reject(400, "invalid_question", "请输入不超过 2000 字的追问");
    const requestHash = digest(JSON.stringify({ consultationId, kind, question }));
    return this.db.transaction(async tx => {
      const account = await tx.query<{ available: number; follow_ups_per_consultation: number }>("SELECT available,follow_ups_per_consultation FROM trial_accounts WHERE user_id=$1 FOR UPDATE", [owner]);
      if (!account.rows[0]) reject(401, "unauthorized", "请先登录");
      const visible=await tx.query("SELECT id FROM consultations WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE",[consultationId,owner]);
      if(!visible.rows.length) reject(404,"not_found","咨询不存在");
      const prior = await tx.query<Run>("SELECT * FROM ai_runs WHERE owner_id=$1 AND request_key=$2", [owner, key]);
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== requestHash) reject(409, "request_conflict", "重试请求的内容不能改变");
        return view(prior.rows[0]);
      }
      const c = await tx.query<{ chart: unknown; framing: FramingView | null }>("SELECT chart,framing FROM consultations WHERE id=$1 AND owner_id=$2 AND deleted_at IS NULL FOR UPDATE", [consultationId, owner]);
      if (!c.rows[0]) reject(404, "not_found", "咨询不存在");
      const previous = await tx.query<Run>("SELECT * FROM ai_runs WHERE consultation_id=$1", [consultationId]);
      if (previous.rows.some(r => r.status === "queued" || r.status === "running")) reject(409, "generation_active", "这次问事正在生成，请稍候");
      const initial = previous.rows.some(r => r.kind === "initial" && r.status === "succeeded");
      if (kind === "framing") {
        if (c.rows[0]!.chart) reject(409, "chart_fixed", "已起卦的问题无需重新确认");
        if (account.rows[0]!.available < 1) reject(402, "trial_exhausted", "免费咨询额度已用完");
        if (previous.rows.filter(r => r.kind === "framing").length >= 3) reject(429, "framing_limit", "问题确认已达上限，可按当前问题继续起卦");
        if (c.rows[0]!.framing?.status === "ready") reject(409, "already_ready", "问题已经确认，可以起卦");
        if (c.rows[0]!.framing?.status === "needs_clarification" && !question) reject(400, "answer_required", "请回答需要确认的问题");
      } else if (!c.rows[0]!.chart) reject(409, "chart_required", "请先完成起卦");
      if (kind === "initial" && initial) reject(409, "already_interpreted", "已有解读，请继续追问");
      if (kind === "follow_up") {
        if (!initial) reject(409, "initial_required", "请先完成首轮解读");
        if (previous.rows.filter(r => r.kind === "follow_up" && r.status === "succeeded").length >= account.rows[0]!.follow_ups_per_consultation) reject(402, "follow_up_exhausted", "本次咨询的免费追问已用完，付费功能尚未开放");
      }
      const count = await tx.query<{ count: string }>("SELECT count(*)::text AS count FROM ai_runs WHERE owner_id=$1 AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'", [owner]);
      if (Number(count.rows[0]!.count) >= this.limits.userDailyCalls) reject(429, "daily_limit", "今日 AI 调用已达上限，请明天再来");
      await tx.query("INSERT INTO ai_daily_budget(day) VALUES((now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING");
      const budget = await tx.query("UPDATE ai_daily_budget SET reserved_tokens=reserved_tokens+$1 WHERE day=(now() AT TIME ZONE 'UTC')::date AND reserved_tokens+$1<=$2 RETURNING day", [CALL_TOKEN_HOLD, this.limits.dailyTokens]);
      if (!budget.rows.length) reject(429, "budget_exhausted", "今日免费体验预算已用完，请明天再来");
      let reservation: string | null = null;
      if (kind === "initial") {
        const balance = await tx.query("UPDATE trial_accounts SET available=available-1 WHERE user_id=$1 AND available>0 RETURNING available", [owner]);
        if (!balance.rows.length) reject(402, "trial_exhausted", "免费咨询额度已用完");
        reservation = randomUUID();
        await tx.query("INSERT INTO trial_reservations(id,owner_id,consultation_id,request_key,status) VALUES($1,$2,$3,$4,'reserved')", [reservation, owner, consultationId, `ai:${key}`]);
        await tx.query("INSERT INTO entitlement_ledger(id,owner_id,reservation_id,kind,delta) VALUES($1,$2,$3,'reserve',-1)", [randomUUID(), owner, reservation]);
      }
      const result = await tx.query<Run>("INSERT INTO ai_runs(id,owner_id,consultation_id,request_key,request_hash,kind,question,reservation_id,model,skill_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *", [randomUUID(), owner, consultationId, key, requestHash, kind, question, reservation, this.processor.model, this.processor.skillHash]);
      return view(result.rows[0]!);
    });
  }

  private async finish(run: Run, result: Awaited<ReturnType<AiProcessor["execute"]>> | null): Promise<void> {
    await this.db.transaction(async tx => {
      await tx.query("SELECT user_id FROM trial_accounts WHERE user_id=$1 FOR UPDATE", [run.owner_id]);
      const state = await tx.query<Run>("SELECT * FROM ai_runs WHERE id=$1 FOR UPDATE", [run.id]);
      if (state.rows[0]?.status !== "running") return;
      await tx.query("UPDATE ai_runs SET status=$2,result=$3::jsonb,partial_text='',error_message=$4,usage=COALESCE($5::jsonb,usage),completed_at=now() WHERE id=$1", [run.id, result ? "succeeded" : "failed", result ? JSON.stringify(result) : null, result ? null : "本次生成未完成，请重试。若预占了咨询额度，已退还。", result?.usage ? JSON.stringify(result.usage) : null]);
      if (result?.framing) await tx.query("UPDATE consultations SET framing=$2::jsonb WHERE id=$1", [run.consultation_id, JSON.stringify(result.framing)]);
      if (run.reservation_id) {
        const changed = await tx.query("UPDATE trial_reservations SET status=$2 WHERE id=$1 AND status='reserved' RETURNING id", [run.reservation_id, result ? "settled" : "released"]);
        if (changed.rows.length) {
          if (!result) await tx.query("UPDATE trial_accounts SET available=available+1 WHERE user_id=$1", [run.owner_id]);
          await tx.query("INSERT INTO entitlement_ledger(id,owner_id,reservation_id,kind,delta) VALUES($1,$2,$3,$4,$5)", [randomUUID(), run.owner_id, run.reservation_id, result ? "settle" : "release", result ? 0 : 1]);
        }
      }
    });
  }

  async tick(): Promise<void> {
    const expired = await this.db.query<Run>("SELECT * FROM ai_runs WHERE status='running' AND deadline<now()");
    for (const run of expired.rows) await this.finish(run, null);
    const run = await this.db.transaction(async tx => {
      await tx.query("SELECT pg_advisory_xact_lock(78213461)");
      const running = await tx.query<{ count: string }>("SELECT count(*)::text AS count FROM ai_runs WHERE status='running'");
      if (Number(running.rows[0]!.count) >= 2) return undefined;
      const pending = await tx.query<Run>("SELECT * FROM ai_runs WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED");
      if (!pending.rows[0]) return undefined;
      const crossedDay = await tx.query("SELECT id FROM ai_runs WHERE id=$1 AND (created_at AT TIME ZONE 'UTC')::date < (now() AT TIME ZONE 'UTC')::date", [pending.rows[0].id]);
      if (crossedDay.rows.length) {
        await tx.query("INSERT INTO ai_daily_budget(day) VALUES((now() AT TIME ZONE 'UTC')::date) ON CONFLICT DO NOTHING");
        const budget = await tx.query("UPDATE ai_daily_budget SET reserved_tokens=reserved_tokens+$1 WHERE day=(now() AT TIME ZONE 'UTC')::date AND reserved_tokens+$1<=$2 RETURNING day", [CALL_TOKEN_HOLD, this.limits.dailyTokens]);
        // Keep old jobs queued when today's budget is exhausted; never make an unbudgeted call.
        if (!budget.rows.length) return undefined;
      }
      const updated = await tx.query<Run>("UPDATE ai_runs SET status='running',started_at=now(),deadline=now()+interval '5 minutes' WHERE id=$1 RETURNING *", [pending.rows[0].id]);
      return updated.rows[0];
    });
    if (!run) return;
    try {
      if (run.model !== this.processor.model || run.skill_hash !== this.processor.skillHash) throw new Error("Queued configuration changed; explicit retry required");
      const consultation = await new ConsultationService(this.db).get(run.owner_id, run.consultation_id);
      const conversation = await this.conversation(run.owner_id, run.consultation_id);
      let lastWrite = 0;
      const result = await this.processor.execute({ kind: run.kind, question: run.question, consultation, conversation }, async text => {
        if (Date.now() - lastWrite < 600) return;
        lastWrite = Date.now();
        await this.db.query("UPDATE ai_runs SET partial_text=$2 WHERE id=$1 AND status='running'", [run.id, text]);
      }, async usage => { await this.db.query("UPDATE ai_runs SET usage=$2::jsonb WHERE id=$1", [run.id, JSON.stringify(usage)]); });
      if (run.kind !== "framing" && !result.report?.trim()) throw new Error("Empty report");
      if (run.kind === "framing" && !result.framing) throw new Error("Missing framing");
      await this.finish(run, result);
    } catch {
      await this.finish(run, null);
    }
  }

  start(): void {
    const pump = () => {
      if (this.active) return;
      this.active = this.tick().catch(() => { console.error("AI worker tick failed; will retry polling (no automatic model retry)."); }).finally(() => { this.active = undefined; });
    };
    this.timer = setInterval(pump, 800); pump();
  }
  async close(): Promise<void> { clearInterval(this.timer); await this.active; }
}
