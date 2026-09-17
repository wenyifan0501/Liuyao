import { describe, expect, it } from "vitest";
import {
  auditNarrativeHardFacts,
  buildChart,
  buildDirectFollowUpRequest,
  buildDirectInterpretationRequest,
  runDirectInterpretation,
} from "../src/index.js";
import type {
  AiGateway,
  BuildChartInput,
  DirectConsultationState,
  LiuyaoSkillBundle,
  TextGenerationRequest,
} from "../src/index.js";

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
const skill: LiuyaoSkillBundle = {
  analysisRules: "structured rules",
  narrativeRules: "narrative rules",
  directRules: "DIRECT READING RULES",
};
const consultation = {
  chartId: "chart-1",
  chart,
  topic: "career" as const,
  question: "未来半年能否转正？",
  timeWindow: "未来半年",
  background: ["目前在子公司编制"],
};

describe("direct interpretation", () => {
  it("sends the raw direct-reading rules and deterministic facts in one narrative call", async () => {
    const request = buildDirectInterpretationRequest(consultation, skill);
    expect(request.systemPrompt).toContain("DIRECT READING RULES");
    expect(request.systemPrompt).toContain("允许给出鲜明");
    expect(request.systemPrompt).toContain("不要一次耗尽所有辅助爻象");
    expect(request.systemPrompt).toContain("深挖入口");
    expect(request.systemPrompt).toContain("不要为了互动强行采集事实");
    expect(request.userPrompt).toContain('"computedFacts"');
    expect(request.userPrompt).toContain('"primaryHexagram"');
    expect(request.maxTokens).toBe(24_000);
  });

  it("uses one text generation and audits its hard-fact claims", async () => {
    const requests: TextGenerationRequest[] = [];
    const gateway: AiGateway = {
      async generateObject() { throw new Error("Direct reading should not request structured output"); },
      async generateText(request) {
        requests.push(request);
        return "先下判断：此局先难后开。但金克火，所以眼前仍有阻。";
      },
    };
    const result = await runDirectInterpretation({ gateway, skill, consultation });
    expect(requests).toHaveLength(1);
    expect(result.auditIssues).toContainEqual(expect.objectContaining({ claim: "金克火" }));
  });

  it("keeps the original chart and asks follow-ups for genuinely new chart-based analysis", () => {
    const state: DirectConsultationState = {
      consultationId: "consultation-1",
      chartId: "chart-1",
      topic: "career",
      originalQuestion: consultation.question,
      timeWindow: consultation.timeWindow,
      background: consultation.background,
      chart,
      initialReport: "首轮判断",
      messages: [],
    };
    const request = buildDirectFollowUpRequest(state, "直属领导确实认可我，这会改变判断吗？", skill);
    expect(request.userPrompt).toContain('"initialReport": "首轮判断"');
    expect(request.userPrompt).toContain("必须产生至少一项");
    expect(request.userPrompt).toContain("明确修正");
    expect(request.userPrompt).toContain("直属领导确实认可我");
  });
});

describe("narrative hard-fact audit", () => {
  it("accepts correct generating and controlling directions", () => {
    expect(auditNarrativeHardFacts("木生火，火克金，金生水")).toEqual([]);
  });

  it("flags reversed five-element directions", () => {
    expect(auditNarrativeHardFacts("金克火，土生木")).toHaveLength(2);
  });
});
