import {
  BRANCH_ELEMENTS,
  EARTHLY_BRANCHES,
  HEAVENLY_STEMS,
  HEXAGRAM_BY_BINARY,
  HEXAGRAMS,
  NA_JIA,
  PALACE_CHANGE_MASKS,
  PALACE_ORDER,
  PALACE_STAGES,
  SELF_LINES,
  TRIGRAMS,
  binaryKey,
} from "./constants.js";
import type {
  BinaryHexagram,
  BinaryLine,
  BuildChartInput,
  CastValue,
  EarthlyBranch,
  FiveElement,
  HeavenlyStem,
  HexagramDefinition,
  HexagramSummary,
  LiuyaoChart,
  PalaceStage,
  SixRelative,
  SixSpirit,
  TrigramName,
  YinYang,
} from "./types.js";

const GENERATES: Readonly<Record<FiveElement, FiveElement>> = {
  wood: "fire", fire: "earth", earth: "metal", metal: "water", water: "wood",
};
const CONTROLS: Readonly<Record<FiveElement, FiveElement>> = {
  wood: "earth", earth: "water", water: "fire", fire: "metal", metal: "wood",
};
const SIX_SPIRITS: readonly SixSpirit[] = ["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"];
const SPIRIT_START: Readonly<Record<HeavenlyStem, number>> = {
  甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5,
};

interface PalaceIdentity {
  readonly palace: TrigramName;
  readonly palaceElement: FiveElement;
  readonly palaceStage: PalaceStage;
  readonly selfLine: number;
  readonly responseLine: number;
}

function flip(binary: BinaryHexagram, positions: readonly number[]): BinaryHexagram {
  const result = [...binary] as BinaryLine[];
  for (const position of positions) {
    const current = result[position];
    if (current === undefined) throw new Error(`Invalid line index: ${position}`);
    result[position] = current === 1 ? 0 : 1;
  }
  return result as unknown as BinaryHexagram;
}

function pureHexagramFor(palace: TrigramName): BinaryHexagram {
  return [...TRIGRAMS[palace].binary, ...TRIGRAMS[palace].binary] as BinaryHexagram;
}

const PALACE_BY_BINARY: ReadonlyMap<string, PalaceIdentity> = (() => {
  const result = new Map<string, PalaceIdentity>();
  for (const palace of PALACE_ORDER) {
    const pure = pureHexagramFor(palace);
    for (const stage of PALACE_STAGES) {
      const binary = flip(pure, PALACE_CHANGE_MASKS[stage]);
      const selfLine = SELF_LINES[stage];
      result.set(binaryKey(binary), {
        palace,
        palaceElement: TRIGRAMS[palace].element,
        palaceStage: stage,
        selfLine,
        responseLine: selfLine <= 3 ? selfLine + 3 : selfLine - 3,
      });
    }
  }
  if (result.size !== 64) throw new Error(`Palace map must contain 64 unique hexagrams, got ${result.size}`);
  return result;
})();

export function assertCastValues(values: readonly number[]): asserts values is readonly CastValue[] {
  if (values.length !== 6) throw new Error(`Exactly six casting values are required, got ${values.length}`);
  for (const value of values) {
    if (value !== 6 && value !== 7 && value !== 8 && value !== 9) {
      throw new Error(`Casting values must be 6, 7, 8, or 9; got ${value}`);
    }
  }
}

export function primaryBinary(values: readonly CastValue[]): BinaryHexagram {
  return values.map((value) => value === 7 || value === 9 ? 1 : 0) as unknown as BinaryHexagram;
}

export function changedBinary(values: readonly CastValue[]): BinaryHexagram {
  return values.map((value) => value === 6 || value === 7 ? 1 : 0) as unknown as BinaryHexagram;
}

export function findHexagram(binary: BinaryHexagram): HexagramDefinition {
  const found = HEXAGRAM_BY_BINARY.get(binaryKey(binary));
  if (!found) throw new Error(`Unknown hexagram binary: ${binaryKey(binary)}`);
  return found;
}

export function findPalace(binary: BinaryHexagram): PalaceIdentity {
  const found = PALACE_BY_BINARY.get(binaryKey(binary));
  if (!found) throw new Error(`No palace mapping for hexagram: ${binaryKey(binary)}`);
  return found;
}

function summarize(binary: BinaryHexagram): HexagramSummary {
  return { ...findHexagram(binary), ...findPalace(binary) };
}

export function sixRelative(palace: FiveElement, line: FiveElement): SixRelative {
  if (palace === line) return "siblings";
  if (GENERATES[palace] === line) return "offspring";
  if (GENERATES[line] === palace) return "parents";
  if (CONTROLS[palace] === line) return "wealth";
  if (CONTROLS[line] === palace) return "officials";
  throw new Error(`Unable to determine relative for ${palace} and ${line}`);
}

export function sixSpirits(dayStem: HeavenlyStem): readonly SixSpirit[] {
  const start = SPIRIT_START[dayStem];
  return Array.from({ length: 6 }, (_, index) => SIX_SPIRITS[(start + index) % 6] as SixSpirit);
}

