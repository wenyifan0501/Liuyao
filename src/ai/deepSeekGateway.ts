import { randomUUID } from "node:crypto";
import type { AiGateway, StructuredGenerationRequest, TextGenerationRequest } from "./types.js";

export type DeepSeekThinking = "enabled" | "disabled";
export type DeepSeekReasoningEffort = "low" | "high" | "max";

export interface DeepSeekProgressEvent {
  readonly callId: string;
  readonly phase: "structured" | "narrative";
  readonly kind: "reasoning" | "content";
  readonly delta: string;
  readonly elapsedMs: number;
}

export interface DeepSeekGatewayOptions {
  readonly apiKey: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly thinking?: DeepSeekThinking;
  readonly reasoningEffort?: DeepSeekReasoningEffort;
  readonly stream?: boolean;
  readonly captureReasoning?: boolean;
  readonly timeoutMs?: number;
  readonly fetchImplementation?: typeof fetch;
  readonly onCall?: (event: DeepSeekApiCallEvent) => void | Promise<void>;
  readonly onProgress?: (event: DeepSeekProgressEvent) => void | Promise<void>;
}

export interface DeepSeekTokenUsage {
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
  readonly promptCacheHitTokens: number | null;
  readonly promptCacheMissTokens: number | null;
  readonly reasoningTokens: number | null;
}

export interface DeepSeekApiCallEvent {
  readonly version: "deepseek-api-call-v0.2";
  readonly callId: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly firstByteMs: number | null;
  readonly firstReasoningMs: number | null;
  readonly firstContentMs: number | null;
  readonly endpoint: string;
  readonly model: string;
  readonly phase: "structured" | "narrative";
  readonly schemaName: string | null;
  readonly isRepair: boolean;
  readonly thinking: DeepSeekThinking;
  readonly reasoningEffort: DeepSeekReasoningEffort | null;
  readonly streamed: boolean;
  readonly responseFormat: "text" | "json_object";
  readonly requestChars: {
    readonly system: number;
    readonly user: number;
    readonly schema: number;
  };
  readonly status: "success" | "http_error" | "invalid_response" | "network_error";
  readonly httpStatus: number | null;
  readonly finishReason: string | null;
  readonly responseId: string | null;
  readonly systemFingerprint: string | null;
  readonly responseChars: number;
  readonly contentChars: number;
  readonly reasoningChars: number;
  readonly reasoningContent: string | null;
  readonly usage: DeepSeekTokenUsage;
  readonly error: string | null;
}

interface DeepSeekUsagePayload {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
  readonly prompt_cache_hit_tokens?: number;
  readonly prompt_cache_miss_tokens?: number;
  readonly completion_tokens_details?: { readonly reasoning_tokens?: number };
}

interface DeepSeekResponse {
  readonly id?: string;
  readonly system_fingerprint?: string;
  readonly choices?: readonly {
    readonly finish_reason?: string | null;
    readonly message?: {
      readonly content?: string | null;
      readonly reasoning_content?: string | null;
    };
  }[];
  readonly usage?: DeepSeekUsagePayload;
  readonly error?: { readonly message?: string };
}

interface DeepSeekStreamChunk {
  readonly id?: string;
  readonly system_fingerprint?: string;
  readonly choices?: readonly {
    readonly finish_reason?: string | null;
    readonly delta?: {
      readonly content?: string | null;
      readonly reasoning_content?: string | null;
    };
  }[];
  readonly usage?: DeepSeekUsagePayload | null;
}

interface CallMetadata {
  readonly phase: "structured" | "narrative";
  readonly schemaName: string | null;
  readonly isRepair: boolean;
  readonly schemaChars: number;
}

const EMPTY_USAGE: DeepSeekTokenUsage = {
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  promptCacheHitTokens: null,
  promptCacheMissTokens: null,
  reasoningTokens: null,
};

function usageOf(usage: DeepSeekUsagePayload | null | undefined): DeepSeekTokenUsage {
  if (!usage) return EMPTY_USAGE;
  return {
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    promptCacheHitTokens: usage.prompt_cache_hit_tokens ?? null,
    promptCacheMissTokens: usage.prompt_cache_miss_tokens ?? null,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
  };
}

function parseBoolean(value: boolean | undefined, fallback: boolean): boolean {
  return value ?? fallback;
}

