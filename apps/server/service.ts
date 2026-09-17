import { randomUUID } from "node:crypto";
import type { Database, Queryable } from "./database.js";
import { digest, passwordHash, secret, ServiceError, verifyPassword } from "./security.js";
import { buildChart } from "../../src/domain/engine.js";
import { simulateThreeCoinCasting } from "../../src/domain/casting.js";
import { resolveCalendarContext } from "../../src/calendar/lunarCalendar.js";
import type { CastConsultation, ConsultationView, CreateConsultation, TrialView } from "../../packages/contracts/index.js";

interface ConsultationRow extends Record<string, unknown> {
  id: string; question: string; topic: ConsultationView["topic"]; background: string[];
  time_window: string | null; timezone: string; status: ConsultationView["status"];
  chart: ConsultationView["chart"]; created_at: Date | string;
  favorite: boolean; deleted_at: Date | string | null;
  request_hash: string; cast_request_hash: string | null;
}
const view = (row: ConsultationRow): ConsultationView => ({
  favorite: row.favorite, id: row.id, question: row.question, topic: row.topic, background: row.background,
  timeWindow: row.time_window, timezone: row.timezone, status: row.status,
  chart: row.chart, createdAt: new Date(row.created_at).toISOString(),
});
const conflict = (): never => { throw new ServiceError(409, "request_conflict", "该操作已经执行，提交内容不能改变"); };
const notFound = (): never => { throw new ServiceError(404, "not_found", "咨询不存在"); };

export class ConsultationService {
  private readonly dummyPassword = passwordHash(secret());
  constructor(private readonly db: Database) {}

  async createInvitation(trials: number, followUps: number, days = 7): Promise<string> {
    if (![trials, followUps].every((n) => Number.isInteger(n) && n >= 0 && n <= 20) || !Number.isInteger(days) || days < 1 || days > 30) {
      throw new Error("邀请码额度必须为 0–20，有效天数为 1–30");
    }
    const code = secret();
    await this.db.query("INSERT INTO invitations(code_hash,trial_consultations,follow_ups,expires_at) VALUES ($1,$2,$3,$4)",
      [digest(code), trials, followUps, new Date(Date.now() + days * 86400000)]);
    return code;
  }

  async register(username: string, password: string, invitation: string): Promise<{ id: string }> {
    const encoded = await passwordHash(password);
    return this.db.transaction(async (tx) => {
      const claim = await tx.query<{ trial_consultations: number; follow_ups: number }>(
        "SELECT trial_consultations,follow_ups FROM invitations WHERE code_hash=$1 AND claimed_by IS NULL AND NOT revoked AND expires_at>now() FOR UPDATE", [digest(invitation)]);
      const offer = claim.rows[0];
      if (!offer) throw new ServiceError(403, "invitation_invalid", "邀请码无效、过期或已经使用");
      const id = randomUUID();
      const inserted = await tx.query("INSERT INTO users(id,username,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING RETURNING id", [id, username.toLowerCase(), encoded]);
      if (!inserted.rows.length) throw new ServiceError(409, "username_unavailable", "用户名不可用");
      await tx.query("UPDATE invitations SET claimed_by=$2 WHERE code_hash=$1", [digest(invitation), id]);
      await tx.query("INSERT INTO trial_accounts(user_id,available,follow_ups_per_consultation) VALUES($1,$2,$3)", [id, offer.trial_consultations, offer.follow_ups]);
      await tx.query("INSERT INTO entitlement_ledger(id,owner_id,kind,delta) VALUES($1,$2,'grant',$3)", [randomUUID(), id, offer.trial_consultations]);
      return { id };
    });
  }

