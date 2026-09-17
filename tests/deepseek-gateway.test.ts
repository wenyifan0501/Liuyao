import { describe, expect, it } from "vitest";
import { DeepSeekGateway, simulateThreeCoinCasting } from "../src/index.js";
import type { DeepSeekApiCallEvent, StructuredGenerationRequest } from "../src/index.js";

describe("three-coin simulator", () => {
  it("preserves three-coin sums and bottom-to-top result count", () => {
    expect(simulateThreeCoinCasting(() => 0)).toEqual([6, 6, 6, 6, 6, 6]);
    expect(simulateThreeCoinCasting(() => 1)).toEqual([9, 9, 9, 9, 9, 9]);
  });
});

describe("DeepSeek gateway", () => {
  it("sends JSON Output requests to the official chat-completions shape", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};
    const events: DeepSeekApiCallEvent[] = [];
    const mockFetch: typeof fetch = async (url, init) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        id: "response-1",
        system_fingerprint: "fp-test",
        choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }],
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
          prompt_cache_hit_tokens: 80,
          prompt_cache_miss_tokens: 40,
          completion_tokens_details: { reasoning_tokens: 0 }
        }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const gateway = new DeepSeekGateway({
      apiKey: "test-key",
      stream: false,
      fetchImplementation: mockFetch,
      onCall: (event) => { events.push(event); },
    });
    const request: StructuredGenerationRequest = {
      systemPrompt: "输出 json",
      userPrompt: "test",
      schemaName: "test_schema",
      schema: { type: "object" },
    };
    await expect(gateway.generateObject(request)).resolves.toEqual({ ok: true });
    expect(capturedUrl).toBe("https://api.deepseek.com/chat/completions");
    expect(capturedBody).toMatchObject({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    });
    expect(JSON.stringify(capturedBody)).toContain("目标 JSON Schema");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: "success",
      phase: "structured",
      model: "deepseek-v4-flash",
      httpStatus: 200,
      finishReason: "stop",
      responseId: "response-1",
      systemFingerprint: "fp-test",
      usage: {
        promptTokens: 120,
        completionTokens: 30,
        totalTokens: 150,
        promptCacheHitTokens: 80,
        promptCacheMissTokens: 40,
        reasoningTokens: 0,
      },
    });
    expect(JSON.stringify(events)).not.toContain("test-key");
  });

  it("returns readable API errors without including the API key", async () => {
    const mockFetch: typeof fetch = async () => new Response(
      JSON.stringify({ error: { message: "insufficient balance" } }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
    const gateway = new DeepSeekGateway({ apiKey: "secret-key-must-not-leak", stream: false, fetchImplementation: mockFetch });
    let caught = "";
    try {
      await gateway.generateText({ systemPrompt: "system", userPrompt: "user" });
    } catch (error) {
      caught = error instanceof Error ? error.message : String(error);
    }
    expect(caught).toContain("insufficient balance");
    expect(caught).not.toContain("secret-key-must-not-leak");
  });

  it("rejects empty and truncated responses", async () => {
    const emptyFetch: typeof fetch = async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: "" } }],
    }), { status: 200 });
    const truncatedFetch: typeof fetch = async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "length", message: { content: "partial" } }],
    }), { status: 200 });
    await expect(new DeepSeekGateway({ apiKey: "x", stream: false, fetchImplementation: emptyFetch })
      .generateText({ systemPrompt: "s", userPrompt: "u" })).rejects.toThrow("empty content");
    await expect(new DeepSeekGateway({ apiKey: "x", stream: false, fetchImplementation: truncatedFetch })
      .generateText({ systemPrompt: "s", userPrompt: "u" })).rejects.toThrow("truncated");
  });

  it("streams reasoning and content while retaining final usage telemetry", async () => {
    const encoder = new TextEncoder();
    const sse = [
      'data: {"id":"stream-1","choices":[{"delta":{"reasoning_content":"先分析"},"finish_reason":null}]}\n\n',
      'data: {"id":"stream-1","choices":[{"delta":{"content":"最终答案"},"finish_reason":null}]}\n\n',
      'data: {"id":"stream-1","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":8,"total_tokens":18,"completion_tokens_details":{"reasoning_tokens":3}}}\n\n',
      "data: [DONE]\n\n",
    ];
    const mockFetch: typeof fetch = async () => new Response(new ReadableStream({
      start(controller) {
        for (const item of sse) controller.enqueue(encoder.encode(item));
        controller.close();
      },
    }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    const progress: string[] = [];
    const calls: DeepSeekApiCallEvent[] = [];
    const gateway = new DeepSeekGateway({
      apiKey: "x",
      captureReasoning: true,
      fetchImplementation: mockFetch,
      onProgress: (event) => { progress.push(`${event.kind}:${event.delta}`); },
      onCall: (event) => { calls.push(event); },
    });

    await expect(gateway.generateText({ systemPrompt: "s", userPrompt: "u" })).resolves.toBe("最终答案");
    expect(progress).toEqual(["reasoning:先分析", "content:最终答案"]);
    expect(calls[0]).toMatchObject({
      streamed: true,
      thinking: "enabled",
      reasoningEffort: "high",
      reasoningChars: 3,
      contentChars: 4,
      reasoningContent: "先分析",
      finishReason: "stop",
      usage: { totalTokens: 18, reasoningTokens: 3 },
    });
  });
});