export class DeepSeekGateway implements AiGateway {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly thinking: DeepSeekThinking;
  private readonly reasoningEffort: DeepSeekReasoningEffort;
  private readonly stream: boolean;
  private readonly captureReasoning: boolean;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly onCall?: (event: DeepSeekApiCallEvent) => void | Promise<void>;
  private readonly onProgress?: (event: DeepSeekProgressEvent) => void | Promise<void>;

  constructor(options: DeepSeekGatewayOptions) {
    if (options.apiKey.trim() === "") throw new Error("DeepSeek API key is required");
    this.apiKey = options.apiKey;
    this.model = options.model ?? "deepseek-v4-flash";
    this.baseUrl = (options.baseUrl ?? "https://api.deepseek.com").replace(/\/+$/, "");
    this.thinking = options.thinking ?? "enabled";
    this.reasoningEffort = options.reasoningEffort ?? "high";
    this.stream = parseBoolean(options.stream, true);
    this.captureReasoning = parseBoolean(options.captureReasoning, false);
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    if (options.onCall) this.onCall = options.onCall;
    if (options.onProgress) this.onProgress = options.onProgress;
  }

  private async emit(event: DeepSeekApiCallEvent): Promise<void> {
    if (this.onCall) await this.onCall(event);
  }

  private async complete(
    messages: readonly { readonly role: "system" | "user"; readonly content: string }[],
    responseFormat: "text" | "json_object",
    metadata: CallMetadata,
    maxTokens?: number,
  ): Promise<string> {
    const callId = randomUUID();
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const endpoint = `${this.baseUrl}/chat/completions`;
    let httpStatus: number | null = null;
    let responseId: string | null = null;
    let systemFingerprint: string | null = null;
    let finishReason: string | null = null;
    let usage: DeepSeekTokenUsage = EMPTY_USAGE;
    let responseChars = 0;
    let content = "";
    let reasoning = "";
    let reasoningChars = 0;
    let firstByteMs: number | null = null;
    let firstReasoningMs: number | null = null;
    let firstContentMs: number | null = null;
    let terminalEventEmitted = false;

    const elapsed = (): number => Math.round(performance.now() - started);
    const pushDelta = async (kind: "reasoning" | "content", delta: string): Promise<void> => {
      if (delta === "") return;
      const now = elapsed();
      if (kind === "reasoning") {
        if (firstReasoningMs === null) firstReasoningMs = now;
        reasoningChars += delta.length;
        if (this.captureReasoning) reasoning += delta;
      } else {
        if (firstContentMs === null) firstContentMs = now;
        content += delta;
      }
      if (this.onProgress) await this.onProgress({ callId, phase: metadata.phase, kind, delta, elapsedMs: now });
    };
    const event = (status: DeepSeekApiCallEvent["status"], error: string | null): DeepSeekApiCallEvent => ({
      version: "deepseek-api-call-v0.2",
      callId,
      startedAt,
      durationMs: elapsed(),
      firstByteMs,
      firstReasoningMs,
      firstContentMs,
      endpoint,
      model: this.model,
      phase: metadata.phase,
      schemaName: metadata.schemaName,
      isRepair: metadata.isRepair,
      thinking: this.thinking,
      reasoningEffort: this.thinking === "enabled" ? this.reasoningEffort : null,
      streamed: this.stream,
      responseFormat,
      requestChars: {
        system: messages.find((message) => message.role === "system")?.content.length ?? 0,
        user: messages.find((message) => message.role === "user")?.content.length ?? 0,
        schema: metadata.schemaChars,
      },
      status,
      httpStatus,
      finishReason,
      responseId,
      systemFingerprint,
      responseChars,
      contentChars: content.length,
      reasoningChars,
      reasoningContent: this.captureReasoning ? reasoning : null,
      usage,
      error,
    });
    const emitTerminal = async (status: DeepSeekApiCallEvent["status"], error: string | null): Promise<void> => {
      terminalEventEmitted = true;
      await this.emit(event(status, error));
    };

    try {
      const response = await this.fetchImplementation(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: { type: responseFormat },
          thinking: { type: this.thinking },
          ...(this.thinking === "enabled" ? { reasoning_effort: this.reasoningEffort } : {}),
          max_tokens: maxTokens ?? (responseFormat === "json_object" ? 16_000 : 12_000),
          stream: this.stream,
          ...(this.stream ? { stream_options: { include_usage: true } } : {}),
          ...(this.thinking === "disabled" ? { temperature: responseFormat === "json_object" ? 0.1 : 0.4 } : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      httpStatus = response.status;

      if (!response.ok) {
        const raw = await response.text();
        responseChars = raw.length;
        firstByteMs = elapsed();
        let payload: DeepSeekResponse | null = null;
        try { payload = JSON.parse(raw) as DeepSeekResponse; } catch { /* keep generic error */ }
        const message = `DeepSeek API error ${response.status}: ${payload?.error?.message ?? "request failed"}`;
        await emitTerminal("http_error", message);
        throw new Error(message);
      }

      if (this.stream) {
        if (!response.body) {
          const message = "DeepSeek streaming response has no body";
          await emitTerminal("invalid_response", message);
          throw new Error(message);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let doneMarkerSeen = false;
        const consumeLine = async (line: string): Promise<void> => {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) return;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") { doneMarkerSeen = true; return; }
          let chunk: DeepSeekStreamChunk;
          try { chunk = JSON.parse(data) as DeepSeekStreamChunk; }
          catch { throw new Error("DeepSeek returned an invalid SSE data chunk"); }
          responseId = chunk.id ?? responseId;
          systemFingerprint = chunk.system_fingerprint ?? systemFingerprint;
          if (chunk.usage) usage = usageOf(chunk.usage);
          const choice = chunk.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          await pushDelta("reasoning", choice?.delta?.reasoning_content ?? "");
          await pushDelta("content", choice?.delta?.content ?? "");
        };

        while (true) {
          const result = await reader.read();
          if (result.done) break;
          if (firstByteMs === null) firstByteMs = elapsed();
          const decoded = decoder.decode(result.value, { stream: true });
          responseChars += decoded.length;
          buffer += decoded;
          const lines = buffer.split(/\r?\n/u);
          buffer = lines.pop() ?? "";
          for (const line of lines) await consumeLine(line);
        }
        const tail = `${buffer}${decoder.decode()}`;
        if (tail.trim() !== "") await consumeLine(tail);
        if (!doneMarkerSeen && finishReason === null) {
          const message = "DeepSeek stream ended before a completion marker";
          await emitTerminal("invalid_response", message);
          throw new Error(message);
        }
      } else {
        const raw = await response.text();
        firstByteMs = elapsed();
        responseChars = raw.length;
        let payload: DeepSeekResponse;
        try { payload = JSON.parse(raw) as DeepSeekResponse; }
        catch {
          const message = `DeepSeek returned a non-JSON HTTP response (${response.status})`;
          await emitTerminal("invalid_response", message);
          throw new Error(message);
        }
        responseId = payload.id ?? null;
        systemFingerprint = payload.system_fingerprint ?? null;
        usage = usageOf(payload.usage);
        const choice = payload.choices?.[0];
        finishReason = choice?.finish_reason ?? null;
        const returnedReasoning = choice?.message?.reasoning_content ?? "";
        reasoningChars = returnedReasoning.length;
        if (this.captureReasoning) reasoning = returnedReasoning;
        content = choice?.message?.content ?? "";
        if (reasoningChars > 0) firstReasoningMs = firstByteMs;
        if (content.length > 0) firstContentMs = firstByteMs;
      }

      if (finishReason === "length") {
        const message = "DeepSeek output was truncated at the token limit";
        await emitTerminal("invalid_response", message);
        throw new Error(message);
      }
      if (content.trim() === "") {
        const message = "DeepSeek returned empty content";
        await emitTerminal("invalid_response", message);
        throw new Error(message);
      }
      await emitTerminal("success", null);
      return content;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!terminalEventEmitted) {
        await emitTerminal(httpStatus === null ? "network_error" : "invalid_response", message);
      }
      throw error;
    }
  }

  async generateObject(request: StructuredGenerationRequest): Promise<unknown> {
    const schemaText = JSON.stringify(request.schema);
    const content = await this.complete([
      { role: "system", content: [request.systemPrompt, "必须输出 json 对象。下面是目标 JSON Schema：", schemaText].join("\n\n") },
      { role: "user", content: request.userPrompt },
    ], "json_object", {
      phase: "structured",
      schemaName: request.schemaName,
      isRepair: request.repair !== undefined,
      schemaChars: schemaText.length,
    });
    try { return JSON.parse(content) as unknown; }
    catch { return content; }
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    return this.complete([
      { role: "system", content: request.systemPrompt },
      { role: "user", content: request.userPrompt },
    ], "text", { phase: "narrative", schemaName: null, isRepair: false, schemaChars: 0 }, request.maxTokens);
  }
}
