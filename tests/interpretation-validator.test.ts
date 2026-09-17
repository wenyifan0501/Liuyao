import { describe, expect, it } from "vitest";
import { buildChart, validateInterpretation } from "../src/index.js";
import type { BuildChartInput, LiuyaoInterpretation } from "../src/index.js";

const calendar: BuildChartInput["calendar"] = {
  castAt: "1986-05-29T00:00:00+08:00",
  timezone: "Asia/Shanghai",
  calendarRuleVersion: "sexagenary-calendar-v0.1",
  dayBoundary: "midnight",
  monthBranch: "巳",
  dayStem: "癸",
  dayBranch: "酉",
};

const chart = buildChart({ method: "manual", values: [7, 8, 6, 9, 7, 8], calendar });

function validOutput(): LiuyaoInterpretation {
  return {
    analysisVersion: "liuyao-interpretation-v0.2",
    chartId: "chart-test-001",
    chartRuleVersion: "liuyao-chart-v0.1",
    question: {
      topic: "career",
      normalizedQuestion: "下周的面试能否获得录用机会",
      timeWindow: "下周",
    },
    anchors: {
      selfLine: 3,
      responseLine: 6,
      primaryUsefulGod: { relative: "officials", line: 5, reason: "所问核心是职位" },
      usefulGodCandidates: [],
      secondaryAnchors: [{ kind: "self", line: 3, reason: "观察求测者的承接状态" }],
    },
    evidence: [
      { source: "line", line: 5, factIds: ["line.5.identity"], effect: "supporting", fact: "五爻为官鬼", reason: "职位以官鬼为主要锚点" },
      { source: "change", line: 3, factIds: ["line.3.change.element"], effect: "ambiguous", fact: "三爻发动", reason: "世爻发动表示求测者一方正在变化" },
    ],
    decision: {
      coreDilemma: "继续等待结果还是主动推进其他面试机会",
      directAnswer: "当前应继续推进流程，同时保留其他可验证机会。",
      preferredOption: "继续推进",
      alternativeTradeoff: "只等待会失去其他验证机会。",
      personalizedSignals: ["已经进入面试流程"],
      reversalConditions: ["收到明确拒绝或更优录用"],
    },
    judgment: {
      tendency: "neutral_uncertain",
      summary: "目前证据有变化但尚不足以作确定判断。",
      conditions: ["等待面试流程中的现实反馈"],
      confidence: "medium",
      uncertainties: ["尚未加入伏神规则"],
    },
    timingCandidates: [],
    actionAdvice: ["准备可核验的项目案例"],
    nextQuestion: { prompt: "若进入下一轮，你最在意哪项条件？", purpose: "确定现实取舍", choices: ["职责", "薪资", "稳定性"] },
    safetyNotes: [],
  };
}

describe("interpretation output validator", () => {
  it("accepts a schema-valid result whose chart references are correct", () => {
    expect(validateInterpretation({ chartId: "chart-test-001", chart, output: validOutput() }))
      .toEqual({ ok: true, value: validOutput() });
  });

  it("rejects malformed model output at the JSON Schema layer", () => {
    const output = { ...validOutput(), judgment: { summary: "missing required fields" } };
    const result = validateInterpretation({ chartId: "chart-test-001", chart, output });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((item) => item.code === "schema_required")).toBe(true);
  });

  it("rejects a result tied to another chart", () => {
    const result = validateInterpretation({ chartId: "another-chart", chart, output: validOutput() });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ code: "chart_id_mismatch" }));
  });

  it("rejects incorrect self and response lines", () => {
    const base = validOutput();
    const output = { ...base, anchors: { ...base.anchors, selfLine: 4, responseLine: 1 } };
    const result = validateInterpretation({ chartId: "chart-test-001", chart, output });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining(["self_line_mismatch", "response_line_mismatch"]));
    }
  });

  it("rejects a useful god whose relative does not match its line", () => {
    const base = validOutput();
    const output = {
      ...base,
      anchors: {
        ...base.anchors,
        primaryUsefulGod: { relative: "wealth" as const, line: 5, reason: "故意写错" },
      },
    };
    const result = validateInterpretation({ chartId: "chart-test-001", chart, output });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ code: "relative_mismatch" }));
  });

  it("rejects change evidence pointing at a static line", () => {
    const base = validOutput();
    const output = {
      ...base,
      evidence: [
        base.evidence[0],
        { source: "change" as const, line: 1, factIds: ["line.1.identity"], effect: "supporting" as const, fact: "错误变化", reason: "初爻并未发动" },
      ],
    };
    const result = validateInterpretation({ chartId: "chart-test-001", chart, output });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ code: "non_moving_change" }));
  });

  it("rejects chart evidence that cites an invented computed fact", () => {
    const base = validOutput();
    const output = {
      ...base,
      evidence: [
        { ...base.evidence[0], factIds: ["line.5.month.invented"] },
        base.evidence[1],
      ],
    };
    const result = validateInterpretation({ chartId: "chart-test-001", chart, output });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ code: "unknown_fact_id" }));
  });

  it("allows useful-god ambiguity only when explicit candidates are supplied", () => {
    const base = validOutput();
    const missing = {
      ...base,
      anchors: { ...base.anchors, primaryUsefulGod: null, usefulGodCandidates: [] },
    };
    const missingResult = validateInterpretation({ chartId: "chart-test-001", chart, output: missing });
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok) expect(missingResult.issues).toContainEqual(expect.objectContaining({ code: "missing_useful_god" }));

    const withCandidates = {
      ...base,
      anchors: {
        ...base.anchors,
        primaryUsefulGod: null,
        usefulGodCandidates: [
          { relative: "officials" as const, line: 5, reason: "若核心是职位" },
          { relative: "wealth" as const, line: 3, reason: "若核心是薪资" },
        ],
      },
    };
    expect(validateInterpretation({ chartId: "chart-test-001", chart, output: withCandidates }).ok).toBe(true);
  });
});
