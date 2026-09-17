import type { InterpretationTopic, LiuyaoInterpretation } from "../interpretation/types.js";
import type { LiuyaoChart } from "../domain/types.js";
import type { DerivedChartFacts } from "../domain/derivedFacts.js";

export interface ConsultationMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly kind: "question" | "interpretation" | "follow_up" | "feedback";
  readonly content: string;
  readonly createdAt: string;
}

export interface ConfirmedFact {
  readonly id: string;
  readonly content: string;
  readonly sourceMessageId: string;
  readonly confirmedAt: string;
}

export interface ConsultationState {
  readonly consultationId: string;
  readonly chartId: string;
  readonly topic: InterpretationTopic;
  readonly originalQuestion: string;
  readonly timeWindow: string | null;
  readonly initialBackground: readonly string[];
  readonly chart: LiuyaoChart;
  readonly interpretation: LiuyaoInterpretation;
  readonly conversationSummary: string;
  readonly confirmedFacts: readonly ConfirmedFact[];
  readonly messages: readonly ConsultationMessage[];
}

export interface FollowUpContext {
  readonly consultationId: string;
  readonly immutable: {
    readonly chartId: string;
    readonly originalQuestion: string;
    readonly topic: InterpretationTopic;
    readonly timeWindow: string | null;
    readonly chart: LiuyaoChart;
    readonly computedFacts: DerivedChartFacts;
    readonly initialInterpretation: LiuyaoInterpretation;
  };
  readonly evolving: {
    readonly conversationSummary: string;
    readonly confirmedFacts: readonly ConfirmedFact[];
    readonly recentMessages: readonly ConsultationMessage[];
  };
  readonly currentQuestion: string;
}
