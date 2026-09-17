import { describe, expect, it } from "vitest";
import { analyzeSessionLog, type DeepSeekApiCallEvent } from "../src/index.js";

function call(overrides: Partial<DeepSeekApiCallEvent> = {}): DeepSeekApiCallEvent {
  return {
    version: "deepseek-api-call-v0.2",
    callId: "call-1",
    startedAt: "2026-09-05T00:00:00.000Z",
    durationMs: 100,
    firstByteMs: 20,
    firstReasoningMs: null,
    firstContentMs: 30,
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-v4-flash",
    phase: "structured",
    schemaName: "test",
    isRepair: false,
    thinking: "disabled",
    reasoningEffort: null,
    streamed: false,
    responseFormat: "json_object",
    requestChars: { system: 10, user: 20, schema: 5 },
    status: "success",
    httpStatus: 200,
    finishReason: "stop",
    responseId: "response-1",
    systemFingerprint: null,
    responseChars: 50,
    contentChars: 20,
    reasoningChars: 0,
    reasoningContent: null,
    usage: {
      promptTokens: 80,
      completionTokens: 20,
      totalTokens: 100,
      promptCacheHitTokens: 30,
      promptCacheMissTokens: 50,
      reasoningTokens: 0,
    },
    error: null,
    ...overrides,
  };
}

describe("analyzeSessionLog", () => {
  it("汇总调用、耗时、重试和 token 用量", () => {
    const events = [
      { type: "question_framed", data: { content: "test" } },
      { type: "api_call", data: call() },
      { type: "api_call", data: call({
        callId: "call-2",
        phase: "narrative",
        schemaName: null,
        responseFormat: "text",
        isRepair: true,
        status: "http_error",
        durationMs: 300,
        httpStatus: 429,
        usage: {
          promptTokens: 120,
          completionTokens: 0,
          totalTokens: 120,
          promptCacheHitTokens: null,
          promptCacheMissTokens: null,
          reasoningTokens: null,
        },
      }) },
    ];
    const summary = analyzeSessionLog(events.map((event) => JSON.stringify(event)).join("\n"));

    expect(summary.calls).toBe(2);
    expect(summary.successfulCalls).toBe(1);
    expect(summary.failedCalls).toBe(1);
    expect(summary.repairCalls).toBe(1);
    expect(summary.totalDurationMs).toBe(400);
    expect(summary.averageDurationMs).toBe(200);
    expect(summary.promptTokens).toBe(200);
    expect(summary.totalTokens).toBe(220);
    expect(summary.promptCacheHitTokens).toBe(30);
  });

  it("遇到损坏的日志行时给出行号", () => {
    expect(() => analyzeSessionLog("{}\nnot-json")).toThrow("第 2 行");
  });
});
