import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, expect, it } from "vitest";
import { WebAi, type AiProcessor } from "../apps/server/ai.js";
import { ConsultationService } from "../apps/server/service.js";
import { migrate } from "../apps/server/migrate.js";
import type { Database } from "../apps/server/database.js";
import { createApp } from "../apps/server/app.js";

let db: Database;
let service: ConsultationService;
let owner: string;
let other: string;
let ai: WebAi;
let calls = 0;
let failNext = false;
let lastInput: Parameters<AiProcessor["execute"]>[0];
const processor: AiProcessor = {
  model: "test-model", skillHash: "test-skill",
  async execute(input, progress, telemetry) {
    calls++; lastInput = input;
    await telemetry({ totalTokens: 100 });
    if (failNext) { failNext = false; throw new Error("provider failed with private data"); }
    if (input.kind === "framing") return { framing: { status: "ready", normalizedQuestion: input.consultation.question, clarifyingQuestion: null, choices: [], background: input.consultation.background } };
    await progress("生成中的正文");
    return { report: input.kind === "initial" ? "首轮解读" : "基于原卦继续回答", auditIssues: [] };
  },
};
beforeAll(async () => {
  const p = new PGlite();
  db = { query: (s, a) => p.query(s, a), async exec(s) { await p.exec(s); }, transaction: f => p.transaction(tx => f({ query: (s, a) => tx.query(s, a), async exec(s) { await tx.exec(s); } })), close: () => p.close() };
  await migrate(db); service = new ConsultationService(db);
  owner = (await service.register("ai_owner", "testing-password", await service.createInvitation(10, 1))).id;
  other = (await service.register("ai_other", "testing-password", await service.createInvitation(1, 1))).id;
  ai = new WebAi(db, processor, { dailyTokens: 12000000, userDailyCalls: 50 });
}, 30000);
afterAll(async () => { await db.close(); });
async function consultation(key: string, cast = true) {
  const c = await service.create(owner, key, { question: "未来三个月的工作发展如何？", topic: "career", background: [], timeWindow: "三个月", timezone: "Asia/Shanghai" });
  return cast ? service.cast(owner, c.id, { method: "simulated_three_coins" }) : c;
}

it("atomically queues once, reserves once and publishes only one final result", async () => {
  const c = await consultation("ai-initial");
  const before = (await service.trial(owner)).remainingConsultations!;
  const previousCalls = calls;
  const results = await Promise.all([ai.enqueue(owner, c.id, "same-key-1", "initial"), ai.enqueue(owner, c.id, "same-key-1", "initial")]);
  expect(results[0]!.id).toBe(results[1]!.id);
  expect((await service.trial(owner)).remainingConsultations).toBe(before - 1);
  await expect(ai.enqueue(owner, c.id, "other-key", "initial")).rejects.toMatchObject({ code: "generation_active" });
  await ai.tick(); await ai.tick();
  expect(calls - previousCalls).toBe(1);
  const conversation = await ai.conversation(owner, c.id);
  expect(conversation.runs[0]).toMatchObject({ status: "succeeded", text: "首轮解读" });
  await expect(ai.enqueue(owner, c.id, "new-initial", "initial")).rejects.toMatchObject({ code: "already_interpreted" });
  expect((await service.trial(owner)).remainingConsultations).toBe(before - 1);
});

it("keeps fixed chart and initial result in follow-up context and enforces follow-up allowance", async () => {
  const c = await consultation("ai-follow-up");
  await ai.enqueue(owner, c.id, "follow-initial", "initial"); await ai.tick();
  const before = (await service.trial(owner)).remainingConsultations!;
  await ai.enqueue(owner, c.id, "follow-question", "follow_up", "有哪些具体阻力？"); await ai.tick();
  expect(lastInput.consultation.chart).toEqual(c.chart);
  expect(lastInput.conversation.runs.find(r => r.kind === "initial")?.text).toBe("首轮解读");
  expect(lastInput.question).toBe("有哪些具体阻力？");
  expect((await service.trial(owner)).remainingConsultations).toBe(before);
  expect((await ai.conversation(owner, c.id)).remainingFollowUps).toBe(0);
  await expect(ai.enqueue(owner, c.id, "extra-follow", "follow_up", "再问一次")).rejects.toMatchObject({ code: "follow_up_exhausted" });
});

