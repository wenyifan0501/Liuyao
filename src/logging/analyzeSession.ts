import type { DeepSeekApiCallEvent } from "../ai/deepSeekGateway.js";

interface StoredSessionEvent {
  readonly type?: unknown;
  readonly data?: unknown;
}

export interface ApiCallSummary {
  readonly calls: number;
  readonly successfulCalls: number;
  readonly failedCalls: number;
  readonly structuredCalls: number;
  readonly narrativeCalls: number;
  readonly repairCalls: number;
  readonly totalDurationMs: number;
  readonly averageDurationMs: number;
  readonly maxDurationMs: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly promptCacheHitTokens: number;
  readonly promptCacheMissTokens: number;
  readonly models: readonly string[];
  readonly details: readonly DeepSeekApiCallEvent[];
}

function normalizeApiCallEvent(value: unknown): DeepSeekApiCallEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const version = candidate.version;
  if ((version !== "deepseek-api-call-v0.1" && version !== "deepseek-api-call-v0.2")
    || typeof candidate.callId !== "string"
    || typeof candidate.durationMs !== "number"
    || typeof candidate.model !== "string"
    || typeof candidate.status !== "string") return null;
  if (version === "deepseek-api-call-v0.2") return value as DeepSeekApiCallEvent;
  const legacy = value as Omit<DeepSeekApiCallEvent, "version" | "firstByteMs" | "firstReasoningMs" | "firstContentMs" | "reasoningEffort" | "streamed" | "contentChars" | "reasoningChars" | "reasoningContent"> & { readonly responseChars: number };
  return {
    ...legacy,
    version: "deepseek-api-call-v0.2",
    firstByteMs: null,
    firstReasoningMs: null,
    firstContentMs: null,
    reasoningEffort: null,
    streamed: false,
    contentChars: legacy.responseChars,
    reasoningChars: 0,
    reasoningContent: null,
  };
}

function numberOrZero(value: number | null | undefined): number {
  return value ?? 0;
}

export function analyzeSessionLog(text: string): ApiCallSummary {
  const details: DeepSeekApiCallEvent[] = [];

  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (line.trim() === "") continue;
    let stored: StoredSessionEvent;
    try {
      stored = JSON.parse(line) as StoredSessionEvent;
    } catch {
      throw new Error(`日志第 ${index + 1} 行不是有效 JSON`);
    }
    if (stored.type === "api_call") {
      const apiCall = normalizeApiCallEvent(stored.data);
      if (apiCall) details.push(apiCall);
    }
  }

  const totalDurationMs = details.reduce((sum, call) => sum + call.durationMs, 0);
  return {
    calls: details.length,
    successfulCalls: details.filter((call) => call.status === "success").length,
    failedCalls: details.filter((call) => call.status !== "success").length,
    structuredCalls: details.filter((call) => call.phase === "structured").length,
    narrativeCalls: details.filter((call) => call.phase === "narrative").length,
    repairCalls: details.filter((call) => call.isRepair).length,
    totalDurationMs,
    averageDurationMs: details.length === 0 ? 0 : Math.round(totalDurationMs / details.length),
    maxDurationMs: details.reduce((max, call) => Math.max(max, call.durationMs), 0),
    promptTokens: details.reduce((sum, call) => sum + numberOrZero(call.usage.promptTokens), 0),
    completionTokens: details.reduce((sum, call) => sum + numberOrZero(call.usage.completionTokens), 0),
    reasoningTokens: details.reduce((sum, call) => sum + numberOrZero(call.usage.reasoningTokens), 0),
    totalTokens: details.reduce((sum, call) => sum + numberOrZero(call.usage.totalTokens), 0),
    promptCacheHitTokens: details.reduce((sum, call) => sum + numberOrZero(call.usage.promptCacheHitTokens), 0),
    promptCacheMissTokens: details.reduce((sum, call) => sum + numberOrZero(call.usage.promptCacheMissTokens), 0),
    models: [...new Set(details.map((call) => call.model))],
    details,
  };
}
