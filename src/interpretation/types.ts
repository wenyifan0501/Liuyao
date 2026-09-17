import type { SixRelative } from "../domain/types.js";

export type InterpretationTopic =
  | "daily"
  | "career"
  | "exam"
  | "finance"
  | "relationship"
  | "cooperation"
  | "travel"
  | "lost_property"
  | "health_tendency"
  | "market_trend"
  | "other";

export type EvidenceSource = "line" | "month" | "day" | "change" | "context";
export type EvidenceEffect = "supporting" | "weakening" | "ambiguous";
export type JudgmentTendency =
  | "favorable"
  | "mixed_favorable"
  | "neutral_uncertain"
  | "mixed_unfavorable"
  | "unfavorable";
export type Confidence = "low" | "medium" | "high";

export interface UsefulGodAnchor {
  readonly relative: SixRelative;
  readonly line: number;
  readonly reason: string;
}

export interface SecondaryAnchor {
  readonly kind: "self" | "response" | "counterpart" | "document" | "income" | "other";
  readonly line: number;
  readonly reason: string;
}

export interface InterpretationEvidence {
  readonly source: EvidenceSource;
  readonly line: number | null;
  readonly factIds: readonly string[];
  readonly effect: EvidenceEffect;
  readonly fact: string;
  readonly reason: string;
}

export interface InterpretationDecision {
  readonly coreDilemma: string;
  readonly directAnswer: string;
  readonly preferredOption: string;
  readonly alternativeTradeoff: string;
  readonly personalizedSignals: readonly string[];
  readonly reversalConditions: readonly string[];
}

export interface TimingCandidate {
  readonly window: string;
  readonly basis: string;
  readonly certainty: "low" | "medium";
}

export interface LiuyaoInterpretation {
  readonly analysisVersion: "liuyao-interpretation-v0.2";
  readonly chartId: string;
  readonly chartRuleVersion: "liuyao-chart-v0.1";
  readonly question: {
    readonly topic: InterpretationTopic;
    readonly normalizedQuestion: string;
    readonly timeWindow: string | null;
  };
  readonly anchors: {
    readonly selfLine: number;
    readonly responseLine: number;
    readonly primaryUsefulGod: UsefulGodAnchor | null;
    readonly usefulGodCandidates: readonly UsefulGodAnchor[];
    readonly secondaryAnchors: readonly SecondaryAnchor[];
  };
  readonly evidence: readonly InterpretationEvidence[];
  readonly decision: InterpretationDecision;
  readonly judgment: {
    readonly tendency: JudgmentTendency;
    readonly summary: string;
    readonly conditions: readonly string[];
    readonly confidence: Confidence;
    readonly uncertainties: readonly string[];
  };
  readonly timingCandidates: readonly TimingCandidate[];
  readonly actionAdvice: readonly string[];
  readonly nextQuestion: {
    readonly prompt: string;
    readonly purpose: string;
    readonly choices: readonly string[];
  };
  readonly safetyNotes: readonly string[];
}

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type InterpretationValidationResult =
  | { readonly ok: true; readonly value: LiuyaoInterpretation }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };
