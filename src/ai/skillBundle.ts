import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LiuyaoSkillBundle } from "./types.js";

async function readSkillFile(skillDirectory: string, relativePath: string): Promise<string> {
  return readFile(join(skillDirectory, relativePath), "utf8");
}

export async function loadLiuyaoSkillBundle(skillDirectory: string): Promise<LiuyaoSkillBundle> {
  const [entry, workflow, usefulGods, interpretation, directReading, output, styleAndSafety] = await Promise.all([
    readSkillFile(skillDirectory, "SKILL.md"),
    readSkillFile(skillDirectory, join("references", "workflow.md")),
    readSkillFile(skillDirectory, join("references", "useful-gods.md")),
    readSkillFile(skillDirectory, join("references", "interpretation.md")),
    readSkillFile(skillDirectory, join("references", "direct-reading.md")),
    readSkillFile(skillDirectory, join("references", "output.md")),
    readSkillFile(skillDirectory, join("references", "style-and-safety.md")),
  ]);

  return {
    analysisRules: [entry, workflow, usefulGods, interpretation, output].join("\n\n---\n\n"),
    narrativeRules: [entry, workflow, output, styleAndSafety].join("\n\n---\n\n"),
    directRules: [entry, workflow, usefulGods, interpretation, directReading, styleAndSafety].join("\n\n---\n\n"),
  };
}
