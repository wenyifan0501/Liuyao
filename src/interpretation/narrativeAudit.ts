import type { FiveElement } from "../domain/types.js";
import { relateElements } from "../domain/derivedFacts.js";

export interface NarrativeAuditIssue {
  readonly code: "invalid_generating_relation" | "invalid_controlling_relation";
  readonly claim: string;
  readonly message: string;
}

const ELEMENTS: Readonly<Record<string, FiveElement>> = {
  木: "wood", 火: "fire", 土: "earth", 金: "metal", 水: "water",
};

export function auditNarrativeHardFacts(text: string): readonly NarrativeAuditIssue[] {
  const issues: NarrativeAuditIssue[] = [];
  for (const match of text.matchAll(/([木火土金水])(生|克)([木火土金水])/gu)) {
    const source = ELEMENTS[match[1] ?? ""];
    const target = ELEMENTS[match[3] ?? ""];
    if (!source || !target) continue;
    const relation = relateElements(source, target);
    const expected = match[2] === "生" ? "source_generates_target" : "source_controls_target";
    if (relation !== expected) {
      issues.push({
        code: match[2] === "生" ? "invalid_generating_relation" : "invalid_controlling_relation",
        claim: match[0],
        message: `${match[0]} 的五行方向不成立`,
      });
    }
  }
  return issues;
}
