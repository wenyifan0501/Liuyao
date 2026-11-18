import {runOracleReading,loadOracleSkillBundle,ORACLE_RULES_VERSION} from "../../src/divination/interpretation.js";
import { join, resolve } from "node:path";
import { DeepSeekGateway } from "../../src/ai/deepSeekGateway.js";
import { loadLiuyaoSkillBundle } from "../../src/ai/skillBundle.js";
import { runDirectInterpretation, runDirectFollowUp } from "../../src/ai/directInterpretation.js";
import { frameConsultationQuestion, resolveClarificationAnswer } from "../../src/consultation/questionFraming.js";
import type { AiGateway } from "../../src/ai/types.js";
import { digest } from "./security.js";
import { WebAi, type AiProcessor } from "./ai.js";
import type { Database } from "./database.js";
import { quotaEnforced } from "./quota.js";

export async function loadWebAi(db: Database): Promise<WebAi | undefined> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey || process.env.WEB_AI_ENABLED === "false") return undefined;
  const skillRoot = resolve(process.env.SKILL_ROOT ?? "Skill");
  const skill = await loadLiuyaoSkillBundle(resolve(process.env.LIUYAO_SKILL_PATH ?? join(skillRoot, "liuyao")));
  const oracleSkills = await loadOracleSkillBundle(skillRoot);
  const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
  const thinking = process.env.DEEPSEEK_THINKING ?? "enabled";
  const effort = process.env.DEEPSEEK_REASONING_EFFORT ?? "high";
  if (!["enabled", "disabled"].includes(thinking) || !["low", "high", "max"].includes(effort)) throw new Error("AI 配置不正确");
  const processor: AiProcessor = {
    model, skillHash: digest(JSON.stringify(skill)+ORACLE_RULES_VERSION+JSON.stringify(oracleSkills)),
    async execute(input, progress, telemetry) {
      let content = "";
      const gateway = new DeepSeekGateway({
        apiKey, model, baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
        thinking: thinking as "enabled" | "disabled",
        reasoningEffort: input.kind === "framing" ? "low" : effort as "low" | "high" | "max",
        stream: process.env.DEEPSEEK_STREAM !== "false", captureReasoning: false, timeoutMs: 180_000,
        onProgress: async event => {
          if (input.kind !== "framing" && event.kind === "content") { content += event.delta; await progress(content); }
        },
        onCall: async event => { await telemetry({ model: event.model, status: event.status, httpStatus: event.httpStatus, durationMs: event.durationMs, usage: event.usage, finishReason: event.finishReason }); },
      });
      const checkSize = (system: string, user: string, schema = "") => {
        if (Buffer.byteLength(system + user + schema, "utf8") + 1024 > 96_000) throw new Error("Context exceeds web input budget");
      };
      const bounded: AiGateway = {
        generateObject(request) { checkSize(request.systemPrompt, request.userPrompt, JSON.stringify(request.schema)); return gateway.generateObject(request); },
        generateText(request) { checkSize(request.systemPrompt, request.userPrompt); return gateway.generateText({ ...request, maxTokens: Math.min(request.maxTokens ?? 24000, 24000) }); },
      };
      const c = input.consultation;
      const framing = input.conversation.framing;
      let background = framing?.background ?? c.background;
      const question = framing?.normalizedQuestion ?? c.question;
      if (input.kind === "framing") {
        if (input.question) background = [...background, `起卦前确认：${resolveClarificationAnswer(input.question, framing?.choices ?? [])}`];
        const result = await frameConsultationQuestion({ gateway: bounded, method: c.method ?? "liuyao", topic: c.topic, question, timeWindow: c.timeWindow, background });
        return { framing: { ...result, choices: [...result.choices], background: [...background] } };
      }
      if (c.oracle) {
        const turns = input.conversation.runs.filter(r => r.status === "succeeded" && r.kind !== "framing").map(r => ({ kind: r.kind as "initial" | "follow_up", question: r.kind === "initial" ? question : r.question, answer: r.text }));
        return runOracleReading({ gateway: bounded, skills: oracleSkills, consultation: { topic: c.topic, question, timeWindow: c.timeWindow, background, oracle: c.oracle }, turns, followUp: input.kind === "follow_up" ? input.question : null });
      }
      if (!c.chart) throw new Error("Missing fixed chart");
      const consultation = { chartId: c.id, chart: c.chart, topic: c.topic, question, timeWindow: c.timeWindow, background };
      if (input.kind === "initial") return runDirectInterpretation({ gateway: bounded, skill, consultation });
      const completed = input.conversation.runs.filter(r => r.status === "succeeded" && r.kind !== "framing");
      const initial = completed.find(r => r.kind === "initial");
      if (!initial) throw new Error("Missing initial interpretation");
      const messages = completed.flatMap(r => [
        { id: `${r.id}:user`, role: "user" as const, kind: r.kind === "initial" ? "question" as const : "follow_up" as const, content: r.kind === "initial" ? question : r.question, createdAt: r.createdAt },
        { id: r.id, role: "assistant" as const, kind: r.kind === "initial" ? "interpretation" as const : "follow_up" as const, content: r.text, createdAt: r.createdAt },
      ]);
      return runDirectFollowUp({ gateway: bounded, skill, question: input.question, state: { consultationId: c.id, chartId: c.id, chart: c.chart, topic: c.topic, originalQuestion: question, timeWindow: c.timeWindow, background, initialReport: initial.text, messages } });
    },
  };
  const dailyTokens = Number(process.env.WEB_AI_DAILY_TOKEN_BUDGET ?? 2400000);
  const userDailyCalls = Number(process.env.WEB_AI_USER_DAILY_CALLS ?? 12);
  if (![dailyTokens, userDailyCalls].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("AI 预算必须为非负整数");
  return new WebAi(db, processor, { dailyTokens, userDailyCalls, enforced: quotaEnforced });
}
