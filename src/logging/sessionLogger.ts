import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface SessionLogEvent {
  readonly version: "liuyao-session-log-v0.1";
  readonly sessionId: string;
  readonly sequence: number;
  readonly timestamp: string;
  readonly type: string;
  readonly data: unknown;
}

export interface SessionLoggerOptions {
  readonly sessionId: string;
  readonly logDirectory?: string;
  readonly mode?: SessionLogMode;
}

export type SessionLogMode = "off" | "compact" | "diagnostic";

const COMPACT_EVENT_TYPES = new Set([
  "session_started",
  "api_call",
  "validation_failed",
  "session_completed",
  "session_error",
]);

function compactData(type: string, data: unknown): unknown {
  if (type !== "api_call" || typeof data !== "object" || data === null) return data;
  return { ...data, reasoningContent: null };
}

function safeSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "-");
  if (sanitized.length === 0) throw new Error("sessionId must contain a safe filename character");
  return sanitized;
}

export class JsonlSessionLogger {
  readonly sessionId: string;
  readonly path: string;
  readonly mode: SessionLogMode;
  private sequence = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: SessionLoggerOptions) {
    this.sessionId = options.sessionId;
    this.mode = options.mode ?? "diagnostic";
    const directory = options.logDirectory ?? join(process.cwd(), "logs", "sessions");
    this.path = join(directory, `${safeSegment(options.sessionId)}.jsonl`);
  }

  append(type: string, data: unknown): Promise<void> {
    if (type.trim() === "") throw new Error("Log event type is required");
    if (this.mode === "off" || (this.mode === "compact" && !COMPACT_EVENT_TYPES.has(type))) {
      return this.writeQueue;
    }
    const event: SessionLogEvent = {
      version: "liuyao-session-log-v0.1",
      sessionId: this.sessionId,
      sequence: ++this.sequence,
      timestamp: new Date().toISOString(),
      type,
      data: this.mode === "compact" ? compactData(type, data) : data,
    };
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await appendFile(this.path, `${JSON.stringify(event)}\n`, "utf8");
    });
    return this.writeQueue;
  }

  flush(): Promise<void> {
    return this.writeQueue;
  }
}
