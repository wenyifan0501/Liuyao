import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  InterpretationPipelineError,
  buildChart,
  loadLiuyaoSkillBundle,
  runInterpretationPipeline,
} from "../src/index.js";
import type {
  AiGateway,
  BuildChartInput,
  LiuyaoInterpretation,
  StructuredGenerationRequest,
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

function validInterpretation(): LiuyaoInterpretation {
  return {
    analysisVersion: "liuyao-interpretation-v0.2",
    chartId: "chart-qian",
    chartRuleVersion: "liuyao-chart-v0.1",
    question: { topic: "career", normalizedQuestion: "面试能否进入下一轮", timeWindow: "下周" },
    anchors: {
      selfLine: 6,
      responseLine: 3,
      primaryUsefulGod: { relative: "officials", line: 4, reason: "职位以官鬼为主" },
      usefulGodCandidates: [],
      secondaryAnchors: [{ kind: "self", line: 6, reason: "观察求测者状态" }],
    },
    evidence: [
      { source: "line", line: 4, factIds: ["line.4.identity"], effect: "supporting", fact: "四爻官鬼", reason: "对应职位目标" },
      { source: "day", line: 4, factIds: ["line.4.day.element"], effect: "ambiguous", fact: "日辰作用", reason: "日辰作用需要结合后续规则" },
    ],
    decision: {
      coreDilemma: "现在推进面试还是继续等待更明确的内部机会",
      directAnswer: "当前更适合先推进面试，以真实流程校准机会。",
      preferredOption: "推进面试",
      alternativeTradeoff: "等待会保留稳定性，但可能错过当前窗口。",
      personalizedSignals: ["已经完成第一轮沟通"],
      reversalConditions: ["内部出现明确且更优的任命"],
    },
    judgment: {
      tendency: "neutral_uncertain",
      summary: "当前先保留判断。",
      conditions: ["等待现实流程反馈"],
      confidence: "medium",
      uncertainties: ["应期规则尚未加入"],
    },
    timingCandidates: [],
    actionAdvice: ["准备面试材料"],
    nextQuestion: { prompt: "若收到同等条件机会，你会接受吗？", purpose: "判断阻力来自机会还是意愿", choices: ["会", "不会", "不确定"] },
    safetyNotes: [],
  };
}

class FakeGateway implements AiGateway {
  readonly objectRequests: StructuredGenerationRequest[] = [];
  readonly textRequests: TextGenerationRequest[] = [];
  private objectIndex = 0;

  constructor(
    private readonly objectOutputs: readonly unknown[],
    private readonly textOutput = "这是通过校验后生成的用户报告。",
  ) {}

  async generateObject(request: StructuredGenerationRequest): Promise<unknown> {
    this.objectRequests.push(request);
    const output = this.objectOutputs[this.objectIndex++];
    if (output === undefined) throw new Error("Fake gateway has no more object outputs");
    return output;
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    this.textRequests.push(request);
    return this.textOutput;
  }
}

const consultation = {
  chartId: "chart-qian",
  chart,
  topic: "career" as const,
  question: "面试能否进入下一轮",
  timeWindow: "下周",
  background: ["已经完成第一轮沟通"],
};

describe("AI interpretation pipeline", () => {
  it("loads the project skill into structured, narrative, and direct bundles", async () => {
    const skill = await loadLiuyaoSkillBundle(join(process.cwd(), "Skill", "liuyao"));
    expect(skill.analysisRules).toContain("# 取用神规则");
    expect(skill.analysisRules).toContain("# 卦盘解释规则");
    expect(skill.narrativeRules).toContain("# 表达、画像与安全边界");
    expect(skill.directRules).toContain("# 直接深断");
    expect(skill.directRules).toContain("# 给对话留口");
    expect(skill.directRules).toContain("完整不等于穷尽");
  });

  it("validates structured output before requesting a report", async () => {
    const gateway = new FakeGateway([validInterpretation()]);
    const skill = await loadLiuyaoSkillBundle(join(process.cwd(), "Skill", "liuyao"));
    const result = await runInterpretationPipeline({ gateway, skill, consultation });
    expect(result).toMatchObject({ structuredAttempts: 1, report: "这是通过校验后生成的用户报告。" });
    expect(gateway.objectRequests).toHaveLength(1);
    expect(gateway.textRequests).toHaveLength(1);
    expect(gateway.objectRequests[0]?.systemPrompt).toContain("排盘是只读事实");
  });

  it("repairs once after chart-reference validation fails", async () => {
    const invalid = validInterpretation();
    const gateway = new FakeGateway([
      { ...invalid, anchors: { ...invalid.anchors, selfLine: 5 } },
      validInterpretation(),
    ]);
    const skill = await loadLiuyaoSkillBundle(join(process.cwd(), "Skill", "liuyao"));
    const result = await runInterpretationPipeline({ gateway, skill, consultation });
    expect(result.structuredAttempts).toBe(2);
    expect(gateway.objectRequests[1]?.repair?.issues).toContainEqual(
      expect.objectContaining({ code: "self_line_mismatch" }),
    );
    expect(gateway.textRequests).toHaveLength(1);
  });

  it("does not request narrative text when structured retries are exhausted", async () => {
    const invalid = { ...validInterpretation(), chartId: "wrong-chart" };
    const gateway = new FakeGateway([invalid, invalid]);
    const skill = await loadLiuyaoSkillBundle(join(process.cwd(), "Skill", "liuyao"));
    await expect(runInterpretationPipeline({ gateway, skill, consultation }))
      .rejects.toMatchObject<Partial<InterpretationPipelineError>>({
        name: "InterpretationPipelineError",
        attempts: 2,
      });
    expect(gateway.textRequests).toHaveLength(0);
  });

  it("accepts a JSON string from a provider and rejects an empty report", async () => {
    const gateway = new FakeGateway([JSON.stringify(validInterpretation())], "   ");
    const skill = await loadLiuyaoSkillBundle(join(process.cwd(), "Skill", "liuyao"));
    await expect(runInterpretationPipeline({ gateway, skill, consultation }))
      .rejects.toThrow("empty report");
  });
});
