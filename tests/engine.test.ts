import { describe, expect, it } from "vitest";
import {
  HEXAGRAMS,
  buildChart,
  changedBinary,
  findHexagram,
  findPalace,
  primaryBinary,
  sixRelative,
  sixSpirits,
  validateStaticTables,
  voidBranches,
} from "../src/index.js";
import type { BuildChartInput, CastValue } from "../src/index.js";

const calendar: BuildChartInput["calendar"] = {
  castAt: "2026-09-04T12:00:00+08:00",
  timezone: "Asia/Shanghai",
  calendarRuleVersion: "sexagenary-calendar-v0.1",
  dayBoundary: "midnight",
  monthBranch: "申",
  dayStem: "甲",
  dayBranch: "子",
};

describe("casting values", () => {
  it("maps 6, 7, 8, 9 to primary and changed yin-yang", () => {
    const values: readonly CastValue[] = [6, 7, 8, 9, 7, 8];
    expect(primaryBinary(values)).toEqual([0, 1, 0, 1, 1, 0]);
    expect(changedBinary(values)).toEqual([1, 1, 0, 0, 1, 0]);
  });

  it("rejects an incomplete or invalid casting", () => {
    expect(() => buildChart({ method: "manual", values: [7, 8], calendar })).toThrow("Exactly six");
    expect(() => buildChart({ method: "manual", values: [7, 8, 7, 8, 5, 9], calendar })).toThrow("must be 6, 7, 8, or 9");
  });
});

describe("hexagram and palace tables", () => {
  it("uniquely covers all 64 hexagrams and King Wen numbers", () => {
    expect(() => validateStaticTables()).not.toThrow();
    expect(new Set(HEXAGRAMS.map((item) => item.binary.join(""))).size).toBe(64);
  });

  it("identifies pure Qian and pure Kun", () => {
    expect(findHexagram([1, 1, 1, 1, 1, 1])).toMatchObject({ kingWenNumber: 1, name: "乾为天" });
    expect(findHexagram([0, 0, 0, 0, 0, 0])).toMatchObject({ kingWenNumber: 2, name: "坤为地" });
  });

  it("follows the eight stages of the Qian palace", () => {
    const cases = [
      [[1, 1, 1, 1, 1, 1], "乾为天", "pure", 6],
      [[0, 1, 1, 1, 1, 1], "天风姤", "first", 1],
      [[0, 0, 1, 1, 1, 1], "天山遁", "second", 2],
      [[0, 0, 0, 1, 1, 1], "天地否", "third", 3],
      [[0, 0, 0, 0, 1, 1], "风地观", "fourth", 4],
      [[0, 0, 0, 0, 0, 1], "山地剥", "fifth", 5],
      [[0, 0, 0, 1, 0, 1], "火地晋", "wandering", 4],
      [[1, 1, 1, 1, 0, 1], "火天大有", "returning", 3],
    ] as const;
    for (const [binary, name, stage, selfLine] of cases) {
      expect(findHexagram(binary).name).toBe(name);
      expect(findPalace(binary)).toMatchObject({ palace: "乾", palaceStage: stage, selfLine });
    }
  });
});

describe("relations, spirits, and void branches", () => {
  it("derives all five relatives from the palace element", () => {
    expect(sixRelative("wood", "wood")).toBe("siblings");
    expect(sixRelative("wood", "fire")).toBe("offspring");
    expect(sixRelative("wood", "water")).toBe("parents");
    expect(sixRelative("wood", "earth")).toBe("wealth");
    expect(sixRelative("wood", "metal")).toBe("officials");
  });

  it("starts six spirits from the day stem", () => {
    expect(sixSpirits("甲")).toEqual(["青龙", "朱雀", "勾陈", "螣蛇", "白虎", "玄武"]);
    expect(sixSpirits("己")).toEqual(["螣蛇", "白虎", "玄武", "青龙", "朱雀", "勾陈"]);
    expect(sixSpirits("壬")).toEqual(["玄武", "青龙", "朱雀", "勾陈", "螣蛇", "白虎"]);
  });

  it("computes all six xun void pairs", () => {
    expect(voidBranches("甲", "子")).toEqual(["戌", "亥"]);
    expect(voidBranches("甲", "戌")).toEqual(["申", "酉"]);
    expect(voidBranches("甲", "申")).toEqual(["午", "未"]);
    expect(voidBranches("甲", "午")).toEqual(["辰", "巳"]);
    expect(voidBranches("甲", "辰")).toEqual(["寅", "卯"]);
    expect(voidBranches("甲", "寅")).toEqual(["子", "丑"]);
    expect(() => voidBranches("甲", "丑")).toThrow("not a valid sexagenary day");
  });
});

describe("complete chart", () => {
  it("builds a reproducible Qian chart with Na Jia, relatives, self and response", () => {
    const chart = buildChart({ method: "manual", values: [7, 7, 7, 7, 7, 7], calendar });
    expect(chart.primaryHexagram).toMatchObject({ name: "乾为天", palace: "乾", selfLine: 6, responseLine: 3 });
    expect(chart.changedHexagram.name).toBe("乾为天");
    expect(chart.changingLines).toEqual([]);
    expect(chart.primaryLines.map((line) => `${line.stem}${line.branch}`)).toEqual(["甲子", "甲寅", "甲辰", "壬午", "壬申", "壬戌"]);
    expect(chart.primaryLines.map((line) => line.relative)).toEqual(["offspring", "wealth", "parents", "officials", "siblings", "parents"]);
    expect(chart.primaryLines[2]).toMatchObject({ position: 3, isResponse: true });
    expect(chart.primaryLines[5]).toMatchObject({ position: 6, isSelf: true, isVoid: true });
  });

  it("uses the primary palace element for transformed-line relatives", () => {
    const chart = buildChart({ method: "manual", values: [7, 8, 6, 9, 7, 8], calendar });
    expect(chart.primaryHexagram).toMatchObject({ name: "泽雷随", palace: "震", palaceStage: "returning" });
    expect(chart.changingLines).toEqual([3, 4]);
    for (const line of chart.changedLines) {
      expect(line.relative).toBe(sixRelative("wood", line.element));
    }
  });
});
