import { describe, expect, it } from "vitest";
import { buildChart, resolveCalendarContext } from "../src/index.js";

describe("sexagenary calendar adapter", () => {
  it("matches the documented 1986-05-29 example", () => {
    const context = resolveCalendarContext({
      castAt: "1986-05-29T00:00:00+08:00",
      timezone: "Asia/Shanghai",
    });
    expect(context).toMatchObject({ monthBranch: "巳", dayStem: "癸", dayBranch: "酉" });
  });

  it("uses the requested IANA timezone rather than the server timezone", () => {
    const instant = "1986-05-28T16:00:00Z";
    const shanghai = resolveCalendarContext({ castAt: instant, timezone: "Asia/Shanghai" });
    const utc = resolveCalendarContext({ castAt: instant, timezone: "UTC" });
    expect(shanghai).toMatchObject({ dayStem: "癸", dayBranch: "酉" });
    expect(utc).toMatchObject({ dayStem: "壬", dayBranch: "申" });
  });

  it("changes day pillar at local midnight, not at 23:00", () => {
    const before = resolveCalendarContext({
      castAt: "2026-09-04T15:59:59Z",
      timezone: "Asia/Shanghai",
    });
    const after = resolveCalendarContext({
      castAt: "2026-09-04T16:00:00Z",
      timezone: "Asia/Shanghai",
    });
    expect(`${before.dayStem}${before.dayBranch}`).toBe("辛巳");
    expect(`${after.dayStem}${after.dayBranch}`).toBe("壬午");
  });

  it("changes month branch at the exact 2026 White Dew instant", () => {
    const before = resolveCalendarContext({
      castAt: "2026-09-07T14:41:15Z",
      timezone: "Asia/Shanghai",
    });
    const atBoundary = resolveCalendarContext({
      castAt: "2026-09-07T14:41:16Z",
      timezone: "Asia/Shanghai",
    });
    expect(before.monthBranch).toBe("申");
    expect(atBoundary.monthBranch).toBe("酉");
  });

  it("rejects ambiguous instants and invalid timezones", () => {
    expect(() => resolveCalendarContext({ castAt: "2026-09-04T12:00:00", timezone: "Asia/Shanghai" }))
      .toThrow("explicit UTC offset");
    expect(() => resolveCalendarContext({ castAt: "2026-09-04T12:00:00+08:00", timezone: "Mars/Olympus" }))
      .toThrow("IANA timezone");
  });

  it("feeds a resolved calendar directly into a complete chart", () => {
    const calendar = resolveCalendarContext({
      castAt: "1986-05-29T00:00:00+08:00",
      timezone: "Asia/Shanghai",
    });
    const chart = buildChart({ method: "manual", values: [7, 7, 7, 7, 7, 7], calendar });
    expect(chart.timeContext).toMatchObject({
      monthBranch: "巳",
      dayStem: "癸",
      dayBranch: "酉",
      voidBranches: ["戌", "亥"],
    });
    expect(chart.primaryLines.map((line) => line.spirit)).toEqual(["玄武", "青龙", "朱雀", "勾陈", "螣蛇", "白虎"]);
  });
});