it("refunds a failed generation, keeps provider usage and does not replay the same failed request", async () => {
  const c = await consultation("ai-failure");
  const before = (await service.trial(owner)).remainingConsultations!;
  failNext = true;
  await ai.enqueue(owner, c.id, "failed-key", "initial"); await ai.tick();
  const state = await ai.conversation(owner, c.id);
  expect(state.runs[0]).toMatchObject({ status: "failed", text: "" });
  expect(state.runs[0]!.error).not.toContain("private data");
  expect((await service.trial(owner)).remainingConsultations).toBe(before);
  const row = await db.query<{ usage: unknown }>("SELECT usage FROM ai_runs WHERE id=$1", [state.runs[0]!.id]);
  expect(row.rows[0]!.usage).toEqual({ totalTokens: 100 });
  const n = calls;
  expect((await ai.enqueue(owner, c.id, "failed-key", "initial")).status).toBe("failed");
  await ai.tick(); expect(calls).toBe(n);
  await ai.enqueue(owner, c.id, "retry-new-key", "initial"); await ai.tick();
  expect((await service.trial(owner)).remainingConsultations).toBe(before - 1);
});

it("recovers interrupted work as failed without repeating a provider call", async () => {
  const c = await consultation("ai-restart");
  const before = (await service.trial(owner)).remainingConsultations!;
  const run = await ai.enqueue(owner, c.id, "restart-key", "initial");
  await db.query("UPDATE ai_runs SET status='running',deadline=now()-interval '1 second',partial_text='unfinished' WHERE id=$1", [run.id]);
  const n = calls;
  await new WebAi(db, processor).tick();
  expect(calls).toBe(n);
  expect((await ai.conversation(owner, c.id)).runs[0]).toMatchObject({ status: "failed", text: "" });
  expect((await service.trial(owner)).remainingConsultations).toBe(before);
});

it("includes framing in budgets and blocks casting while it runs", async () => {
  const c = await consultation("ai-framing", false);
  const before = (await service.trial(owner)).remainingConsultations!;
  await ai.enqueue(owner, c.id, "framing-key", "framing");
  await expect(service.cast(owner, c.id, { method: "simulated_three_coins" })).rejects.toMatchObject({ code: "generation_active" });
  await ai.tick();
  expect((await ai.conversation(owner, c.id)).framing?.status).toBe("ready");
  expect((await service.trial(owner)).remainingConsultations).toBe(before);
  await expect(ai.enqueue(owner, c.id, "framing-again", "framing")).rejects.toMatchObject({ code: "already_ready" });
});

it("denies exhausted global and user budgets without reserving a trial", async () => {
  const c = await consultation("ai-budget");
  const before = (await service.trial(owner)).remainingConsultations!;
  await expect(new WebAi(db, processor, { dailyTokens: 0, userDailyCalls: 50 }).enqueue(owner, c.id, "budget-zero", "initial")).rejects.toMatchObject({ code: "budget_exhausted" });
  await expect(new WebAi(db, processor, { dailyTokens: 12000000, userDailyCalls: 0 }).enqueue(owner, c.id, "user-zero", "initial")).rejects.toMatchObject({ code: "daily_limit" });
  expect((await service.trial(owner)).remainingConsultations).toBe(before);
  expect((await ai.conversation(owner, c.id)).runs).toHaveLength(0);
});

it("does not start a cross-day queued task without reserving today's budget", async () => {
  const c = await consultation("ai-cross-day");
  const run = await ai.enqueue(owner, c.id, "cross-day-key", "initial");
  await db.query("UPDATE ai_runs SET created_at=now()-interval '1 day' WHERE id=$1", [run.id]);
  const n = calls;
  await new WebAi(db, processor, { dailyTokens: 0, userDailyCalls: 50 }).tick();
  expect(calls).toBe(n);
  expect((await ai.conversation(owner, c.id)).runs[0]!.status).toBe("queued");
  await ai.tick();
  expect((await ai.conversation(owner, c.id)).runs[0]!.status).toBe("succeeded");
});

