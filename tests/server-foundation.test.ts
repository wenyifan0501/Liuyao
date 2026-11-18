import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../apps/server/database.js";
import { migrate } from "../apps/server/migrate.js";
import { ConsultationService } from "../apps/server/service.js";
import { createApp } from "../apps/server/app.js";
import type { ConsultationView, CreateConsultation } from "../packages/contracts/index.js";

const origin = "http://localhost:3000";
const password = "test-password-12345";
const question: CreateConsultation = { question: "未来三个月的工作发展如何？", topic: "career", background: ["正在考虑新的机会"], timeWindow: "未来三个月", timezone: "Asia/Shanghai" };
let engine: PGlite;
let db: Database;
let service: ConsultationService;
let app: Awaited<ReturnType<typeof createApp>>;
let userA: string;
let userB: string;
let cookieA: string;
let cookieB: string;

beforeAll(async () => {
  engine = new PGlite();
  db = { async exec(sql) { await engine.exec(sql); }, query: (sql, params) => engine.query(sql, params), transaction: (work) => engine.transaction((tx) => work({ query: (sql, params) => tx.query(sql, params), async exec(sql) { await tx.exec(sql); } })), close: () => engine.close() };
  await migrate(db);
  await migrate(db);
  service = new ConsultationService(db);
  userA = (await service.register("alice", password, await service.createInvitation(2, 2))).id;
  userB = (await service.register("bob", password, await service.createInvitation(1, 1))).id;
  cookieA = `liuyao_session=${await service.login("alice", password)}`;
  cookieB = `liuyao_session=${await service.login("bob", password)}`;
  app = await createApp(db, { origin, secureCookies: false });
}, 30_000);
afterAll(async () => { await app?.close(); await db?.close(); });

async function chartFor(owner: string, key: string): Promise<ConsultationView> {
  const c = await service.create(owner, key, question);
  return service.cast(owner, c.id, { method: "simulated_three_coins" });
}

