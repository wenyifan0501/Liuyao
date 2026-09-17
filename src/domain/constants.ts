import type {
  BinaryHexagram,
  EarthlyBranch,
  FiveElement,
  HeavenlyStem,
  HexagramDefinition,
  PalaceStage,
  TrigramDefinition,
  TrigramName,
} from "./types.js";

export const HEAVENLY_STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"] as const;
export const EARTHLY_BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;

export const BRANCH_ELEMENTS: Readonly<Record<EarthlyBranch, FiveElement>> = {
  子: "water", 丑: "earth", 寅: "wood", 卯: "wood", 辰: "earth", 巳: "fire",
  午: "fire", 未: "earth", 申: "metal", 酉: "metal", 戌: "earth", 亥: "water",
};

export const TRIGRAMS: Readonly<Record<TrigramName, TrigramDefinition>> = {
  乾: { name: "乾", image: "天", binary: [1, 1, 1], element: "metal" },
  兑: { name: "兑", image: "泽", binary: [1, 1, 0], element: "metal" },
  离: { name: "离", image: "火", binary: [1, 0, 1], element: "fire" },
  震: { name: "震", image: "雷", binary: [1, 0, 0], element: "wood" },
  巽: { name: "巽", image: "风", binary: [0, 1, 1], element: "wood" },
  坎: { name: "坎", image: "水", binary: [0, 1, 0], element: "water" },
  艮: { name: "艮", image: "山", binary: [0, 0, 1], element: "earth" },
  坤: { name: "坤", image: "地", binary: [0, 0, 0], element: "earth" },
};

export const TRIGRAM_ORDER = ["乾", "兑", "离", "震", "巽", "坎", "艮", "坤"] as const;
export const PALACE_ORDER = ["乾", "震", "坎", "艮", "坤", "巽", "离", "兑"] as const;

type HexagramSeed = readonly [upper: TrigramName, lower: TrigramName, number: number, name: string];

const HEXAGRAM_SEEDS: readonly HexagramSeed[] = [
  ["乾", "乾", 1, "乾为天"], ["乾", "兑", 10, "天泽履"], ["乾", "离", 13, "天火同人"], ["乾", "震", 25, "天雷无妄"],
  ["乾", "巽", 44, "天风姤"], ["乾", "坎", 6, "天水讼"], ["乾", "艮", 33, "天山遁"], ["乾", "坤", 12, "天地否"],
  ["兑", "乾", 43, "泽天夬"], ["兑", "兑", 58, "兑为泽"], ["兑", "离", 49, "泽火革"], ["兑", "震", 17, "泽雷随"],
  ["兑", "巽", 28, "泽风大过"], ["兑", "坎", 47, "泽水困"], ["兑", "艮", 31, "泽山咸"], ["兑", "坤", 45, "泽地萃"],
  ["离", "乾", 14, "火天大有"], ["离", "兑", 38, "火泽睽"], ["离", "离", 30, "离为火"], ["离", "震", 21, "火雷噬嗑"],
  ["离", "巽", 50, "火风鼎"], ["离", "坎", 64, "火水未济"], ["离", "艮", 56, "火山旅"], ["离", "坤", 35, "火地晋"],
  ["震", "乾", 34, "雷天大壮"], ["震", "兑", 54, "雷泽归妹"], ["震", "离", 55, "雷火丰"], ["震", "震", 51, "震为雷"],
  ["震", "巽", 32, "雷风恒"], ["震", "坎", 40, "雷水解"], ["震", "艮", 62, "雷山小过"], ["震", "坤", 16, "雷地豫"],
  ["巽", "乾", 9, "风天小畜"], ["巽", "兑", 61, "风泽中孚"], ["巽", "离", 37, "风火家人"], ["巽", "震", 42, "风雷益"],
  ["巽", "巽", 57, "巽为风"], ["巽", "坎", 59, "风水涣"], ["巽", "艮", 53, "风山渐"], ["巽", "坤", 20, "风地观"],
  ["坎", "乾", 5, "水天需"], ["坎", "兑", 60, "水泽节"], ["坎", "离", 63, "水火既济"], ["坎", "震", 3, "水雷屯"],
  ["坎", "巽", 48, "水风井"], ["坎", "坎", 29, "坎为水"], ["坎", "艮", 39, "水山蹇"], ["坎", "坤", 8, "水地比"],
  ["艮", "乾", 26, "山天大畜"], ["艮", "兑", 41, "山泽损"], ["艮", "离", 22, "山火贲"], ["艮", "震", 27, "山雷颐"],
  ["艮", "巽", 18, "山风蛊"], ["艮", "坎", 4, "山水蒙"], ["艮", "艮", 52, "艮为山"], ["艮", "坤", 23, "山地剥"],
  ["坤", "乾", 11, "地天泰"], ["坤", "兑", 19, "地泽临"], ["坤", "离", 36, "地火明夷"], ["坤", "震", 24, "地雷复"],
  ["坤", "巽", 46, "地风升"], ["坤", "坎", 7, "地水师"], ["坤", "艮", 15, "地山谦"], ["坤", "坤", 2, "坤为地"],
];

