import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonlSessionLogger } from "../src/index.js";

describe("JsonlSessionLogger", () => {
  it("按顺序写入可解析的 JSONL 事件", async () => {
    const directory = await mkdtemp(join(tmpdir(), "liuyao-session-log-"));

    try {
      const logger = new JsonlSessionLogger({
        sessionId: "test/session:01",
        logDirectory: directory,
      });

      await Promise.all([
        logger.append("question_framed", { content: "我该如何推进这个项目？" }),
        logger.append("api_call", {
          model: "deepseek-v4-flash",
          durationMs: 123,
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        }),
      ]);
      await logger.flush();

      const text = await readFile(logger.path, "utf8");
      const events = text
        .trim()
        .split(/\r?\n/u)
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      expect(logger.path).toBe(join(directory, "test-session-01.jsonl"));
      expect(events).toHaveLength(2);
      expect(events.map((event) => event.sequence)).toEqual([1, 2]);
      expect(events.map((event) => event.type)).toEqual([
        "question_framed",
        "api_call",
      ]);
      expect(events.every((event) => event.version === "liuyao-session-log-v0.1")).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("compact 模式省略会话正文和完整推理，off 模式不创建文件", async () => {
    const directory = await mkdtemp(join(tmpdir(), "liuyao-session-log-mode-"));
    try {
      const compact = new JsonlSessionLogger({ sessionId: "compact", logDirectory: directory, mode: "compact" });
      await compact.append("question_framed", { content: "private" });
      await compact.append("api_call", { reasoningContent: "large private reasoning", durationMs: 10 });
      await compact.flush();
      const compactText = await readFile(compact.path, "utf8");
      expect(compactText).not.toContain("private");
      expect(compactText).toContain('"reasoningContent":null');

      const off = new JsonlSessionLogger({ sessionId: "off", logDirectory: directory, mode: "off" });
      await off.append("api_call", { durationMs: 10 });
      await off.flush();
      await expect(readFile(off.path, "utf8")).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