describe("invite-only API foundation", () => {
  it("runs migrations once and stores no raw password, invite or session tokens", async () => {
    expect((await db.query("SELECT * FROM schema_migrations")).rows).toHaveLength(4);
    const rows = await db.query<{ password_hash: string }>("SELECT password_hash FROM users");
    expect(rows.rows.every((row) => row.password_hash.startsWith("$argon2id$") && !row.password_hash.includes(password))).toBe(true);
    const session = await db.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(session.rows[0]!.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(cookieA).not.toContain(session.rows[0]!.token_hash);
  });

  it("allows only one claim of an invitation under concurrent registration", async () => {
    const invitation = await service.createInvitation(2, 3);
    const results = await Promise.allSettled([service.register("claim_one", password, invitation), service.register("claim_two", password, invitation)]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    const winner = results.find((x) => x.status === "fulfilled")!;
    if (winner.status === "fulfilled") expect(await service.trial(winner.value.id)).toEqual({ remainingConsultations: 2, followUpsPerConsultation: 3 });
  });

  it("rejects expired and revoked invitations", async () => {
    const code = await service.createInvitation(1, 1);
    await db.query("UPDATE invitations SET expires_at=now()-interval '1 day' WHERE claimed_by IS NULL");
    await expect(service.register("expired", password, code)).rejects.toMatchObject({ code: "invitation_invalid" });
    const revoked = await service.createInvitation(1, 1);
    await db.query("UPDATE invitations SET revoked=true WHERE claimed_by IS NULL");
    await expect(service.register("revoked", password, revoked)).rejects.toMatchObject({ code: "invitation_invalid" });
  });

  it("rolls back invite consumption when a username is unavailable", async () => {
    const code = await service.createInvitation(1, 1);
    await expect(service.register("ALICE", password, code)).rejects.toMatchObject({ code: "username_unavailable" });
    const result = await service.register("new_alice", password, code);
    expect((await service.trial(result.id)).remainingConsultations).toBe(1);
  });

  it("requires a session and rejects foreign or missing Origin on writes", async () => {
    expect((await app.inject({ method: "GET", url: "/api/consultations" })).statusCode).toBe(401);
    for (const headers of [{ cookie: cookieA }, { cookie: cookieA, origin: "https://evil.example" }]) {
      expect((await app.inject({ method: "POST", url: "/api/consultations", headers, payload: question })).statusCode).toBe(403);
    }
  });

  it("validates inputs and does not accept owner injection or simulated values", async () => {
    const headers = { cookie: cookieA, origin, "idempotency-key": "validation-test" };
    expect((await app.inject({ method: "POST", url: "/api/consultations", headers, payload: { ...question, ownerId: userB } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/consultations", headers, payload: { ...question, timezone: "invalid-zone" } })).statusCode).toBe(400);
    const c = await service.create(userA, "validation-chart", question);
    expect((await app.inject({ method: "POST", url: `/api/consultations/${c.id}/cast`, headers, payload: { method: "simulated_three_coins", values: [7, 7, 7, 7, 7, 7] } })).statusCode).toBe(400);
  });

  it("creates idempotently, persists the chart, and isolates both reads and writes", async () => {
    const headers = { cookie: cookieA, origin, "idempotency-key": "create-consultation" };
    const responses = await Promise.all([1, 2].map(() => app.inject({ method: "POST", url: "/api/consultations", headers, payload: question })));
    expect(responses.map((r) => r.statusCode)).toEqual([201, 201]);
    const c = responses[0]!.json<ConsultationView>();
    expect(responses[1]!.json<ConsultationView>().id).toBe(c.id);
    expect((await app.inject({ method: "POST", url: "/api/consultations", headers, payload: { ...question, question: "改一个问题" } })).statusCode).toBe(409);
    const url = `/api/consultations/${c.id}`;
    expect((await app.inject({ method: "GET", url, headers: { cookie: cookieB } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `${url}/cast`, headers: { cookie: cookieB, origin }, payload: { method: "simulated_three_coins" } })).statusCode).toBe(404);
    const casts = await Promise.all([1, 2].map(() => app.inject({ method: "POST", url: `${url}/cast`, headers, payload: { method: "simulated_three_coins" } })));
    expect(casts[0]!.json()).toEqual(casts[1]!.json());
    expect(casts[0]!.json<ConsultationView>().chart!.casting.values).toHaveLength(6);
    expect((await service.get(userA, c.id)).chart).toEqual(casts[0]!.json<ConsultationView>().chart);
    expect((await app.inject({ method: "POST", url: `${url}/cast`, headers, payload: { method: "manual", values: [7, 7, 7, 7, 7, 7] } })).statusCode).toBe(409);
    expect((await service.list(userB)).some((row) => row.id === c.id)).toBe(false);
    expect((await service.trial(userA)).remainingConsultations).toBe(2);
  });

  it("sets protected cookies and revokes the server-side session on logout", async () => {
    const login = await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin }, payload: { username: "ALICE", password } });
    expect(login.statusCode).toBe(200);
    const header = String(login.headers["set-cookie"]);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    const cookie = header.split(";")[0]!;
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).json().capabilities.ai).toBe(false);
    await app.inject({ method: "POST", url: "/api/auth/logout", headers: { origin, cookie } });
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/auth/login", headers: { origin }, payload: { username: "alice", password: "wrong-password" } })).statusCode).toBe(401);
  });

  it("limits login attempts independently of forged forwarded IP headers", async () => {
    const limited = await createApp(db, { origin, secureCookies: false });
    try {
      for (let index = 0; index < 10; index++) {
        expect((await limited.inject({ method: "POST", url: "/api/auth/login", headers: { origin, "x-forwarded-for": `192.0.2.${index}` }, payload: { username: "nobody", password } })).statusCode).toBe(401);
      }
      expect((await limited.inject({ method: "POST", url: "/api/auth/login", headers: { origin }, payload: { username: "nobody", password } })).statusCode).toBe(429);
    } finally { await limited.close(); }
  });
});

describe("transactional trial ledger (internal, no model calls)", () => {
  it("reserves once and releases once under duplicate calls", async () => {
    const c = await chartFor(userA, "trial-release-chart");
    const reservations = await Promise.all([service.reserveTrial(userA, c.id, "reserve-once"), service.reserveTrial(userA, c.id, "reserve-once")]);
    expect(reservations[0]).toEqual(reservations[1]);
    expect((await service.trial(userA)).remainingConsultations).toBe(1);
    await expect(service.reserveTrial(userA, c.id, "another-key")).rejects.toMatchObject({ code: "request_conflict" });
    await Promise.all([service.finishTrial(userA, reservations[0]!.id, "released"), service.finishTrial(userA, reservations[0]!.id, "released")]);
    expect((await service.trial(userA)).remainingConsultations).toBe(2);
    expect((await service.reserveTrial(userA, c.id, "reserve-once")).status).toBe("released");
    await expect(service.finishTrial(userA, reservations[0]!.id, "settled")).rejects.toMatchObject({ code: "request_conflict" });
  });

  it("cannot spend one remaining consultation twice or settle another user's reservation", async () => {
    const first = await chartFor(userB, "trial-first");
    const second = await chartFor(userB, "trial-second");
    const results = await Promise.allSettled([service.reserveTrial(userB, first.id, "first-request"), service.reserveTrial(userB, second.id, "second-request")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") expect(failed.reason).toMatchObject({ code: "trial_exhausted" });
    const success = results.find((r) => r.status === "fulfilled");
    if (success?.status !== "fulfilled") throw new Error("missing reservation");
    await expect(service.finishTrial(userA, success.value.id, "released")).rejects.toMatchObject({ code: "not_found" });
    await service.finishTrial(userB, success.value.id, "settled");
    await service.finishTrial(userB, success.value.id, "settled");
    expect((await service.trial(userB)).remainingConsultations).toBe(0);
    await expect(service.reserveTrial(userB, first.id, "second-request")).rejects.toMatchObject({ code: "request_conflict" });
    const ledger = await db.query<{ total: string }>("SELECT sum(delta)::text AS total FROM entitlement_ledger WHERE owner_id=$1", [userB]);
    expect(Number(ledger.rows[0]!.total)).toBe(0);
  });
});

it("persists favorites, isolates owners and hides deleted records without refunding quota", async()=>{
  const c=await service.create(userA,"library-test-record",question);
  const quota=await service.trial(userA);
  const request=(owner:string,action:string,body:Record<string,unknown>={})=>app.inject({method:"POST",url:`/api/consultations/${c.id}/${action}`,headers:{origin,cookie:owner},payload:body});
  expect((await request(cookieB,"favorite",{favorite:true})).statusCode).toBe(404);
  expect((await request(cookieB,"delete")).statusCode).toBe(404);
  expect((await request(cookieA,"favorite",{favorite:true})).json().favorite).toBe(true);
  expect((await service.get(userA,c.id)).favorite).toBe(true);
  expect((await request(cookieA,"favorite",{favorite:false})).json().favorite).toBe(false);
  expect((await request(cookieA,"delete")).statusCode).toBe(200);
  expect((await request(cookieA,"delete")).statusCode).toBe(200);
  expect((await service.list(userA)).some(x=>x.id===c.id)).toBe(false);
  await expect(service.get(userA,c.id)).rejects.toMatchObject({statusCode:404});
  await expect(service.cast(userA,c.id,{method:"simulated_three_coins"})).rejects.toMatchObject({statusCode:404});
  await expect(service.create(userA,"library-test-record",question)).rejects.toMatchObject({statusCode:404});
  expect((await request(cookieA,"favorite",{favorite:true})).statusCode).toBe(404);
  expect((await app.inject({method:"GET",url:`/api/consultations/${c.id}/ai`,headers:{cookie:cookieA}})).statusCode).toBe(404);
  expect(await service.trial(userA)).toEqual(quota);
});

it('persists three oracle methods once, isolates owners and rejects mismatched cast endpoints',async()=>{
  for(const method of ['meihua','qiuqian','jiaobei'] as const){
    const c=await service.create(userA,'oracle-'+method,{...question,method});
    expect(c.method).toBe(method);
    await expect(service.oracle(userB,c.id,[3,8,6])).rejects.toMatchObject({statusCode:404});
    await expect(service.cast(userA,c.id,{method:'simulated_three_coins'})).rejects.toMatchObject({code:'wrong_method'});
    const results=await Promise.all([service.oracle(userA,c.id,[3,8,6]),service.oracle(userA,c.id,[1,1,1])]);
    expect(results[0]!.oracle).toEqual(results[1]!.oracle);
    expect(results[0]!.chart).toBeNull();expect(results[0]!.status).toBe('chart_ready');
    expect((await service.get(userA,c.id)).oracle).toEqual(results[0]!.oracle);
    await service.remove(userA,c.id);
    await expect(service.oracle(userA,c.id,[1,1,1])).rejects.toMatchObject({statusCode:404});
  }
});
