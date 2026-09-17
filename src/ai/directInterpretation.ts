import { deriveChartFacts } from "../domain/derivedFacts.js";
import type { LiuyaoChart } from "../domain/types.js";
import { auditNarrativeHardFacts, type NarrativeAuditIssue } from "../interpretation/narrativeAudit.js";
import type { InterpretationTopic } from "../interpretation/types.js";
import type { ConsultationMessage } from "../consultation/types.js";
import type { AiGateway, LiuyaoSkillBundle, TextGenerationRequest } from "./types.js";

export interface DirectInterpretationInput {
  readonly chartId: string;
  readonly chart: LiuyaoChart;
  readonly topic: InterpretationTopic;
  readonly question: string;
  readonly timeWindow: string | null;
  readonly background: readonly string[];
}

export interface DirectInterpretationResult {
  readonly report: string;
  readonly auditIssues: readonly NarrativeAuditIssue[];
}

export interface DirectConsultationState {
  readonly consultationId: string;
  readonly chartId: string;
  readonly topic: InterpretationTopic;
  readonly originalQuestion: string;
  readonly timeWindow: string | null;
  readonly background: readonly string[];
  readonly chart: LiuyaoChart;
  readonly initialReport: string;
  readonly messages: readonly ConsultationMessage[];
}

function directSystemPrompt(skill: LiuyaoSkillBundle, followUp: boolean): string {
  return [
    followUp
      ? "你正在围绕同一卦盘继续深断。原卦不变，但用户的新事实可以修正之前的现实映射。"
      : "你现在直接完成一次完整六爻占断，并把最终自然语言回答直接交给用户。",
    "允许给出鲜明、甚至有锋芒的中心判断；不要为了安全感把相反方向平均陈列。鲜明判断仍必须来自卦盘和用户已确认事实，不得把猜测写成事实。",
    "先形成卦象整体主线和关键作用链，再写答案。现实建议只作简短收束，不要让职业咨询、投资常识或心理安慰取代解卦。",
    followUp
      ? "追问要深入首轮尚未展开的卦象层次，或用新增事实修正现实映射；不要为了显得完整而重写整份首轮报告。"
      : "首轮必须给出能独立成立的结论与核心依据，但不要一次耗尽所有辅助爻象、时间分支和次级议题。结尾可以点出一至两个由本卦具体矛盾产生的深挖入口，让用户容易接话。",
    "不要输出 JSON、fact ID、内部步骤或系统说明。不要为了互动强行采集事实；起卦前应确认的信息不得在结尾重新询问。",
    skill.directRules,
  ].join("\n\n");
}

export function buildDirectInterpretationRequest(
  consultation: DirectInterpretationInput,
  skill: LiuyaoSkillBundle,
): TextGenerationRequest {
  return {
    systemPrompt: directSystemPrompt(skill, false),
    userPrompt: [
      "<consultation>",
      JSON.stringify({ ...consultation, computedFacts: deriveChartFacts(consultation.chart) }, null, 2),
      "</consultation>",
    ].join("\n"),
    maxTokens: 24_000,
  };
}

export function buildDirectFollowUpRequest(
  state: DirectConsultationState,
  currentQuestion: string,
  skill: LiuyaoSkillBundle,
): TextGenerationRequest {
  return {
    systemPrompt: directSystemPrompt(skill, true),
    userPrompt: [
      "<immutable_consultation>",
      JSON.stringify({
        consultationId: state.consultationId,
        chartId: state.chartId,
        topic: state.topic,
        originalQuestion: state.originalQuestion,
        timeWindow: state.timeWindow,
        background: state.background,
        chart: state.chart,
        computedFacts: deriveChartFacts(state.chart),
        initialReport: state.initialReport,
      }, null, 2),
      "</immutable_consultation>",
      "<recent_conversation>",
      JSON.stringify(state.messages.slice(-20), null, 2),
      "</recent_conversation>",
      "<current_question>",
      currentQuestion,
      "</current_question>",
      "直接回答当前问题。必须产生至少一项基于新信息与原卦关系的新增分析；如果此前现实映射不成立，要明确修正，不得只复述首轮结论。",
    ].join("\n"),
    maxTokens: 16_000,
  };
}

export async function runDirectInterpretation(input: {
  readonly gateway: AiGateway;
  readonly skill: LiuyaoSkillBundle;
  readonly consultation: DirectInterpretationInput;
}): Promise<DirectInterpretationResult> {
  const report = (await input.gateway.generateText(buildDirectInterpretationRequest(input.consultation, input.skill))).trim();
  if (report === "") throw new Error("Direct interpretation returned an empty report");
  return { report, auditIssues: auditNarrativeHardFacts(report) };
}

export async function runDirectFollowUp(input: {
  readonly gateway: AiGateway;
  readonly skill: LiuyaoSkillBundle;
  readonly state: DirectConsultationState;
  readonly question: string;
}): Promise<DirectInterpretationResult> {
  const report = (await input.gateway.generateText(buildDirectFollowUpRequest(input.state, input.question, input.skill))).trim();
  if (report === "") throw new Error("Direct follow-up returned an empty report");
  return { report, auditIssues: auditNarrativeHardFacts(report) };
}