export const binaryKey = (binary: readonly number[]): string => binary.join("");

export const HEXAGRAMS: readonly HexagramDefinition[] = HEXAGRAM_SEEDS.map(([upper, lower, kingWenNumber, name]) => ({
  kingWenNumber,
  name,
  upperTrigram: upper,
  lowerTrigram: lower,
  binary: [...TRIGRAMS[lower].binary, ...TRIGRAMS[upper].binary] as BinaryHexagram,
}));

export const HEXAGRAM_BY_BINARY: ReadonlyMap<string, HexagramDefinition> = new Map(
  HEXAGRAMS.map((hexagram) => [binaryKey(hexagram.binary), hexagram]),
);

export const PALACE_STAGES: readonly PalaceStage[] = ["pure", "first", "second", "third", "fourth", "fifth", "wandering", "returning"];
export const PALACE_CHANGE_MASKS: Readonly<Record<PalaceStage, readonly number[]>> = {
  pure: [], first: [0], second: [0, 1], third: [0, 1, 2], fourth: [0, 1, 2, 3],
  fifth: [0, 1, 2, 3, 4], wandering: [0, 1, 2, 4], returning: [4],
};
export const SELF_LINES: Readonly<Record<PalaceStage, number>> = {
  pure: 6, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, wandering: 4, returning: 3,
};

interface NaJiaSide {
  readonly stem: HeavenlyStem;
  readonly branches: readonly [EarthlyBranch, EarthlyBranch, EarthlyBranch];
}

export const NA_JIA: Readonly<Record<TrigramName, { readonly inner: NaJiaSide; readonly outer: NaJiaSide }>> = {
  乾: { inner: { stem: "甲", branches: ["子", "寅", "辰"] }, outer: { stem: "壬", branches: ["午", "申", "戌"] } },
  震: { inner: { stem: "庚", branches: ["子", "寅", "辰"] }, outer: { stem: "庚", branches: ["午", "申", "戌"] } },
  坎: { inner: { stem: "戊", branches: ["寅", "辰", "午"] }, outer: { stem: "戊", branches: ["申", "戌", "子"] } },
  艮: { inner: { stem: "丙", branches: ["辰", "午", "申"] }, outer: { stem: "丙", branches: ["戌", "子", "寅"] } },
  巽: { inner: { stem: "辛", branches: ["丑", "亥", "酉"] }, outer: { stem: "辛", branches: ["未", "巳", "卯"] } },
  离: { inner: { stem: "己", branches: ["卯", "丑", "亥"] }, outer: { stem: "己", branches: ["酉", "未", "巳"] } },
  兑: { inner: { stem: "丁", branches: ["巳", "卯", "丑"] }, outer: { stem: "丁", branches: ["亥", "酉", "未"] } },
  坤: { inner: { stem: "乙", branches: ["未", "巳", "卯"] }, outer: { stem: "癸", branches: ["丑", "亥", "酉"] } },
};

export function isHeavenlyStem(value: string): value is HeavenlyStem {
  return (HEAVENLY_STEMS as readonly string[]).includes(value);
}

export function isEarthlyBranch(value: string): value is EarthlyBranch {
  return (EARTHLY_BRANCHES as readonly string[]).includes(value);
}
