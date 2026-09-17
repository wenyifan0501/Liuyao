import { Solar } from "lunar-typescript";
import { isEarthlyBranch, isHeavenlyStem } from "../domain/constants.js";
import type { CalendarContext } from "../domain/types.js";

export interface ResolveCalendarInput {
  readonly castAt: string;
  readonly timezone: string;
}

interface LocalDateTimeParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const OFFSET_OR_UTC = /(Z|[+-]\d{2}:\d{2})$/i;

function parseInstant(castAt: string): Date {
  if (!OFFSET_OR_UTC.test(castAt)) {
    throw new Error("castAt must include Z or an explicit UTC offset");
  }
  const instant = new Date(castAt);
  if (Number.isNaN(instant.getTime())) throw new Error(`Invalid castAt date-time: ${castAt}`);
  return instant;
}

function localParts(instant: Date, timezone: string): LocalDateTimeParts {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new Error(`Invalid or unsupported IANA timezone: ${timezone}`);
  }

  const values = new Map<string, number>(
    formatter.formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const get = (name: string): number => {
    const value = values.get(name);
    if (value === undefined || Number.isNaN(value)) throw new Error(`Unable to resolve local ${name} in ${timezone}`);
    return value;
  };
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour: get("hour"), minute: get("minute"), second: get("second"),
  };
}

/**
 * Resolve the calendar fields required by the chart engine.
 *
 * lunar-typescript's `Exact2` day methods retain the civil-date result through
 * 23:59, matching this project's midnight boundary. `getMonthZhiExact` switches
 * month at the precise solar-term time rather than at the start of its date.
 */
export function resolveCalendarContext(input: ResolveCalendarInput): CalendarContext {
  const instant = parseInstant(input.castAt);
  const local = localParts(instant, input.timezone);
  const lunar = Solar.fromYmdHms(
    local.year, local.month, local.day, local.hour, local.minute, local.second,
  ).getLunar();

  const monthBranch = lunar.getMonthZhiExact();
  const dayStem = lunar.getDayGanExact2();
  const dayBranch = lunar.getDayZhiExact2();
  if (!isEarthlyBranch(monthBranch)) throw new Error(`Unexpected month branch: ${monthBranch}`);
  if (!isHeavenlyStem(dayStem)) throw new Error(`Unexpected day stem: ${dayStem}`);
  if (!isEarthlyBranch(dayBranch)) throw new Error(`Unexpected day branch: ${dayBranch}`);

  return {
    castAt: input.castAt,
    timezone: input.timezone,
    calendarRuleVersion: "sexagenary-calendar-v0.1",
    dayBoundary: "midnight",
    monthBranch,
    dayStem,
    dayBranch,
  };
}
