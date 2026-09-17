import type { LiuyaoChart } from "../../src/domain/types.js";
import type { InterpretationTopic } from "../../src/interpretation/types.js";

export interface CreateConsultation {
  question: string;
  topic: InterpretationTopic;
  background: string[];
  timeWindow: string | null;
  timezone: string;
}
export interface CastConsultation {
  method: "simulated_three_coins" | "manual" | "three_coins";
  values?: number[];
}
export interface ConsultationView {
  favorite?: boolean;
  id: string;
  question: string;
  topic: InterpretationTopic;
  background: string[];
  timeWindow: string | null;
  timezone: string;
  status: "draft" | "chart_ready";
  chart: LiuyaoChart | null;
  createdAt: string;
}
export interface TrialView {
  remainingConsultations: number;
  followUpsPerConsultation: number;
}

export type AiRunKind = "framing" | "initial" | "follow_up";
export interface AiRunView {
  id: string;
  kind: AiRunKind;
  question: string;
  status: "queued" | "running" | "succeeded" | "failed";
  text: string;
  error: string | null;
  createdAt: string;
}
export interface FramingView {
  status: "ready" | "needs_clarification";
  normalizedQuestion: string;
  clarifyingQuestion: string | null;
  choices: string[];
  background: string[];
}
export interface AiConversationView {
  runs: AiRunView[];
  framing: FramingView | null;
  remainingFollowUps: number;
}
