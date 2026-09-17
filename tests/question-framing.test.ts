import { describe, expect, it } from "vitest";
import { frameConsultationQuestion, resolveClarificationAnswer } from "../src/index.js";
import type { AiGateway, StructuredGenerationRequest } from "../src/index.js";

function gatewayFor(output: unknown, requests: StructuredGenerationRequest[] = []): AiGateway {
  return {
    async generateObject(request) {
      requests.push(request);
      return output;
    },
    async generateText() { throw new Error("Framing should not generate narrative text"); },
  };
}

describe("pre-cast question framing", () => {
  it("stores a numbered choice as its full meaning", () => {
    expect(resolveClarificationAnswer("1", ["已经开始", "尚未开始"])).toBe("已经开始");
    expect(resolveClarificationAnswer("自己说明的情况", ["已经开始", "尚未开始"])).toBe("自己说明的情况");
  });

  it("passes a sufficiently specific question without inventing another question", async () => {
    const result = await frameConsultationQuestion({
      gateway: gatewayFor({
        status: "ready",
        normalizedQuestion: "未来半年我在当前公司的正式编制机会如何？",
        missingReason: null,
        clarifyingQuestion: null,
        choices: [],
      }),
      topic: "career",
      question: "未来半年我能不能从子公司转到正式编制？",
      timeWindow: "未来半年",
      background: ["目前仍在子公司编制"],
    });

    expect(result.status).toBe("ready");
    expect(result.clarifyingQuestion).toBeNull();
  });

  it("asks one decision-changing question before casting", async () => {
    const requests: StructuredGenerationRequest[] = [];
    const result = await frameConsultationQuestion({
      gateway: gatewayFor({
        status: "needs_clarification",
        normalizedQuestion: "这只股票后续走势如何？",
        missingReason: "是否仍持仓会改变所问对象与判断落点",
        clarifyingQuestion: "你现在仍持有这只股票，还是已经卖出、只想看后续走势？",
        choices: ["仍持有", "已经卖出"],
      }, requests),
      topic: "finance",
      question: "看看这只股票后面怎么样",
      timeWindow: null,
      background: ["以前买过"],
    });

    expect(result.status).toBe("needs_clarification");
    expect(result.choices).toEqual(["仍持有", "已经卖出"]);
    expect(requests[0]?.systemPrompt).toContain("不能把‘以前发生过’擅自当成‘当前仍在发生’");
  });

  it("falls back to ready when the lightweight model returns unusable JSON", async () => {
    const result = await frameConsultationQuestion({
      gateway: gatewayFor({ status: "needs_clarification", normalizedQuestion: "事业如何", choices: [] }),
      topic: "career",
      question: "事业如何",
      timeWindow: null,
      background: [],
    });

    expect(result).toMatchObject({ status: "ready", normalizedQuestion: "事业如何" });
  });
});
