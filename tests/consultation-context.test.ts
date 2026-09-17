import { describe, expect, it } from "vitest";
import { buildChart, buildFollowUpContext, runFollowUpPipeline } from "../src/index.js";
import type { AiGateway, BuildChartInput, ConsultationState, LiuyaoInterpretation } from "../src/index.js";

const calendar: BuildChartInput["calendar"] = {
  castAt: "1986-05-29T00:00:00+08:00",
  timezone: "Asia/Shanghai",
  calendarRuleVersion: "sexagenary-calendar-v0.1",
  dayBoundary: "midnight",
  monthBranch: "巳",
  dayStem: "癸",
  dayBranch: "酉",
};
const chart = buildChart({ method: "manual", values: [7, 7, 7, 7, 7, 7], calendar });

const interpretation: LiuyaoInterpretation = {
  analysisVersion: "liuyao-interpretation-v0.2",
  chartId: "chart-1",
  chartRuleVersion: "liuyao-chart-v0.1",
  question: { topic: "career", normalizedQuestion: "面试能否通过", timeWindow: "下周" },
  anchors: {
    selfLine: 6,
    responseLine: 3,
    primaryUsefulGod: { relative: "officials", line: 4, reason: "职位" },
    usefulGodCandidates: [],
    secondaryAnchors: [],
  },
  evidence: [
    { source: "line", line: 4, factIds: ["line.4.identity"], effect: "supporting", fact: "四爻官鬼", reason: "职位锚点" },
    { source: "context", line: null, factIds: [], effect: "ambiguous", fact: "等待结果", reason: "现实尚未落定" },
  ],
  decision: { coreDilemma: "继续等待还是推进其他机会的现实选择", directAnswer: "先推进可验证的机会。", preferredOption: "推进", alternativeTradeoff: "只等待可能错过窗口", personalizedSignals: ["已完成面试"], reversalConditions: ["收到明确结果"] },
  judgment: {
    tendency: "neutral_uncertain", summary: "等待验证", conditions: [], confidence: "medium", uncertainties: [],
  },
  timingCandidates: [], actionAdvice: [], nextQuestion: { prompt: "你更在意哪项？", purpose: "识别取舍", choices: [] }, safetyNotes: [],
};

function state(): ConsultationState {
  return {
    consultationId: "consultation-1",
    chartId: "chart-1",
    topic: "career",
    originalQuestion: "面试能否通过",
    timeWindow: "下周",
    initialBackground: ["已完成面试"],
    chart,
    interpretation,
    conversationSummary: "用户已经完成面试，正在等待结果。",
    confirmedFacts: [{
      id: "fact-1",
      content: "HR 表示三天内回复",
      sourceMessageId: "message-5",
      confirmedAt: "2026-09-05T00:00:00+08:00",
    }],
    messages: Array.from({ length: 15 }, (_, index) => ({
      id: `message-${index + 1}`,
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      kind: "follow_up" as const,
      content: `message ${index + 1}`,
      createdAt: `2026-09-05T00:${String(index).padStart(2, "0")}:00+08:00`,
    })),
  };
}

describe("multi-turn consultation context", () => {
  it("keeps the chart and initial interpretation immutable while trimming chat history", () => {
    const context = buildFollowUpContext(state(), "为什么说合同环节可能有延迟？", 4);
    expect(context.immutable.chart).toBe(chart);
    expect(context.immutable.computedFacts.facts).toContainEqual(expect.objectContaining({ id: "line.4.identity" }));
    expect(context.immutable.initialInterpretation).toBe(interpretation);
    expect(context.evolving.recentMessages.map((message) => message.id)).toEqual([
      "message-12", "message-13", "message-14", "message-15",
    ]);
    expect(context.evolving.confirmedFacts[0]?.content).toBe("HR 表示三天内回复");
    expect(context.currentQuestion).toBe("为什么说合同环节可能有延迟？");
  });

  it("rejects a consultation linked to a different chart", () => {
    expect(() => buildFollowUpContext({ ...state(), chartId: "other-chart" }, "继续看"))
      .toThrow("different chart");
  });

  it("rejects empty follow-ups and unreasonable context windows", () => {
    expect(() => buildFollowUpContext(state(), "   ")).toThrow("required");
    expect(() => buildFollowUpContext(state(), "继续看", 0)).toThrow("1 to 50");
  });

  it("classifies and answers a same-chart follow-up with bounded repair", async () => {
    const context = buildFollowUpContext(state(), "为什么主要看四爻官鬼？");
    const valid = {
      version: "liuyao-follow-up-v0.2",
      consultationId: "consultation-1",
      chartId: "chart-1",
      scope: "same_consultation",
      reason: "用户正在追问原面试占问的取用神依据",
      answer: "四爻官鬼对应本次所问的职位目标，仍沿用原卦分析。",
      citedLines: [4],
      citedFactIds: ["line.4.identity"],
      conversationSummary: "用户追问为什么职位以四爻官鬼为锚点。",
      confirmedFacts: [],
      nextQuestion: "你更想判断流程结果，还是这个职位是否适合你？",
    };
    const outputs = [{ ...valid, chartId: "wrong-chart" }, valid];
    let index = 0;
    const gateway: AiGateway = {
      async generateObject() { return outputs[index++]; },
      async generateText() { throw new Error("Follow-up should not request free text"); },
    };
    const result = await runFollowUpPipeline({
      gateway,
      skill: { analysisRules: "analysis", narrativeRules: "narrative", directRules: "direct" },
      context,
    });
    expect(result).toEqual(valid);
    expect(index).toBe(2);
  });
});
