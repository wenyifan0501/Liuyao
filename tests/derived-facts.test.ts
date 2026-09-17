import { describe, expect, it } from "vitest";
import { buildChart, deriveChartFacts, relateBranches, relateElements } from "../src/index.js";

describe("deterministic chart facts", () => {
  it("keeps elemental direction explicit instead of turning seasonal weakness into a false control", () => {
    expect(relateElements("metal", "fire")).toBe("target_controls_source");
    expect(relateElements("fire", "metal")).toBe("source_controls_target");
  });

  it("computes only conservative same/combine/clash branch relations", () => {
    expect(relateBranches("巳", "申")).toBe("combine");
    expect(relateBranches("子", "午")).toBe("clash");
    expect(relateBranches("申", "申")).toBe("same");
    expect(relateBranches("申", "酉")).toBe("none");
  });

  it("produces a citable fact ledger for every primary line", () => {
    const chart = buildChart({
      method: "manual",
      values: [7, 7, 6, 6, 9, 8],
      calendar: {
        castAt: "2026-09-05T09:23:50+08:00",
        timezone: "Asia/Shanghai",
        calendarRuleVersion: "sexagenary-calendar-v0.1",
        dayBoundary: "midnight",
        monthBranch: "申",
        dayStem: "壬",
        dayBranch: "午",
      },
    });
    const derived = deriveChartFacts(chart);
    expect(derived.facts.filter((fact) => fact.category === "line")).toHaveLength(6);
    expect(derived.facts.find((fact) => fact.id === "line.1.month.element")?.text)
      .toContain("巳火克月建申金");
    expect(derived.facts.find((fact) => fact.id === "line.1.month.branch")?.text)
      .toContain("六合");
  });
});
