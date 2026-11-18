import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import type { Database } from "./database.js";
import { ConsultationService } from "./service.js";
import { ServiceError } from "./security.js";
import type { CastConsultation, CreateConsultation } from "../../packages/contracts/index.js";
import type { AiRunKind } from "../../packages/contracts/index.js";
import { WebAi } from "./ai.js";

const text = (maxLength: number, minLength = 1) => ({ type: "string", minLength, maxLength });
const object = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", additionalProperties: false, properties, required });
const credentials = { username: { ...text(32, 3), pattern: "^[a-zA-Z0-9_]+$" }, password: text(128, 10) };
const params = object({ id: { type: "string", format: "uuid" } }, ["id"]);
const topics = ["daily", "career", "exam", "finance", "relationship", "cooperation", "travel", "lost_property", "health_tendency", "market_trend", "other"];

export async function createApp(db: Database, options: { origin: string; secureCookies: boolean; logger?: boolean; ai?: WebAi; quotaEnforced?: boolean; trustProxy?: false | string[] }) {
  const origin = new URL(options.origin).origin;
  if (options.secureCookies && !origin.startsWith("https://")) throw new Error("生产环境 APP_ORIGIN 必须使用 HTTPS");
  const app = Fastify({
    logger: options.logger ? { redact: ["req.headers.cookie", "req.headers.authorization", "res.headers.set-cookie"], serializers: { req: (request) => ({ method: request.method, url: request.url.split("?")[0] ?? "" }) } } : false,
    bodyLimit: 24 * 1024,
    // Only trust the reverse proxy in front of the API, never "true": otherwise a
    // client could spoof X-Forwarded-For and escape per-IP rate limits.
    trustProxy: options.trustProxy ?? false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  const service = new ConsultationService(db, { enforced: options.quotaEnforced ?? true });
  const aiReader = options.ai ?? new WebAi(db, { model: "disabled", skillHash: "", async execute() { throw new Error("AI disabled"); } });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.origin !== origin) {
      throw new ServiceError(403, "origin_rejected", "请求来源无效");
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ServiceError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    const known = error as { statusCode?: number; validation?: unknown };
    if (known.validation || known.statusCode === 400) return reply.code(400).send({ error: { code: "invalid_request", message: "提交内容格式不正确" } });
    if (known.statusCode === 429) return reply.code(429).send({ error: { code: "rate_limited", message: "操作过于频繁，请稍后再试" } });
    if (known.statusCode === 413) return reply.code(413).send({ error: { code: "body_too_large", message: "提交内容过长" } });
    // Avoid logging database parameters, passwords or user question text.
    request.log.error({ requestId: request.id }, "API request failed");
    return reply.code(500).send({ error: { code: "internal_error", message: "服务暂时不可用" } });
  });
  const sessionCookie = { path: "/", httpOnly: true, secure: options.secureCookies, sameSite: "strict" as const, maxAge: 7 * 86400 };
  app.get("/api/health", async () => { await db.query("SELECT 1"); return { ok: true }; });
  app.post<{ Body: { username: string; password: string; invitation: string } }>("/api/auth/register", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    schema: { body: object({ ...credentials, invitation: text(64, 32) }, ["username", "password", "invitation"]) },
  }, async (request, reply) => {
    const { username, password, invitation } = request.body;
    const user = await service.register(username, password, invitation);
    return reply.code(201).send(user);
  });
  app.post<{ Body: { username: string; password: string } }>("/api/auth/login", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: { body: object(credentials, ["username", "password"]) },
  }, async (request, reply) => {
    const token = await service.login(request.body.username, request.body.password);
    reply.setCookie("liuyao_session", token, sessionCookie);
    return { ok: true };
  });
  app.post("/api/auth/logout", async (request, reply) => {
    if (request.cookies.liuyao_session) await service.logout(request.cookies.liuyao_session);
    reply.clearCookie("liuyao_session", { path: "/", httpOnly: true, secure: options.secureCookies, sameSite: "strict" });
    return { ok: true };
  });
  app.get("/api/me", async (request) => {
    const user = await service.authenticate(request.cookies.liuyao_session);
    return { user, trial: await service.trial(user.id), capabilities: { chart: true, ai: Boolean(options.ai), payments: false } };
  });
  app.post<{ Body: CreateConsultation }>("/api/consultations", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    schema: { body: object({ method:{type:"string",enum:["liuyao","meihua","qiuqian","jiaobei"]}, question: text(2000), topic: { type: "string", enum: topics }, background: { type: "array", maxItems: 10, items: text(1000) }, timeWindow: { anyOf: [text(120), { type: "null" }] }, timezone: text(80) }, ["question", "topic", "background", "timeWindow", "timezone"]) },
  }, async (request, reply) => {
    const user = await service.authenticate(request.cookies.liuyao_session);
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(key)) throw new ServiceError(400, "idempotency_key_required", "请提供有效的 Idempotency-Key");
    return reply.code(201).send(await service.create(user.id, key, request.body));
  });
  app.get("/api/consultations", async (request) => {
    const user = await service.authenticate(request.cookies.liuyao_session);
    const offset = (request.query as Record<string, unknown>).offset ?? "0";
    if (typeof offset !== "string" || !/^\d{1,6}$/.test(offset)) throw new ServiceError(400, "invalid_request", "分页参数无效");
    return { consultations: await service.list(user.id, Number(offset)) };
  });
  app.get<{ Params: { id: string } }>("/api/consultations/:id", { schema: { params } }, async (request) => {
    const user = await service.authenticate(request.cookies.liuyao_session);
    return service.get(user.id, request.params.id);
  });
  app.post<{Params:{id:string};Body:{numbers?:number[]}}>("/api/consultations/:id/oracle",{schema:{params,body:object({numbers:{type:'array',minItems:3,maxItems:3,items:{type:'integer',minimum:1,maximum:999999999}}},[])}},async request=>{
    const user=await service.authenticate(request.cookies.liuyao_session);
    return service.oracle(user.id,request.params.id,request.body.numbers);
  });
  app.post<{Params:{id:string};Body:{favorite:boolean}}>("/api/consultations/:id/favorite", {schema:{params,body:object({favorite:{type:"boolean"}},["favorite"])}}, async request=>{
    const user=await service.authenticate(request.cookies.liuyao_session);
    return service.favorite(user.id,request.params.id,request.body.favorite);
  });
  app.post<{Params:{id:string}}>("/api/consultations/:id/delete", {schema:{params}}, async request=>{
    const user=await service.authenticate(request.cookies.liuyao_session);
    await service.remove(user.id,request.params.id);return {ok:true};
  });
  app.post<{ Params: { id: string }; Body: CastConsultation }>("/api/consultations/:id/cast", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    schema: { params, body: object({ method: { type: "string", enum: ["manual", "three_coins", "simulated_three_coins"] }, values: { type: "array", minItems: 6, maxItems: 6, items: { type: "integer", enum: [6, 7, 8, 9] } } }, ["method"]) },
  }, async (request) => {
    const user = await service.authenticate(request.cookies.liuyao_session);
    return service.cast(user.id, request.params.id, request.body);
  });
  app.get<{ Params: { id: string } }>("/api/consultations/:id/ai", { schema: { params } }, async request => {
    const user = await service.authenticate(request.cookies.liuyao_session);
    return aiReader.conversation(user.id, request.params.id);
  });
  app.post<{ Params: { id: string }; Body: { kind: AiRunKind; question?: string } }>("/api/consultations/:id/ai", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: { params, body: object({ kind: { type: "string", enum: ["framing", "initial", "follow_up"] }, question: text(2000, 0) }, ["kind"]) },
  }, async (request, reply) => {
    const user = await service.authenticate(request.cookies.liuyao_session);
    if (!options.ai) throw new ServiceError(503, "ai_unavailable", "AI 服务尚未配置");
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(key)) throw new ServiceError(400, "idempotency_key_required", "请提供有效的请求标识");
    return reply.code(202).send(await options.ai.enqueue(user.id, request.params.id, key, request.body.kind, request.body.question));
  });
  return app;
}
