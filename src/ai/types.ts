import type { ValidationIssue } from "../interpretation/types.js";

export interface StructuredGenerationRequest {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly schemaName: string;
  readonly schema: Readonly<Record<string, unknown>>;
  readonly repair?: {
    readonly previousOutput: unknown;
    readonly issues: readonly ValidationIssue[];
  };
}

export interface TextGenerationRequest {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly maxTokens?: number;
}

export interface AiGateway {
  generateObject(request: StructuredGenerationRequest): Promise<unknown>;
  generateText(request: TextGenerationRequest): Promise<string>;
}

export interface LiuyaoSkillBundle {
  readonly analysisRules: string;
  readonly narrativeRules: string;
  readonly directRules: string;
}
