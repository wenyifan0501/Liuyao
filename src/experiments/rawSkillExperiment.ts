import { randomUUID } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { config } from "dotenv";
import { DeepSeekGateway } from "../ai/deepSeekGateway.js";
import { deriveChartFacts } from "../domain/derivedFacts.js";
import type { LiuyaoChart } from "../domain/types.js";
import { JsonlSessionLogger } from "../logging/sessionLogger.js";

config({ quiet: true });

interface StoredEvent {
  readonly type?: string;
  readonly data?: unknown;
}

interface FramedQuestion {
  readonly topic: string;
  readonly question: string;
  readonly timeWindow: string | null;
  readonly background: readonly string[];
}

async function latestSessionPath(): Promise<string> {
  const directory = join(process.cwd(), "logs", "sessions");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".jsonl"));
  if (names.length === 0) throw new Error("没有可用于实验的会话日志");
  const candidates = await Promise.all(names.map(async (name) => {
    const path = join(directory, name);
    return { path, modifiedAt: (await stat(path)).mtimeMs };
  }));
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return candidates[0]!.path;
}

function parseEvents(text: string): readonly StoredEvent[] {
  return text.split(/\r?\n/u).filter((line) => line.trim() !== "").map((line) => JSON.parse(line) as StoredEvent);
}

function getInputs(events: readonly StoredEvent[]): { readonly question: FramedQuestion; readonly chart: LiuyaoChart } {
  const question = events.find((event) => event.type === "question_framed")?.data as FramedQuestion | undefined;
  const chart = events.find((event) => event.type === "chart_created")?.data as LiuyaoChart | undefined;
  if (!question?.question || !chart?.primaryHexagram) throw new Error("日志缺少 question_framed 或 chart_created");
  return { question, chart };
}

async function loadRawSkill(skillDirectory: string): Promise<string> {
  const paths = [
    "SKILL.md",
    join("references", "workflow.md"),
    join("references", "useful-gods.md"),
    join("references", "interpretation.md"),
    join("references", "direct-reading.md"),
    join("references", "style-and-safety.md"),
  ];
  const sections = await Promise.all(paths.map((path) => readFile(join(skillDirectory, path), "utf8")));
  return sections.join("\n\n---\n\n");
}

async function main(): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error("缺少 DEEPSEEK_API_KEY");
  const sourcePath = process.argv[2] ? resolve(process.argv[2]) : await latestSessionPath();
  const { question, chart } = getInputs(parseEvents(await readFile(sourcePath, "utf8")));
  const rawSkill = await loadRawSkill(join(process.cwd(), "Skill"));
  const experimentId = `raw-${randomUUID()}`;
  const logger = new JsonlSessionLogger({
    sessionId: experimentId,
    logDirectory: join(process.cwd(), "logs", "experiments"),
    mode: "diagnostic",
  });
  let printedContent = false;
  let progressChars = 0;
  const gateway = new DeepSeekGateway({
    apiKey,
    model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-pro",
    baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com",
    thinking: "enabled",
    reasoningEffort: "high",
    stream: true,
    captureReasoning: true,
    timeoutMs: 300_000,
    onCall: (event) => logger.append("api_call", event),
    onProgress: (event) => {
      if (event.kind === "content") {
        if (!printedContent) {
          printedContent = true;
          process.stdout.write("\n\n");
        }
        process.stdout.write(event.delta);
        return;
      }
      progressChars += event.delta.length;
      if (progressChars >= 600) {
        process.stdout.write("·");
        progressChars %= 600;
      }
    },
  });

  await logger.append("experiment_started", {
    variant: "raw_skill_single_pass",
    sourcePath,
    model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-pro",
    thinking: "enabled",
    reasoningEffort: "high",
  });
  await logger.append("experiment_input", { question, chart, computedFacts: deriveChartFacts(chart) });

  console.log("Raw Skill A/B 实验：直接生成最终占断");
  console.log(`固定样本：${chart.primaryHexagram.name} → ${chart.changedHexagram.name}`);
  console.log("思考中", "");

  try {
    const answer = await gateway.generateText({
      systemPrompt: [
        "你现在直接作为一位经验丰富的六爻命理师，为用户完成一次完整占断。下面的 Skill 是你的专业方法与边界。",
        "这是 Raw Skill 单次生成实验：直接输出给用户看的自然语言长文，不输出 JSON，不填写网站 Schema，不讨论工作流。",
        "先把本卦、变卦、用神、世应、日月与动变组织成一条贯穿全文的卦象主线，再映射用户处境。不要把爻逐条翻译后简单相加。",
        "要分析用户表面问题下的真正困惑，比较至少两种合理解释，说明为什么最终采用当前解释；有复杂背景时应充分展开，不刻意压缩篇幅。",
        "现实建议只能作为卦象判断后的简短落点，不能取代占断。没有真正能区分两条解释路径的关键问题时，不必为了互动而强行提问。",
        "程序提供的 computedFacts 只负责防止硬性术理事实算错，不替你决定吉凶、主次和现实映射。",
        rawSkill,
      ].join("\n\n"),
      userPrompt: [
        "<consultation>",
        JSON.stringify({ ...question, chart, computedFacts: deriveChartFacts(chart) }, null, 2),
        "</consultation>",
      ].join("\n"),
      maxTokens: 32_000,
    });
    if (printedContent) process.stdout.write("\n\n");
    else console.log(answer);
    await logger.append("raw_answer", { answer });
    await logger.append("experiment_completed", { answerChars: answer.length });
    console.log(`实验日志：${logger.path}`);
  } catch (error) {
    await logger.append("experiment_error", { message: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    await logger.flush();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