  async login(username: string, password: string): Promise<string> {
    const result = await this.db.query<{ id: string; password_hash: string }>("SELECT id,password_hash FROM users WHERE username=$1", [username.toLowerCase()]);
    const user = result.rows[0];
    const matches = await verifyPassword(user?.password_hash ?? await this.dummyPassword, password);
    if (!user || !matches) throw new ServiceError(401, "invalid_credentials", "用户名或密码不正确");
    const token = secret();
    await this.db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)", [digest(token), user.id, new Date(Date.now() + 7 * 86400000)]);
    return token;
  }

  async authenticate(token?: string): Promise<{ id: string; username: string }> {
    if (!token || token.length > 128) throw new ServiceError(401, "unauthorized", "请先登录");
    const result = await this.db.query<{ id: string; username: string }>("SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()", [digest(token)]);
    if (!result.rows[0]) throw new ServiceError(401, "unauthorized", "登录已过期，请重新登录");
    return result.rows[0];
  }

  async logout(token: string): Promise<void> {
    await this.db.query("DELETE FROM sessions WHERE token_hash=$1", [digest(token)]);
  }

  async trial(userId: string): Promise<TrialView> {
    const result = await this.db.query<{ available: number; follow_ups_per_consultation: number }>("SELECT available,follow_ups_per_consultation FROM trial_accounts WHERE user_id=$1", [userId]);
    const account = result.rows[0];
    if (!account) throw new ServiceError(401, "unauthorized", "账户不存在");
    return { remainingConsultations: account.available, followUpsPerConsultation: account.follow_ups_per_consultation };
  }

  async create(userId: string, key: string, input: CreateConsultation): Promise<ConsultationView> {
    try { new Intl.DateTimeFormat("en", { timeZone: input.timezone }); }
    catch { throw new ServiceError(400, "invalid_timezone", "时区无效"); }
    const normalized = { question: input.question.trim(), topic: input.topic, background: input.background.map((x) => x.trim()).filter(Boolean), timeWindow: input.timeWindow?.trim() || null, timezone: input.timezone };
    if (!normalized.question) throw new ServiceError(400, "question_required", "请输入占问问题");
    const hash = digest(JSON.stringify(normalized));
    return this.db.transaction(async (tx) => {
      await tx.query("INSERT INTO consultations(id,owner_id,request_key,request_hash,question,topic,background,time_window,timezone) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT(owner_id,request_key) DO NOTHING",
        [randomUUID(), userId, key, hash, normalized.question, normalized.topic, JSON.stringify(normalized.background), normalized.timeWindow, normalized.timezone]);
      const result = await tx.query<ConsultationRow>("SELECT * FROM consultations WHERE owner_id=$1 AND request_key=$2", [userId, key]);
      const row = result.rows[0]!;
      if (row.deleted_at) notFound();
      if (row.request_hash !== hash) conflict();
      return view(row);
    });
  }

  async list(userId: string, offset = 0): Promise<ConsultationView[]> {
    const result = await this.db.query<ConsultationRow>("SELECT * FROM consultations WHERE owner_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET $2", [userId, offset]);
    return result.rows.map(view);
  }

  async get(userId: string, id: string): Promise<ConsultationView> {
    const result = await this.db.query<ConsultationRow>("SELECT * FROM consultations WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL", [userId, id]);
    return view(result.rows[0] ?? notFound());
  }

  async favorite(userId: string, id: string, favorite: boolean): Promise<ConsultationView> {
    const result=await this.db.query<ConsultationRow>("UPDATE consultations SET favorite=$3 WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING *",[userId,id,favorite]);
    return view(result.rows[0] ?? notFound());
  }
  async remove(userId: string, id: string): Promise<void> {
    await this.db.transaction(async tx=>{
      const row=await tx.query("SELECT id FROM consultations WHERE owner_id=$1 AND id=$2 FOR UPDATE",[userId,id]);
      if(!row.rows.length) notFound();
      const running=await tx.query("SELECT id FROM ai_runs WHERE consultation_id=$1 AND status IN ('queued','running')",[id]);
      if(running.rows.length) throw new ServiceError(409,"generation_active","解读正在生成，请完成后再删除");
      // Keep billing and idempotency records. Deletion does not restore quota.
      await tx.query("UPDATE consultations SET deleted_at=COALESCE(deleted_at,now()) WHERE owner_id=$1 AND id=$2",[userId,id]);
    });
  }

  async cast(userId: string, id: string, input: CastConsultation): Promise<ConsultationView> {
    if (input.method === "simulated_three_coins" && input.values !== undefined) {
      throw new ServiceError(400, "invalid_cast", "模拟起卦不能提交自选结果");
    }
    if (input.method !== "simulated_three_coins" && (!input.values || input.values.length !== 6 || input.values.some((v) => ![6, 7, 8, 9].includes(v)))) {
      throw new ServiceError(400, "invalid_cast", "请按初爻到上爻提交六个 6/7/8/9");
    }
    const hash = digest(JSON.stringify({ method: input.method, values: input.values ?? null }));
    return this.db.transaction(async (tx) => {
      const result = await tx.query<ConsultationRow>("SELECT * FROM consultations WHERE owner_id=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE", [userId, id]);
      const row = result.rows[0] ?? notFound();
      if (row.chart) {
        if (row.cast_request_hash !== hash) conflict();
        return view(row);
      }
      const running = await tx.query("SELECT id FROM ai_runs WHERE consultation_id=$1 AND status IN ('queued','running')", [id]);
      if (running.rows.length) throw new ServiceError(409, "generation_active", "正在确认问题，请等待完成后起卦");
      const chart = buildChart({ method: input.method, values: input.values ?? simulateThreeCoinCasting(), calendar: resolveCalendarContext({ castAt: new Date().toISOString(), timezone: row.timezone }) });
      const updated = await tx.query<ConsultationRow>("UPDATE consultations SET chart=$3::jsonb,cast_request_hash=$4,status='chart_ready' WHERE owner_id=$1 AND id=$2 RETURNING *", [userId, id, JSON.stringify(chart), hash]);
      return view(updated.rows[0]!);
    });
  }

  // Internal billing boundary. Deliberately not exposed as an HTTP endpoint until
  // the worker and its per-call cost budget can be committed atomically with it.
  async reserveTrial(userId: string, consultationId: string, key: string): Promise<{ id: string; status: string }> {
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT user_id FROM trial_accounts WHERE user_id=$1 FOR UPDATE", [userId]);
      const prior = await tx.query<{ id: string; status: string; consultation_id: string }>("SELECT id,status,consultation_id FROM trial_reservations WHERE owner_id=$1 AND request_key=$2", [userId, key]);
      if (prior.rows[0]) {
        if (prior.rows[0].consultation_id !== consultationId) conflict();
        return { id: prior.rows[0].id, status: prior.rows[0].status };
      }
      const consultation = await tx.query("SELECT id FROM consultations WHERE id=$1 AND owner_id=$2 AND status='chart_ready' AND deleted_at IS NULL", [consultationId, userId]);
      if (!consultation.rows.length) notFound();
      const live = await tx.query("SELECT id FROM trial_reservations WHERE consultation_id=$1 AND status IN ('reserved','settled')", [consultationId]);
      if (live.rows.length) conflict();
      const balance = await tx.query("UPDATE trial_accounts SET available=available-1 WHERE user_id=$1 AND available>0 RETURNING available", [userId]);
      if (!balance.rows.length) throw new ServiceError(402, "trial_exhausted", "免费咨询额度已用完");
      const id = randomUUID();
      await tx.query("INSERT INTO trial_reservations(id,owner_id,consultation_id,request_key,status) VALUES($1,$2,$3,$4,'reserved')", [id, userId, consultationId, key]);
      await this.ledger(tx, userId, id, "reserve", -1);
      return { id, status: "reserved" };
    });
  }

  async finishTrial(userId: string, id: string, outcome: "settled" | "released"): Promise<void> {
    await this.db.transaction(async (tx) => {
      // All quota operations acquire the account first to keep lock ordering stable.
      await tx.query("SELECT user_id FROM trial_accounts WHERE user_id=$1 FOR UPDATE", [userId]);
      const result = await tx.query<{ status: string }>("SELECT status FROM trial_reservations WHERE id=$1 AND owner_id=$2 FOR UPDATE", [id, userId]);
      const row = result.rows[0] ?? notFound();
      if (row.status === outcome) return;
      if (row.status !== "reserved") conflict();
      await tx.query("UPDATE trial_reservations SET status=$2 WHERE id=$1", [id, outcome]);
      if (outcome === "released") await tx.query("UPDATE trial_accounts SET available=available+1 WHERE user_id=$1", [userId]);
      await this.ledger(tx, userId, id, outcome === "settled" ? "settle" : "release", outcome === "released" ? 1 : 0);
    });
  }

  private async ledger(tx: Queryable, userId: string, id: string, kind: string, delta: number): Promise<void> {
    await tx.query("INSERT INTO entitlement_ledger(id,owner_id,reservation_id,kind,delta) VALUES($1,$2,$3,$4,$5)", [randomUUID(), userId, id, kind, delta]);
  }
}
