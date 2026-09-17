import Ajv2020 from "ajv/dist/2020.js";
import followUpSchema from "../../schemas/liuyao-follow-up-schema-v0.2.json" with { type: "json" };
import type { AiGateway, LiuyaoSkillBundle, StructuredGenerationRequest } from "../ai/types.js";
import type { ValidationIssue } from "../interpretation/types.js";
import type { FollowUpContext } from "./types.js";

const Ajv2020Constructor = Ajv2020 as unknown as typeof import("ajv/dist/2020.js").default;
const validateSchema = new Ajv2020Constructor({ allErrors: true, strict: true }).compile(followUpSchema);

export interface FollowUpResult {
  readonly version: "liuyao-follow-up-v0.2";
  readonly consultationId: string;
  readonly chartId: string;
  readonly scope: "same_consultation" | "new_consultation" | "needs_clarification";
  readonly reason: string;
  readonly answer: string;
  readonly citedLines: readonly number[];
  readonly citedFactIds: readonly string[];
  readonly conversationSummary: string;
  readonly confirmedFacts: readonly string[];
  readonly nextQuestion: string | null;
}

export class FollowUpPipelineError extends Error {
  readonly attempts: number;
  readonly issues: readonly ValidationIssue[];

  constructor(attempts: number, issues: readonly ValidationIssue[]) {
    super("Follow-up response did not pass validation within the retry limit");
    this.name = "FollowUpPipelineError";
    this.attempts = attempts;
    this.issues = issues;
  }
}

function parseOutput(output: unknown): unknown {
  if (typeof output !== "string") return output;
  try {
    return JSON.parse(output) as unknown;
  } catch {
    return output;
  }
}

function validateFollowUp(output: unknown, context: FollowUpContext): readonly ValidationIssue[] {
  if (!validateSchema(output)) {
    return (validateSchema.errors ?? []).map((error) => ({
      path: error.instancePath || "/",
      code: `schema_${error.keyword}`,
      message: error.message ?? "Schema validation failed",
    }));
  }
  const result = output as unknown as FollowUpResult;
  const issues: ValidationIssue[] = [];
  if (result.consultationId !== context.consultationId) {
    issues.push({ path: "/consultationId", code: "consultation_id_mismatch", message: "Wrong consultation" });
  }
  if (result.chartId !== context.immutable.chartId) {
    issues.push({ path: "/chartId", code: "chart_id_mismatch", message: "Wrong chart" });
  }
  for (const line of result.citedLines) {
    if (!context.immutable.chart.primaryLines.some((candidate) => candidate.position === line)) {
      issues.push({ path: "/citedLines", code: "unknown_line", message: `Line ${line} does not exist` });
    }
  }
  const factsById = new Map(context.immutable.computedFacts.facts.map((fact) => [fact.id, fact]));
  for (const factId of result.citedFactIds) {
    const fact = factsById.get(factId);
    if (!fact) {
      issues.push({ path: "/citedFactIds", code: "unknown_fact_id", message: `Computed fact ${factId} does not exist` });
      continue;
    }
    if (!result.citedLines.includes(fact.line)) {
      issues.push({ path: "/citedFactIds", code: "fact_line_not_cited", message: `Computed fact ${factId} belongs to uncited line ${fact.line}` });
    }
  }
  return issues;
}

function requestFor(
  context: FollowUpContext,
  skill: LiuyaoSkillBundle,
  repair?: { readonly previousOutput: unknown; readonly issues: readonly ValidationIssue[] },
): StructuredGenerationRequest {
  const data = JSON.stringify(context, null, 2);
  const base: StructuredGenerationRequest = {
    schemaName: "liuyao_follow_up_v0_2",
    schema: followUpSchema,
    systemPrompt: [
      "你负责回答围绕既有六爻咨询的追问，并先判断追问是否仍属于原占问。",
      "原卦与首轮结构化分析是只读事实。不得重新起卦、切换用神或编造爻位。",
      "只输出符合 JSON Schema 的 json 对象。same_consultation 时直接回答；new_consultation 时解释为什么应另起；needs_clarification 时只问一个关键问题。",
      "必须先回应用户此刻的困惑，再说明新信息加强、削弱或改变了上一轮哪项解释。避免任何人都适用的空泛建议。answer 中不要夹带追问；nextQuestion 至多一个，用户现在就能回答且答案会改变后续判断，合适时把二至四个选项直接写进问题。",
      "任何卦盘关系都必须引用 computedFacts 中存在的 citedFactIds，且同时列出对应 citedLines。没有事实依据时只使用现实背景，不自行计算术理关系。",
      "conversationSummary 要整合到本轮为止的重要问题、判断和未决点。confirmedFacts 只列出用户在当前消息中新明确陈述的现实事实，不得把模型推测写进去。",
      skill.narrativeRules,
    ].join("\n\n"),
    userPrompt: `<follow_up_context>\n${data}\n</follow_up_context>`,
  };
  if (!repair) return base;
  return {
    ...base,
    repair,
    userPrompt: [
      base.userPrompt,
      `<previous_output>\n${JSON.stringify(repair.previousOutput)}\n</previous_output>`,
      `<validation_errors>\n${JSON.stringify(repair.issues)}\n</validation_errors>`,
      "只修正校验错误，不改变原卦。",
    ].join("\n"),
  };
}

export async function runFollowUpPipeline(input: {
  readonly gateway: AiGateway;
  readonly skill: LiuyaoSkillBundle;
  readonly context: FollowUpContext;
  readonly maxAttempts?: number;
  readonly onValidationFailure?: (event: { readonly attempt: number; readonly issues: readonly ValidationIssue[] }) => void | Promise<void>;
}): Promise<FollowUpResult> {
  const maxAttempts = input.maxAttempts ?? 2;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error("maxAttempts must be an integer from 1 to 3");
  }
  let previousOutput: unknown;
  let issues: readonly ValidationIssue[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const repair = attempt === 1 ? undefined : { previousOutput, issues };
    previousOutput = await input.gateway.generateObject(requestFor(input.context, input.skill, repair));
    const parsed = parseOutput(previousOutput);
    issues = validateFollowUp(parsed, input.context);
    if (issues.length === 0) return parsed as FollowUpResult;
    await input.onValidationFailure?.({ attempt, issues });
  }
  throw new FollowUpPipelineError(maxAttempts, issues);
}
