import { BRANCH_ELEMENTS, EARTHLY_BRANCHES } from "./constants.js";
import type { EarthlyBranch, FiveElement, LiuyaoChart } from "./types.js";

export type ElementRelation =
  | "same"
  | "source_generates_target"
  | "source_controls_target"
  | "target_generates_source"
  | "target_controls_source";

export type BranchRelation = "same" | "combine" | "clash" | "none";

export interface DerivedChartFact {
  readonly id: string;
  readonly category: "line" | "month" | "day" | "change";
  readonly line: number;
  readonly text: string;
}

export interface DerivedChartFacts {
  readonly ruleVersion: "liuyao-derived-facts-v0.1";
  readonly facts: readonly DerivedChartFact[];
}

const GENERATES: Readonly<Record<FiveElement, FiveElement>> = {
  wood: "fire",
  fire: "earth",
  earth: "metal",
  metal: "water",
  water: "wood",
};

const CONTROLS: Readonly<Record<FiveElement, FiveElement>> = {
  wood: "earth",
  fire: "metal",
  earth: "water",
  metal: "wood",
  water: "fire",
};

const ELEMENT_LABELS: Readonly<Record<FiveElement, string>> = {
  wood: "木",
  fire: "火",
  earth: "土",
  metal: "金",
  water: "水",
};

const COMBINES = new Set(["子丑", "寅亥", "卯戌", "辰酉", "巳申", "午未"]);
const CLASHES = new Set(["子午", "丑未", "寅申", "卯酉", "辰戌", "巳亥"]);

function unorderedPair(left: EarthlyBranch, right: EarthlyBranch): string {
  return EARTHLY_BRANCHES.indexOf(left) <= EARTHLY_BRANCHES.indexOf(right)
    ? `${left}${right}`
    : `${right}${left}`;
}

export function relateElements(source: FiveElement, target: FiveElement): ElementRelation {
  if (source === target) return "same";
  if (GENERATES[source] === target) return "source_generates_target";
  if (CONTROLS[source] === target) return "source_controls_target";
  if (GENERATES[target] === source) return "target_generates_source";
  return "target_controls_source";
}

export function relateBranches(source: EarthlyBranch, target: EarthlyBranch): BranchRelation {
  if (source === target) return "same";
  const pair = unorderedPair(source, target);
  if (COMBINES.has(pair)) return "combine";
  if (CLASHES.has(pair)) return "clash";
  return "none";
}

function elementRelationText(
  sourceName: string,
  source: FiveElement,
  targetName: string,
  target: FiveElement,
): string {
  const sourceLabel = `${sourceName}${ELEMENT_LABELS[source]}`;
  const targetLabel = `${targetName}${ELEMENT_LABELS[target]}`;
  switch (relateElements(source, target)) {
    case "same": return `${sourceLabel}与${targetLabel}同五行，为比和关系`;
    case "source_generates_target": return `${sourceLabel}生${targetLabel}`;
    case "source_controls_target": return `${sourceLabel}克${targetLabel}`;
    case "target_generates_source": return `${targetLabel}生${sourceLabel}，不是${sourceLabel}生${targetLabel}`;
    case "target_controls_source": return `${targetLabel}克${sourceLabel}，不是${sourceLabel}克${targetLabel}`;
  }
}

function branchRelationText(
  sourceName: string,
  source: EarthlyBranch,
  targetName: string,
  target: EarthlyBranch,
): string | null {
  switch (relateBranches(source, target)) {
    case "same": return `${sourceName}${source}与${targetName}${target}同支`;
    case "combine": return `${sourceName}${source}与${targetName}${target}六合`;
    case "clash": return `${sourceName}${source}与${targetName}${target}六冲`;
    case "none": return null;
  }
}

export function deriveChartFacts(chart: LiuyaoChart): DerivedChartFacts {
  const facts: DerivedChartFact[] = [];
  const monthBranch = chart.timeContext.monthBranch;
  const dayBranch = chart.timeContext.dayBranch;
  const monthElement = BRANCH_ELEMENTS[monthBranch];
  const dayElement = BRANCH_ELEMENTS[dayBranch];

  for (const line of chart.primaryLines) {
    const roles = [line.isSelf ? "世爻" : "", line.isResponse ? "应爻" : ""].filter(Boolean).join("、");
    facts.push({
      id: `line.${line.position}.identity`,
      category: "line",
      line: line.position,
      text: `${line.position}爻为${line.branch}${ELEMENT_LABELS[line.element]}、${line.relative}${line.moving ? "、发动" : "、静爻"}${roles ? `、${roles}` : ""}${line.isVoid ? "、旬空" : "、不旬空"}`,
    });
    facts.push({
      id: `line.${line.position}.month.element`,
      category: "month",
      line: line.position,
      text: elementRelationText(`月建${monthBranch}`, monthElement, `${line.position}爻${line.branch}`, line.element),
    });
    facts.push({
      id: `line.${line.position}.day.element`,
      category: "day",
      line: line.position,
      text: elementRelationText(`日辰${dayBranch}`, dayElement, `${line.position}爻${line.branch}`, line.element),
    });
    const monthBranchText = branchRelationText("月建", monthBranch, `${line.position}爻`, line.branch);
    if (monthBranchText) facts.push({
      id: `line.${line.position}.month.branch`, category: "month", line: line.position, text: monthBranchText,
    });
    const dayBranchText = branchRelationText("日辰", dayBranch, `${line.position}爻`, line.branch);
    if (dayBranchText) facts.push({
      id: `line.${line.position}.day.branch`, category: "day", line: line.position, text: dayBranchText,
    });
    if (line.moving) {
      const changed = chart.changedLines.find((candidate) => candidate.position === line.position);
      if (changed) facts.push({
        id: `line.${line.position}.change.element`,
        category: "change",
        line: line.position,
        text: `${line.position}爻由${line.branch}${ELEMENT_LABELS[line.element]}变为${changed.branch}${ELEMENT_LABELS[changed.element]}；${elementRelationText("本爻", line.element, "变爻", changed.element)}`,
      });
    }
  }

  return { ruleVersion: "liuyao-derived-facts-v0.1", facts };
}
