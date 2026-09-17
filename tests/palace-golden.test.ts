import { describe, expect, it } from "vitest";
import { PALACE_CHANGE_MASKS, PALACE_STAGES, TRIGRAMS, buildChart, findHexagram, findPalace } from "../src/index.js";
import type { BinaryHexagram, BinaryLine, BuildChartInput, CastValue, TrigramName } from "../src/index.js";

const calendar: BuildChartInput["calendar"] = {
  castAt: "1986-05-29T00:00:00+08:00",
  timezone: "Asia/Shanghai",
  calendarRuleVersion: "sexagenary-calendar-v0.1",
  dayBoundary: "midnight",
  monthBranch: "巳",
  dayStem: "癸",
  dayBranch: "酉",
};

const expectedPalaces: Readonly<Record<TrigramName, readonly string[]>> = {
  乾: ["乾为天", "天风姤", "天山遁", "天地否", "风地观", "山地剥", "火地晋", "火天大有"],
  震: ["震为雷", "雷地豫", "雷水解", "雷风恒", "地风升", "水风井", "泽风大过", "泽雷随"],
  坎: ["坎为水", "水泽节", "水雷屯", "水火既济", "泽火革", "雷火丰", "地火明夷", "地水师"],
  艮: ["艮为山", "山火贲", "山天大畜", "山泽损", "火泽睽", "天泽履", "风泽中孚", "风山渐"],
  坤: ["坤为地", "地雷复", "地泽临", "地天泰", "雷天大壮", "泽天夬", "水天需", "水地比"],
  巽: ["巽为风", "风天小畜", "风火家人", "风雷益", "天雷无妄", "火雷噬嗑", "山雷颐", "山风蛊"],
  离: ["离为火", "火山旅", "火风鼎", "火水未济", "山水蒙", "风水涣", "天水讼", "天火同人"],
  兑: ["兑为泽", "泽水困", "泽地萃", "泽山咸", "水山蹇", "地山谦", "雷山小过", "雷泽归妹"],
};

const expectedPureNaJia: Readonly<Record<TrigramName, readonly string[]>> = {
  乾: ["甲子", "甲寅", "甲辰", "壬午", "壬申", "壬戌"],
  震: ["庚子", "庚寅", "庚辰", "庚午", "庚申", "庚戌"],
  坎: ["戊寅", "戊辰", "戊午", "戊申", "戊戌", "戊子"],
  艮: ["丙辰", "丙午", "丙申", "丙戌", "丙子", "丙寅"],
  坤: ["乙未", "乙巳", "乙卯", "癸丑", "癸亥", "癸酉"],
  巽: ["辛丑", "辛亥", "辛酉", "辛未", "辛巳", "辛卯"],
  离: ["己卯", "己丑", "己亥", "己酉", "己未", "己巳"],
  兑: ["丁巳", "丁卯", "丁丑", "丁亥", "丁酉", "丁未"],
};

function flip(binary: BinaryHexagram, positions: readonly number[]): BinaryHexagram {
  const result = [...binary] as BinaryLine[];
  for (const position of positions) result[position] = result[position] === 1 ? 0 : 1;
  return result as unknown as BinaryHexagram;
}

describe("eight-palace golden tables", () => {
  for (const [palace, expectedNames] of Object.entries(expectedPalaces) as [TrigramName, readonly string[]][]) {
    it(`matches all eight hexagrams of the ${palace} palace`, () => {
      const pure = [...TRIGRAMS[palace].binary, ...TRIGRAMS[palace].binary] as BinaryHexagram;
      const actual = PALACE_STAGES.map((stage) => {
        const binary = flip(pure, PALACE_CHANGE_MASKS[stage]);
        expect(findPalace(binary)).toMatchObject({ palace, palaceStage: stage });
        return findHexagram(binary).name;
      });
      expect(actual).toEqual(expectedNames);
    });
  }

  for (const [palace, expectedNaJia] of Object.entries(expectedPureNaJia) as [TrigramName, readonly string[]][]) {
    it(`matches pure ${palace} Na Jia`, () => {
      const values = [...TRIGRAMS[palace].binary, ...TRIGRAMS[palace].binary]
        .map((line) => line === 1 ? 7 : 8) as CastValue[];
      const chart = buildChart({ method: "manual", values, calendar });
      expect(chart.primaryHexagram).toMatchObject({ palace, palaceStage: "pure" });
      expect(chart.primaryLines.map((line) => `${line.stem}${line.branch}`)).toEqual(expectedNaJia);
    });
  }
});