export function voidBranches(dayStem: HeavenlyStem, dayBranch: EarthlyBranch): readonly [EarthlyBranch, EarthlyBranch] {
  const stemIndex = HEAVENLY_STEMS.indexOf(dayStem);
  const branchIndex = EARTHLY_BRANCHES.indexOf(dayBranch);
  const cycleIndex = Array.from({ length: 60 }, (_, index) => index)
    .find((index) => index % 10 === stemIndex && index % 12 === branchIndex);
  if (cycleIndex === undefined) throw new Error(`${dayStem}${dayBranch} is not a valid sexagenary day`);
  const xunStartBranch = Math.floor(cycleIndex / 10) * 10 % 12;
  return [
    EARTHLY_BRANCHES[(xunStartBranch + 10) % 12] as EarthlyBranch,
    EARTHLY_BRANCHES[(xunStartBranch + 11) % 12] as EarthlyBranch,
  ];
}

function yinYang(line: BinaryLine): YinYang {
  return line === 1 ? "yang" : "yin";
}

function naJiaAt(hexagram: HexagramDefinition, positionIndex: number) {
  const isInner = positionIndex < 3;
  const trigram = isInner ? hexagram.lowerTrigram : hexagram.upperTrigram;
  const side = isInner ? NA_JIA[trigram].inner : NA_JIA[trigram].outer;
  const sideIndex = isInner ? positionIndex : positionIndex - 3;
  const branch = side.branches[sideIndex];
  if (!branch) throw new Error(`Missing Na Jia branch for ${trigram} at line ${positionIndex + 1}`);
  return { stem: side.stem, branch, element: BRANCH_ELEMENTS[branch] };
}

function validateCalendar(input: BuildChartInput["calendar"]): void {
  if (input.calendarRuleVersion !== "sexagenary-calendar-v0.1") {
    throw new Error(`Unsupported calendar rule version: ${input.calendarRuleVersion}`);
  }
  if (input.dayBoundary !== "midnight") throw new Error("liuyao-chart-v0.1 requires midnight day boundary");
  if (!input.castAt.includes("T")) throw new Error("castAt must be an ISO 8601 date-time string");
  if (input.timezone.trim() === "") throw new Error("timezone is required");
  void voidBranches(input.dayStem, input.dayBranch);
}

export function buildChart(input: BuildChartInput): LiuyaoChart {
  assertCastValues(input.values);
  validateCalendar(input.calendar);

  const values = [...input.values] as CastValue[];
  const primaryBits = primaryBinary(values);
  const changedBits = changedBinary(values);
  const primary = summarize(primaryBits);
  const changed = summarize(changedBits);
  const spirits = sixSpirits(input.calendar.dayStem);
  const voids = voidBranches(input.calendar.dayStem, input.calendar.dayBranch);
  const changingLines = values.flatMap((value, index) => value === 6 || value === 9 ? [index + 1] : []);

  const primaryLines = values.map((castingValue, index) => {
    const naJia = naJiaAt(primary, index);
    const position = index + 1;
    return {
      position,
      castingValue,
      yinYang: yinYang(primaryBits[index] as BinaryLine),
      moving: castingValue === 6 || castingValue === 9,
      ...naJia,
      relative: sixRelative(primary.palaceElement, naJia.element),
      spirit: spirits[index] as SixSpirit,
      isSelf: position === primary.selfLine,
      isResponse: position === primary.responseLine,
      isVoid: voids.includes(naJia.branch),
    };
  });

  const changedLines = changedBits.map((bit, index) => {
    const naJia = naJiaAt(changed, index);
    const position = index + 1;
    return {
      position,
      yinYang: yinYang(bit),
      sourceWasMoving: changingLines.includes(position),
      ...naJia,
      relative: sixRelative(primary.palaceElement, naJia.element),
      spirit: spirits[index] as SixSpirit,
      sourceWasSelf: position === primary.selfLine,
      sourceWasResponse: position === primary.responseLine,
      isVoid: voids.includes(naJia.branch),
    };
  });

  return {
    schemaVersion: "liuyao-chart-schema-v0.1",
    ruleVersion: "liuyao-chart-v0.1",
    casting: { method: input.method, lineOrder: "bottom_to_top", values },
    timeContext: { ...input.calendar, voidBranches: voids },
    primaryHexagram: primary,
    changedHexagram: changed,
    changingLines,
    primaryLines,
    changedLines,
  };
}

export function validateStaticTables(): void {
  if (HEXAGRAMS.length !== 64 || HEXAGRAM_BY_BINARY.size !== 64) {
    throw new Error("The hexagram table must contain 64 unique binary entries");
  }
  const numbers = new Set(HEXAGRAMS.map((item) => item.kingWenNumber));
  if (numbers.size !== 64 || Math.min(...numbers) !== 1 || Math.max(...numbers) !== 64) {
    throw new Error("King Wen numbers must uniquely cover 1 through 64");
  }
}
