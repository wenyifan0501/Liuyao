import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  DeepSeekGateway,
  JsonlSessionLogger,
  buildChart,
  frameConsultationQuestion,
  loadLiuyaoSkillBundle,
  resolveClarificationAnswer,
  resolveCalendarContext,
  runDirectFollowUp,
  runDirectInterpretation,
  simulateThreeCoinCasting,
} from "./index.js";
import type {
  CastValue,
  ConsultationMessage,
  DirectConsultationState,
  InterpretationTopic,
  SessionLogMode,
  SixRelative,
} from "./index.js";

config({ quiet: true });

const TOPICS: readonly { readonly key: string; readonly value: InterpretationTopic; readonly label: string }[] = [
  { key: "1", value: "career", label: "事业 / 求职" },
  { key: "2", value: "relationship", label: "感情 / 关系" },
  { key: "3", value: "finance", label: "财运 / 回款" },
  { key: "4", value: "cooperation", label: "合作 / 谈判" },
  { key: "5", value: "exam", label: "考试 / 申请" },
  { key: "6", value: "daily", label: "日运" },
  { key: "7", value: "travel", label: "出行" },
  { key: "8", value: "lost_property", label: "失物" },
  { key: "9", value: "other", label: "其他" },
];

const RELATIVE_LABELS: Readonly<Record<SixRelative, string>> = {
  siblings: "兄弟",
  offspring: "子孙",
  parents: "父母",
  wealth: "妻财",
  officials: "官鬼",
};

function booleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error(`${name} 必须是 true 或 false`);
}

function enumEnv<const T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`${name} 必须是 ${allowed.join("、")} 之一`);
}

async function askRequired(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  while (true) {
    const answer = (await rl.question(prompt)).trim();
    if (answer !== "") return answer;
    console.log("请输入内容。\n");
  }
}

async function chooseTopic(rl: ReturnType<typeof createInterface>): Promise<InterpretationTopic> {
  console.log("\n请选择占问主题：");
  TOPICS.forEach((topic) => console.log(`  ${topic.key}. ${topic.label}`));
  while (true) {
    const answer = (await rl.question("主题 [默认 9]：")).trim() || "9";
    const selected = TOPICS.find((topic) => topic.key === answer);
    if (selected) return selected.value;
    console.log("请输入 1 至 9。\n");
  }
}

function parseCasting(value: string): readonly CastValue[] | null {
  const values = value.split(/[\s,，、]+/).filter(Boolean).map(Number);
  if (values.length !== 6 || values.some((item) => ![6, 7, 8, 9].includes(item))) return null;
  return values as CastValue[];
}

async function chooseCasting(rl: ReturnType<typeof createInterface>): Promise<{
  readonly method: "simulated_three_coins" | "manual";
  readonly values: readonly CastValue[];
}> {
  console.log("\n起卦方式：\n  1. 程序模拟三枚铜钱\n  2. 输入自己投掷的六次结果");
  while (true) {
    const method = (await rl.question("选择 [默认 1]：")).trim() || "1";
    if (method === "1") return { method: "simulated_three_coins", values: simulateThreeCoinCasting() };
    if (method === "2") {
      const raw = await rl.question("按初爻到上爻输入六个 6/7/8/9（空格分隔）：");
      const values = parseCasting(raw);
      if (values) return { method: "manual", values };
      console.log("输入无效。必须恰好是六个 6、7、8 或 9。\n");
      continue;
    }
    console.log("请输入 1 或 2。\n");
  }
}

function showChart(chart: ReturnType<typeof buildChart>): void {
  console.log("\n排盘完成");
  console.log(`本卦：${chart.primaryHexagram.name}（${chart.primaryHexagram.palace}宫）`);
  console.log(`变卦：${chart.changedHexagram.name}`);
  console.log(`动爻：${chart.changingLines.length === 0 ? "无" : chart.changingLines.join("、")}`);
  console.log(`月建：${chart.timeContext.monthBranch}  日辰：${chart.timeContext.dayStem}${chart.timeContext.dayBranch}  旬空：${chart.timeContext.voidBranches.join("、")}`);
  console.log("\n六爻（上爻在上）：");
  [...chart.primaryLines].reverse().forEach((line) => {
    const mark = line.yinYang === "yang" ? "━━━━━━" : "━━  ━━";
    const moving = line.moving ? " 动" : "";
    const relation = RELATIVE_LABELS[line.relative];
    const selfResponse = line.isSelf ? " 世" : line.isResponse ? " 应" : "";
    console.log(`${line.position} ${line.spirit} ${relation}${line.stem}${line.branch} ${mark}${moving}${selfResponse}`);
  });
}