it("refunds queued work when the saved model configuration changed", async () => {
  const c = await consultation("ai-config-change");
  const before = (await service.trial(owner)).remainingConsultations!;
  await ai.enqueue(owner, c.id, "config-change", "initial");
  const n = calls;
  await new WebAi(db, { ...processor, model: "different-model" }).tick();
  expect(calls).toBe(n);
  expect((await service.trial(owner)).remainingConsultations).toBe(before);
  expect((await ai.conversation(owner, c.id)).runs[0]!.status).toBe("failed");
});

it("isolates AI reads and submissions and returns asynchronous API jobs", async () => {
  const c = await consultation("ai-api");
  const app = await createApp(db, { origin: "http://localhost:3000", secureCookies: false, ai });
  try {
    const otherCookie = `liuyao_session=${await service.login("ai_other", "testing-password")}`;
    expect((await app.inject({ method: "GET", url: `/api/consultations/${c.id}/ai`, headers: { cookie: otherCookie } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/consultations/${c.id}/ai`, headers: { cookie: otherCookie, origin: "http://localhost:3000", "idempotency-key": "foreign-ai" }, payload: { kind: "initial" } })).statusCode).toBe(404);
    const cookie = `liuyao_session=${await service.login("ai_owner", "testing-password")}`;
    const response = await app.inject({ method: "POST", url: `/api/consultations/${c.id}/ai`, headers: { cookie, origin: "http://localhost:3000", "idempotency-key": "api-initial" }, payload: { kind: "initial" } });
    expect(response.statusCode).toBe(202); expect(response.json().status).toBe("queued");
    await ai.tick();
  } finally { await app.close(); }
});

it('queues independent oracle interpretations and follow-ups against the fixed result',async()=>{
  const person=(await service.register('oracle_reader','testing-password',await service.createInvitation(3,1))).id;
  for(const method of ['meihua','qiuqian','jiaobei'] as const){
    const c=await service.create(person,'reading-'+method,{question:'如何安排接下来的学习？',topic:'other',background:[],timeWindow:null,timezone:'Asia/Shanghai',method});
    await expect(ai.enqueue(person,c.id,'early-'+method,'initial')).rejects.toMatchObject({code:'chart_required'});
    const fixed=await service.oracle(person,c.id,[3,8,6]);
    await ai.enqueue(person,c.id,'initial-'+method,'initial');await ai.tick();
    expect(lastInput.consultation.oracle).toEqual(fixed.oracle);
    expect(lastInput.consultation.chart).toBeNull();
    expect((await ai.conversation(person,c.id)).runs[0]?.status).toBe('succeeded');
    await ai.enqueue(person,c.id,'follow-'+method,'follow_up','下一步呢？');await ai.tick();
    expect(lastInput.consultation.oracle).toEqual(fixed.oracle);
  }
  expect((await service.trial(person)).remainingConsultations).toBe(0);
});

it("skips trial counts, follow-up caps and daily budgets when quota enforcement is off", async () => {
  const person = (await service.register("unlimited_reader", "testing-password", await service.createInvitation(0, 0))).id;
  const free = new ConsultationService(db, { enforced: false });
  expect(await free.trial(person)).toEqual({ remainingConsultations: null, followUpsPerConsultation: null });
  const openAi = new WebAi(db, processor, { dailyTokens: 0, userDailyCalls: 0, enforced: false });
  const c = await free.create(person, "unlimited-reading", { question: "这件事该不该现在推进？", topic: "career", background: [], timeWindow: null, timezone: "Asia/Shanghai" });
  await free.cast(person, c.id, { method: "simulated_three_coins" });
  await openAi.enqueue(person, c.id, "unlimited-initial", "initial"); await openAi.tick();
  expect((await openAi.conversation(person, c.id)).remainingFollowUps).toBeNull();
  for (const i of [1, 2, 3]) { await openAi.enqueue(person, c.id, `unlimited-follow-${i}`, "follow_up", "继续"); await openAi.tick(); }
  const runs = (await openAi.conversation(person, c.id)).runs;
  expect(runs.filter(r => r.kind === "follow_up" && r.status === "succeeded")).toHaveLength(3);
  const held = await db.query<{ count: string }>("SELECT count(*)::text AS count FROM trial_reservations WHERE owner_id=$1", [person]);
  expect(held.rows[0]).toEqual({ count: "0" });
});
