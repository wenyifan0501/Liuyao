import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { analyzeSessionLog } from "./logging/analyzeSession.js";

async function latestLogPath(): Promise<string> {
  const directory = join(process.cwd(), "logs", "sessions");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".jsonl"));
  if (names.length === 0) throw new Error("logs/sessions 下还没有会话日志，请先运行 npm run chat");
  const candidates = await Promise.all(names.map(async (name) => {
    const path = join(directory, name);
    return { path, modifiedAt: (await stat(path)).mtimeMs };
  }));
  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return candidates[0]!.path;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

async function main(): Promise<void> {
  const argument = process.argv[2];
  const path = argument ? resolve(argument) : await latestLogPath();
  const summary = analyzeSessionLog(await readFile(path, "utf8"));

  console.log(`日志：${path}`);
  console.log(`模型：${summary.models.join(", ") || "无 API 调用"}`);
  console.log(`调用：${summary.calls} 次（成功 ${summary.successfulCalls} / 失败 ${summary.failedCalls}）`);
  console.log(`阶段：结构化 ${summary.structuredCalls} / 叙事 ${summary.narrativeCalls} / 修复重试 ${summary.repairCalls}`);
  console.log(`耗时：累计 ${summary.totalDurationMs} ms / 平均 ${summary.averageDurationMs} ms / 最慢 ${summary.maxDurationMs} ms`);
  console.log(`Token：输入 ${formatInteger(summary.promptTokens)} / 输出 ${formatInteger(summary.completionTokens)} / 总计 ${formatInteger(summary.totalTokens)}`);
  console.log(`缓存：命中 ${formatInteger(summary.promptCacheHitTokens)} / 未命中 ${formatInteger(summary.promptCacheMissTokens)} / 推理 ${formatInteger(summary.reasoningTokens)}`);

  if (summary.details.length > 0) {
    console.table(summary.details.map((call, index) => ({
      "#": index + 1,
      阶段: call.phase,
      修复: call.isRepair ? "是" : "否",
      状态: call.status,
      HTTP: call.httpStatus ?? "-",
      耗时ms: call.durationMs,
      首包ms: call.firstByteMs ?? "-",
      首正文ms: call.firstContentMs ?? "-",
      输入Token: call.usage.promptTokens ?? "-",
      输出Token: call.usage.completionTokens ?? "-",
      推理Token: call.usage.reasoningTokens ?? "-",
      推理字符: call.reasoningChars,
      缓存命中: call.usage.promptCacheHitTokens ?? "-",
      结束原因: call.finishReason ?? "-",
    })));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
