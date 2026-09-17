import type { ConsultationState, FollowUpContext } from "./types.js";
import { deriveChartFacts } from "../domain/derivedFacts.js";

export function buildFollowUpContext(
  state: ConsultationState,
  currentQuestion: string,
  recentMessageLimit = 12,
): FollowUpContext {
  const question = currentQuestion.trim();
  if (question.length === 0) throw new Error("A follow-up question is required");
  if (!Number.isInteger(recentMessageLimit) || recentMessageLimit < 1 || recentMessageLimit > 50) {
    throw new Error("recentMessageLimit must be an integer from 1 to 50");
  }
  if (state.chartId !== state.interpretation.chartId) {
    throw new Error("Consultation interpretation is linked to a different chart");
  }
  if (state.chart.ruleVersion !== state.interpretation.chartRuleVersion) {
    throw new Error("Consultation interpretation uses a different chart rule version");
  }

  return {
    consultationId: state.consultationId,
    immutable: {
      chartId: state.chartId,
      originalQuestion: state.originalQuestion,
      topic: state.topic,
      timeWindow: state.timeWindow,
      chart: state.chart,
      computedFacts: deriveChartFacts(state.chart),
      initialInterpretation: state.interpretation,
    },
    evolving: {
      conversationSummary: state.conversationSummary,
      confirmedFacts: state.confirmedFacts,
      recentMessages: state.messages.slice(-recentMessageLimit),
    },
    currentQuestion: question,
  };
}
