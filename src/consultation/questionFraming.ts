import type { AiGateway, StructuredGenerationRequest } from "../ai/types.js";
import type { InterpretationTopic } from "../interpretation/types.js";

export interface QuestionFramingResult {
  readonly status: "ready" | "needs_clarification";
  readonly normalizedQuestion: string;
  readonly missingReason: string | null;
  readonly clarifyingQuestion: string | null;
  readonly choices: readonly string[];
}

export function resolveClarificationAnswer(
  answer: string,
  choices: readonly string[],
): string {
  const trimmed = answer.trim();
  if (/^\d+$/u.test(trimmed)) {
    const selected = choices[Number(trimmed) - 1];
    if (selected) return selected;
  }
  return trimmed;
}

const framingSchema: Readonly<Record<string, unknown>> = {
  type: "object",
  additionalProperties: false,
  required: ["status", "normalizedQuestion", "missingReason", "clarifyingQuestion", "choices"],
  properties: {
    status: { enum: ["ready", "needs_clarification"] },
    normalizedQuestion: { type: "string", minLength: 1, maxLength: 1000 },
    missingReason: { anyOf: [{ type: "string", minLength: 1, maxLength: 500 }, { type: "null" }] },
    clarifyingQuestion: { anyOf: [{ type: "string", minLength: 5, maxLength: 800 }, { type: "null" }] },
    choices: { type: "array", maxItems: 4, items: { type: "string", minLength: 1, maxLength: 200 } },
  },
};

function isResult(value: unknown): value is QuestionFramingResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<QuestionFramingResult>;
  if (candidate.status !== "ready" && candidate.status !== "needs_clarification") return false;
  if (typeof candidate.normalizedQuestion !== "string" || candidate.normalizedQuestion.trim() === "") return false;
  if (!Array.isArray(candidate.choices) || !candidate.choices.every((choice) => typeof choice === "string")) return false;
  if (candidate.missingReason !== null && typeof candidate.missingReason !== "string") return false;
  if (candidate.status === "needs_clarification") {
    return typeof candidate.clarifyingQuestion === "string" && candidate.clarifyingQuestion.trim() !== "";
  }
  return candidate.clarifyingQuestion === null && candidate.missingReason === null && candidate.choices.length === 0;
}

export async function frameConsultationQuestion(input: {
  readonly gateway: AiGateway;
  readonly topic: InterpretationTopic;
  readonly question: string;
  readonly timeWindow: string | null;
  readonly background: readonly string[];
}): Promise<QuestionFramingResult> {
  const request: StructuredGenerationRequest = {
    schemaName: "liuyao_question_framing_v0_1",
    schema: framingSchema,
    systemPrompt: [
      "你只负责判断一次六爻占问在起卦前是否缺少会实质改变取用神、所问对象、当前状态或时间尺度的关键信息。不要解卦，不要给建议。",
      "信息足够时必须返回 ready，不要为了显得周到而提问。信息不足时只问一个合并后的关键问题，并尽量给二至四个容易选择的答案。",
      "尤其不能把‘以前发生过’擅自当成‘当前仍在发生’，不能把用户未说明的持仓、关系状态、流程阶段或时间范围定义为事实。",
    ].join("\n\n"),
    userPrompt: JSON.stringify({
      topic: input.topic,
      question: input.question,
      timeWindow: input.timeWindow,
      background: input.background,
    }, null, 2),
  };
  const output = await input.gateway.generateObject(request);
  if (!isResult(output)) {
    return {
      status: "ready",
      normalizedQuestion: input.question,
      missingReason: null,
      clarifyingQuestion: null,
      choices: [],
    };
  }
  return output;
}
