import interpretationSchema from "../../schemas/liuyao-interpretation-schema-v0.2.json" with { type: "json" };
import { validateInterpretation } from "../interpretation/validator.js";
import type { LiuyaoInterpretation, ValidationIssue } from "../interpretation/types.js";
import { buildNarrativeRequest, buildStructuredRequest } from "./prompts.js";
import type { InterpretationPromptInput } from "./prompts.js";
import type { AiGateway, LiuyaoSkillBundle } from "./types.js";

export interface RunInterpretationPipelineInput {
  readonly gateway: AiGateway;
  readonly skill: LiuyaoSkillBundle;
  readonly consultation: InterpretationPromptInput;
  readonly maxStructuredAttempts?: number;
  readonly onValidationFailure?: (event: { readonly attempt: number; readonly issues: readonly ValidationIssue[] }) => void | Promise<void>;
}

export interface InterpretationPipelineResult {
  readonly interpretation: LiuyaoInterpretation;
  readonly report: string;
  readonly structuredAttempts: number;
}

export class InterpretationPipelineError extends Error {
  readonly attempts: number;
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, attempts: number, issues: readonly ValidationIssue[]) {
    super(message);
    this.name = "InterpretationPipelineError";
    this.attempts = attempts;
    this.issues = issues;
  }
}

function normalizeObject(candidate: unknown): { value?: unknown; issue?: ValidationIssue } {
  if (typeof candidate !== "string") return { value: candidate };
  try {
    return { value: JSON.parse(candidate) };
  } catch {
    return {
      issue: { path: "/", code: "invalid_json", message: "Model returned a string that is not valid JSON" },
    };
  }
}

export async function runInterpretationPipeline(
  input: RunInterpretationPipelineInput,
): Promise<InterpretationPipelineResult> {
  const maxAttempts = input.maxStructuredAttempts ?? 2;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error("maxStructuredAttempts must be an integer from 1 to 3");
  }

  let previousOutput: unknown;
  let issues: readonly ValidationIssue[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const repair = attempt === 1 ? undefined : { previousOutput, issues };
    const request = buildStructuredRequest(
      input.consultation,
      input.skill,
      interpretationSchema,
      repair,
    );
    previousOutput = await input.gateway.generateObject(request);
    const normalized = normalizeObject(previousOutput);
    if (normalized.issue) {
      issues = [normalized.issue];
      await input.onValidationFailure?.({ attempt, issues });
      continue;
    }

    const validation = validateInterpretation({
      chartId: input.consultation.chartId,
      chart: input.consultation.chart,
      output: normalized.value,
    });
    if (!validation.ok) {
      issues = validation.issues;
      await input.onValidationFailure?.({ attempt, issues });
      continue;
    }

    const report = (await input.gateway.generateText(
      buildNarrativeRequest(input.consultation, validation.value, input.skill),
    )).trim();
    if (report.length === 0) {
      throw new InterpretationPipelineError("Narrative generation returned an empty report", attempt, []);
    }
    return { interpretation: validation.value, report, structuredAttempts: attempt };
  }

  throw new InterpretationPipelineError(
    "Structured interpretation did not pass validation within the retry limit",
    maxAttempts,
    issues,
  );
}
