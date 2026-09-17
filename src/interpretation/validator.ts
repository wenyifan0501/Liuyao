import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ErrorObject } from "ajv";
import interpretationSchema from "../../schemas/liuyao-interpretation-schema-v0.2.json" with { type: "json" };
import { deriveChartFacts } from "../domain/derivedFacts.js";
import type { LiuyaoChart } from "../domain/types.js";
import type {
  InterpretationValidationResult,
  LiuyaoInterpretation,
  UsefulGodAnchor,
  ValidationIssue,
} from "./types.js";

const Ajv2020Constructor = Ajv2020 as unknown as typeof import("ajv/dist/2020.js").default;
const applyFormats = addFormats as unknown as typeof import("ajv-formats").default;
const ajv = new Ajv2020Constructor({ allErrors: true, strict: true });
applyFormats(ajv);
const validateSchema = ajv.compile(interpretationSchema);

export interface ValidateInterpretationInput {
  readonly chartId: string;
  readonly chart: LiuyaoChart;
  readonly output: unknown;
}

function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

function validateUsefulGod(
  anchor: UsefulGodAnchor,
  path: string,
  chart: LiuyaoChart,
  issues: ValidationIssue[],
): void {
  const line = chart.primaryLines.find((candidate) => candidate.position === anchor.line);
  if (!line) {
    issues.push(issue(`${path}/line`, "unknown_line", `Line ${anchor.line} does not exist in the chart`));
    return;
  }
  if (line.relative !== anchor.relative) {
    issues.push(issue(
      `${path}/relative`,
      "relative_mismatch",
      `Line ${anchor.line} is ${line.relative}, not ${anchor.relative}`,
    ));
  }
}

export function validateInterpretation(input: ValidateInterpretationInput): InterpretationValidationResult {
  if (!validateSchema(input.output)) {
    return {
      ok: false,
      issues: (validateSchema.errors ?? []).map((error: ErrorObject) => issue(
        error.instancePath || "/",
        `schema_${error.keyword}`,
        error.message ?? "Schema validation failed",
      )),
    };
  }

  const output = input.output as unknown as LiuyaoInterpretation;
  const issues: ValidationIssue[] = [];
  const factsById = new Map(deriveChartFacts(input.chart).facts.map((fact) => [fact.id, fact]));
  if (output.chartId !== input.chartId) {
    issues.push(issue("/chartId", "chart_id_mismatch", "Interpretation refers to a different chart"));
  }
  if (output.chartRuleVersion !== input.chart.ruleVersion) {
    issues.push(issue("/chartRuleVersion", "chart_rule_mismatch", "Chart rule version does not match the input chart"));
  }
  if (output.anchors.selfLine !== input.chart.primaryHexagram.selfLine) {
    issues.push(issue("/anchors/selfLine", "self_line_mismatch", "Self line does not match the chart"));
  }
  if (output.anchors.responseLine !== input.chart.primaryHexagram.responseLine) {
    issues.push(issue("/anchors/responseLine", "response_line_mismatch", "Response line does not match the chart"));
  }

  if (output.anchors.primaryUsefulGod === null && output.anchors.usefulGodCandidates.length === 0) {
    issues.push(issue(
      "/anchors",
      "missing_useful_god",
      "Provide a primary useful god or at least one explicit candidate",
    ));
  }
  if (output.anchors.primaryUsefulGod !== null) {
    validateUsefulGod(output.anchors.primaryUsefulGod, "/anchors/primaryUsefulGod", input.chart, issues);
  }
  output.anchors.usefulGodCandidates.forEach((anchor, index) => {
    validateUsefulGod(anchor, `/anchors/usefulGodCandidates/${index}`, input.chart, issues);
  });

  output.anchors.secondaryAnchors.forEach((anchor, index) => {
    if (!input.chart.primaryLines.some((line) => line.position === anchor.line)) {
      issues.push(issue(
        `/anchors/secondaryAnchors/${index}/line`,
        "unknown_line",
        `Line ${anchor.line} does not exist in the chart`,
      ));
    }
  });

  output.evidence.forEach((evidence, index) => {
    const path = `/evidence/${index}`;
    if (evidence.source === "context") {
      if (evidence.line !== null) {
        issues.push(issue(`${path}/line`, "context_line_forbidden", "Context evidence must not claim a chart line"));
      }
      if (evidence.factIds.length !== 0) {
        issues.push(issue(`${path}/factIds`, "context_fact_ids_forbidden", "Context evidence cannot cite chart fact IDs"));
      }
      return;
    }
    if (evidence.factIds.length === 0) {
      issues.push(issue(`${path}/factIds`, "fact_id_required", "Chart evidence must cite at least one computed fact ID"));
    }
    for (const factId of evidence.factIds) {
      const fact = factsById.get(factId);
      if (!fact) {
        issues.push(issue(`${path}/factIds`, "unknown_fact_id", `Computed fact ${factId} does not exist`));
        continue;
      }
      if (fact.line !== evidence.line) {
        issues.push(issue(`${path}/factIds`, "fact_line_mismatch", `Computed fact ${factId} belongs to line ${fact.line}`));
      }
      if (fact.category !== evidence.source) {
        issues.push(issue(`${path}/factIds`, "fact_source_mismatch", `Computed fact ${factId} is ${fact.category}, not ${evidence.source}`));
      }
    }
    if (evidence.line === null || !input.chart.primaryLines.some((line) => line.position === evidence.line)) {
      issues.push(issue(`${path}/line`, "evidence_line_required", "Chart evidence must reference an existing line"));
      return;
    }
    if (evidence.source === "change" && !input.chart.changingLines.includes(evidence.line)) {
      issues.push(issue(`${path}/line`, "non_moving_change", `Line ${evidence.line} is not a changing line`));
    }
  });

  return issues.length === 0 ? { ok: true, value: output } : { ok: false, issues };
}
