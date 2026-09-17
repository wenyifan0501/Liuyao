import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HEXAGRAMS } from '../src/domain/constants.js';
import { READINGS } from '../apps/web/src/reference/readings.js';

const classics: { number: number; name: string; judgment: string; lines: string[]; special: string | null; source: string }[] = JSON.parse(readFileSync(new URL('../apps/web/src/reference/classics.json', import.meta.url), 'utf8'));

describe('hexagram reference alignment', () => {
  it('covers every chart with six correctly ordered yin/yang lines and reading notes', () => {
    expect(classics).toHaveLength(64);
    expect(READINGS).toHaveLength(64);
    expect(new Set(classics.map(e => e.number)).size).toBe(64);
    for (const definition of HEXAGRAMS) {
      const original = classics.find(e => e.number === definition.kingWenNumber)!;
      const reading = READINGS.find(e => e.number === definition.kingWenNumber)!;
      expect(original, definition.name).toBeDefined();
      expect(original.lines, definition.name).toHaveLength(6);
      expect(reading.lines, definition.name).toHaveLength(6);
      definition.binary.forEach((bit, index) => {
        const symbol = bit ? '九' : '六';
        const label = index === 0 ? `初${symbol}` : index === 5 ? `上${symbol}` : `${symbol}${'一二三四五六'[index]}`;
        expect(original.lines[index], definition.name).toMatch(new RegExp(`^${label}：.+`));
        expect(reading.lines[index]!.length).toBeGreaterThan(10);
      });
      expect(original.judgment.length).toBeGreaterThan(3);
      expect(original.source).toMatch(/^https:\/\/zh.wikisource.org\/wiki\/周易\//);
      for (const text of [original.judgment, ...original.lines]) expect(text).not.toMatch(/[<>\[\]{}*]|&[a-z]+;/);
    }
  });
  it('keeps Qian/Kun supplementary texts outside the six castable positions', () => {
    expect(classics.filter(e => e.special).map(e => e.number)).toEqual([1, 2]);
    expect(classics[0]!.special).toMatch(/^用九：/);
    expect(classics[1]!.special).toMatch(/^用六：/);
  });
  it('matches the saved moving-line example: Kun 47 to Jie 60 at positions 1 and 4', () => {
    const kun = classics.find(e => e.number === 47)!;
    const jie = classics.find(e => e.number === 60)!;
    expect(kun.lines[0]).toContain('臀困');
    expect(kun.lines[3]).toContain('來徐徐');
    expect(jie.lines[0]).toContain('不出戶庭');
    expect(jie.lines[3]).toContain('安節');
  });
});
