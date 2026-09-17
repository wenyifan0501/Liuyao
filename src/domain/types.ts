export type CastValue = 6 | 7 | 8 | 9;
export type BinaryLine = 0 | 1;
export type BinaryHexagram = readonly [
  BinaryLine,
  BinaryLine,
  BinaryLine,
  BinaryLine,
  BinaryLine,
  BinaryLine,
];

export type YinYang = "yin" | "yang";
export type FiveElement = "wood" | "fire" | "earth" | "metal" | "water";
export type TrigramName = "乾" | "兑" | "离" | "震" | "巽" | "坎" | "艮" | "坤";
export type HeavenlyStem = "甲" | "乙" | "丙" | "丁" | "戊" | "己" | "庚" | "辛" | "壬" | "癸";
export type EarthlyBranch = "子" | "丑" | "寅" | "卯" | "辰" | "巳" | "午" | "未" | "申" | "酉" | "戌" | "亥";
export type SixRelative = "siblings" | "offspring" | "parents" | "wealth" | "officials";
export type SixSpirit = "青龙" | "朱雀" | "勾陈" | "螣蛇" | "白虎" | "玄武";
export type PalaceStage = "pure" | "first" | "second" | "third" | "fourth" | "fifth" | "wandering" | "returning";

export interface CalendarContext {
  readonly castAt: string;
  readonly timezone: string;
  readonly calendarRuleVersion: "sexagenary-calendar-v0.1";
  readonly dayBoundary: "midnight";
  readonly monthBranch: EarthlyBranch;
  readonly dayStem: HeavenlyStem;
  readonly dayBranch: EarthlyBranch;
}

export interface TrigramDefinition {
  readonly name: TrigramName;
  readonly image: "天" | "泽" | "火" | "雷" | "风" | "水" | "山" | "地";
  readonly binary: readonly [BinaryLine, BinaryLine, BinaryLine];
  readonly element: FiveElement;
}

export interface HexagramDefinition {
  readonly kingWenNumber: number;
  readonly name: string;
  readonly upperTrigram: TrigramName;
  readonly lowerTrigram: TrigramName;
  readonly binary: BinaryHexagram;
}

export interface HexagramSummary extends HexagramDefinition {
  readonly palace: TrigramName;
  readonly palaceElement: FiveElement;
  readonly palaceStage: PalaceStage;
  readonly selfLine: number;
  readonly responseLine: number;
}

export interface PrimaryChartLine {
  readonly position: number;
  readonly castingValue: CastValue;
  readonly yinYang: YinYang;
  readonly moving: boolean;
  readonly stem: HeavenlyStem;
  readonly branch: EarthlyBranch;
  readonly element: FiveElement;
  readonly relative: SixRelative;
  readonly spirit: SixSpirit;
  readonly isSelf: boolean;
  readonly isResponse: boolean;
  readonly isVoid: boolean;
}

export interface ChangedChartLine {
  readonly position: number;
  readonly yinYang: YinYang;
  readonly sourceWasMoving: boolean;
  readonly stem: HeavenlyStem;
  readonly branch: EarthlyBranch;
  readonly element: FiveElement;
  readonly relative: SixRelative;
  readonly spirit: SixSpirit;
  readonly sourceWasSelf: boolean;
  readonly sourceWasResponse: boolean;
  readonly isVoid: boolean;
}

export interface LiuyaoChart {
  readonly schemaVersion: "liuyao-chart-schema-v0.1";
  readonly ruleVersion: "liuyao-chart-v0.1";
  readonly casting: {
    readonly method: "three_coins" | "simulated_three_coins" | "manual";
    readonly lineOrder: "bottom_to_top";
    readonly values: readonly CastValue[];
  };
  readonly timeContext: CalendarContext & {
    readonly voidBranches: readonly [EarthlyBranch, EarthlyBranch];
  };
  readonly primaryHexagram: HexagramSummary;
  readonly changedHexagram: HexagramSummary;
  readonly changingLines: readonly number[];
  readonly primaryLines: readonly PrimaryChartLine[];
  readonly changedLines: readonly ChangedChartLine[];
}

export interface BuildChartInput {
  readonly method: LiuyaoChart["casting"]["method"];
  readonly values: readonly number[];
  readonly calendar: CalendarContext;
}
