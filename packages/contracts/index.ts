export type DivinationMethod = 'liuyao' | 'meihua' | 'qiuqian' | 'jiaobei';
export const METHOD_NAMES:Record<DivinationMethod,string>={liuyao:'六爻',meihua:'梅花易数',qiuqian:'求签',jiaobei:'掷筊'};
export type MeihuaRole='体'|'用'|'互上'|'互下'|'变';
export type MeihuaSeasonState='旺'|'相'|'休'|'囚'|'死';
export interface MeihuaTrigramFact {role:MeihuaRole;trigram:string;image:string;element:string;relation:string|null;state:MeihuaSeasonState|null}
export interface MeihuaAnalysis {ruleVersion:'meihua-facts-v1';monthBranch:string|null;monthElement:string|null;trigrams:MeihuaTrigramFact[];facts:string[]}
export interface MeihuaResult {method:'meihua';version:1;numbers:number[];primary:string;changed:string;mutual:string;bits:number[];changedBits:number[];mutualBits:number[];moving:number;body:string;use:string;relation:string;rule:string;calendar?:{castAt:string;timezone:string;monthBranch:string};analysis?:MeihuaAnalysis}
export interface QiuqianResult {method:'qiuqian';version:1;number:number;title:string;poem:string[];source:string;rule:string}
export interface JiaobeiResult {method:'jiaobei';version:1;faces:('flat'|'round')[];name:'圣筊'|'笑筊'|'阴筊';meaning:string;rule:string}
export type OracleResult=MeihuaResult|QiuqianResult|JiaobeiResult;
import type { LiuyaoChart } from "../../src/domain/types.js";
import type { InterpretationTopic } from "../../src/interpretation/types.js";

export interface CreateConsultation {
  method?: DivinationMethod;
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
  method?: DivinationMethod;
  oracle?: OracleResult | null;
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
  // null 表示当前不限次数，页面按“不限”展示，不做额度拦截。
  remainingConsultations: number | null;
  followUpsPerConsultation: number | null;
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
  // null 表示追问不限次数。
  remainingFollowUps: number | null;
}