function message(role: "user" | "assistant", kind: ConsultationMessage["kind"], content: string): ConsultationMessage {
  return { id: randomUUID(), role, kind, content, createdAt: new Date().toISOString() };
}

async function main(): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    console.error("缺少 DEEPSEEK_API_KEY。请复制 .env.example 为 .env，并填入本地 API Key。\n");
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input, output });
  const sessionId = randomUUID();
  const logMode = enumEnv("LIUYAO_LOG_MODE", ["off", "compact", "diagnostic"] as const, "diagnostic") satisfies SessionLogMode;
  const thinking = enumEnv("DEEPSEEK_THINKING", ["enabled", "disabled"] as const, "enabled");
  const reasoningEffort = enumEnv("DEEPSEEK_REASONING_EFFORT", ["low", "high", "max"] as const, "high");
  const stream = booleanEnv("DEEPSEEK_STREAM", true);
  const logger = new JsonlSessionLogger({ sessionId, mode: logMode });
  const streamedNarrativeCalls = new Set<string>();
  const progressCharacters = new Map<string, number>();
  try {
    console.log("\n六爻对话原型 · DeepSeek\n");
    console.log(logMode === "off" ? "本次日志：已关闭\n" : `本次日志（${logMode}）：${logger.path}\n`);
    await logger.append("session_started", {
      model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
      baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
      apiKeyConfigured: true,
      thinking,
      reasoningEffort: thinking === "enabled" ? reasoningEffort : null,
      stream,
      logMode,
      pipelineMode: "direct_single_pass",
      framingReasoningEffort: "low",
    });
    const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash";
    const baseUrl = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
    const handleProgress = (event: Parameters<NonNullable<ConstructorParameters<typeof DeepSeekGateway>[0]["onProgress"]>>[0]): void => {
      if (event.phase === "narrative" && event.kind === "content") {
        if (!streamedNarrativeCalls.has(event.callId)) {
          streamedNarrativeCalls.add(event.callId);
          output.write("\n");
        }
        output.write(event.delta);
        return;
      }
      const accumulated = (progressCharacters.get(event.callId) ?? 0) + event.delta.length;
      if (accumulated >= 500) {
        output.write("·");
        progressCharacters.set(event.callId, accumulated % 500);
      } else {
        progressCharacters.set(event.callId, accumulated);
      }
    };
    const gateway = new DeepSeekGateway({
      apiKey,
      model,
      baseUrl,
      thinking,
      reasoningEffort,
      stream,
      captureReasoning: logMode === "diagnostic",
      onCall: (event) => logger.append("api_call", event),
      onProgress: handleProgress,
    });
    const framingGateway = new DeepSeekGateway({
      apiKey,
      model,
      baseUrl,
      thinking: "enabled",
      reasoningEffort: "low",
      stream,
      captureReasoning: logMode === "diagnostic",
      onCall: (event) => logger.append("api_call", event),
      onProgress: handleProgress,
    });
    const skill = await loadLiuyaoSkillBundle(join(process.cwd(), "Skill", "liuyao"));
    const topic = await chooseTopic(rl);
    const question = await askRequired(rl, "\n你想占问什么？\n> ");
    const timeWindowInput = (await rl.question("关注的时间范围（可留空）：")).trim();
    const backgroundInput = (await rl.question("补充背景（可留空，多条用分号分隔）：")).trim();
    let background = backgroundInput === "" ? [] : backgroundInput.split(/[;；]/).map((item) => item.trim()).filter(Boolean);
    let normalizedQuestion = question;
    for (let pass = 1; pass <= 2; pass++) {
      console.log("\n正在确认问题边界……");
      const framing = await frameConsultationQuestion({
        gateway: framingGateway,
        topic,
        question: normalizedQuestion,
        timeWindow: timeWindowInput || null,
        background,
      });
      await logger.append("question_framing", { pass, ...framing });
      normalizedQuestion = framing.normalizedQuestion;
      if (framing.status === "ready" || !framing.clarifyingQuestion) break;
      console.log(`\n${framing.clarifyingQuestion}`);
      if (framing.choices.length > 0) framing.choices.forEach((choice, index) => console.log(`  ${index + 1}. ${choice}`));
      const clarificationInput = await askRequired(rl, "> ");
      const clarification = resolveClarificationAnswer(clarificationInput, framing.choices);
      background = [...background, `起卦前确认：${clarification}`];
      await logger.append("question_clarified", { question: framing.clarifyingQuestion, answer: clarification });
    }
    await logger.append("question_framed", {
      topic,
      originalQuestion: question,
      question: normalizedQuestion,
      timeWindow: timeWindowInput || null,
      background,
    });
    const casting = await chooseCasting(rl);
    const defaultTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
    const timezone = (await rl.question(`时区 [默认 ${defaultTimezone}]：`)).trim() || defaultTimezone;
    const calendar = resolveCalendarContext({ castAt: new Date().toISOString(), timezone });
    const chart = buildChart({ method: casting.method, values: casting.values, calendar });
    await logger.append("casting_completed", casting);
    await logger.append("chart_created", chart);
    showChart(chart);

    const chartId = randomUUID();
    const consultationId = randomUUID();
    console.log("\n正在生成首轮占断……\n");
    const narrativeCallsBeforeInitial = streamedNarrativeCalls.size;
    const consultation = {
      chartId,
      chart,
      topic,
      question: normalizedQuestion,
      timeWindow: timeWindowInput || null,
      background,
    };
    const first = await runDirectInterpretation({ gateway, skill, consultation });
    await logger.append("initial_interpretation", {
      mode: "direct",
      report: first.report,
      auditIssues: first.auditIssues,
    });
    if (streamedNarrativeCalls.size > narrativeCallsBeforeInitial) console.log("\n");
    else console.log(first.report);
    if (first.auditIssues.length > 0) console.log(`[事实审查发现 ${first.auditIssues.length} 项五行方向疑点，已写入日志]`);

    let state: DirectConsultationState = {
      consultationId,
      chartId,
      topic,
      originalQuestion: normalizedQuestion,
      timeWindow: timeWindowInput || null,
      background,
      chart,
      initialReport: first.report,
      messages: [
        message("user", "question", normalizedQuestion),
        message("assistant", "interpretation", first.report),
      ],
    };

    console.log("\n可以继续追问。输入 /exit 结束。\n");
    while (true) {
      const followUpQuestion = (await rl.question("你：")).trim();
      if (followUpQuestion === "/exit") break;
      if (followUpQuestion === "") continue;
      const followUpUserMessage = message("user", "follow_up", followUpQuestion);
      await logger.append("follow_up_user", { content: followUpQuestion });
      console.log("\n正在结合原卦分析……");
      const narrativeCallsBeforeFollowUp = streamedNarrativeCalls.size;
      const result = await runDirectFollowUp({ gateway, skill, state, question: followUpQuestion });
      await logger.append("follow_up_assistant", result);
      if (streamedNarrativeCalls.size > narrativeCallsBeforeFollowUp) console.log("\n");
      else console.log(`\nAI：${result.report}\n`);
      if (result.auditIssues.length > 0) console.log(`[事实审查发现 ${result.auditIssues.length} 项五行方向疑点，已写入日志]\n`);
      state = {
        ...state,
        messages: [
          ...state.messages,
          followUpUserMessage,
          message("assistant", "follow_up", result.report),
        ],
      };
    }
    await logger.append("session_completed", { messageCount: state.messages.length });
    console.log(logMode === "off" ? "\n本次咨询已结束。\n" : `\n本次咨询已结束。日志已保存到：${logger.path}\n`);
  } catch (error) {
    await logger.append("session_error", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await logger.flush();
    rl.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n运行失败：${message}\n`);
  process.exitCode = 1;
});
