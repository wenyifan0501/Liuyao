// Import only the public-domain classical text, never modern translations.
// Run manually; the shipped reader works entirely offline.
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const names = '乾 坤 屯 蒙 需 訟 師 比 小畜 履 泰 否 同人 大有 謙 豫 隨 蠱 臨 觀 噬嗑 賁 剝 復 无妄 大畜 頤 大過 坎 離 咸 恆 遯 大壯 晉 明夷 家人 睽 蹇 解 損 益 夬 姤 萃 升 困 井 革 鼎 震 艮 漸 歸妹 豐 旅 巽 兌 渙 節 中孚 小過 既濟 未濟'.split(' ');
const clean = text => text.replace(/<[^>]*>/g, '').replace(/'''?/g, '').replace(/-\{([^{}]*)\}-/g, '$1').replace(/\{\{[^{}]*\}\}/g, '').replace(/^\*+/, '').trim();
const entries = [];
for (let offset = 0; offset < names.length; offset += 4) {
  entries.push(...await Promise.all(names.slice(offset, offset + 4).map(async (name, i) => {
    const source = `https://zh.wikisource.org/wiki/周易/${name}`;
    const url = `https://zh.wikisource.org/w/index.php?title=${encodeURIComponent(`周易/${name}`)}&action=raw`;
    // Windows PowerShell honors the machine's configured network proxy.
    const raw = process.platform === 'win32'
      ? (await run('powershell.exe', ['-NoProfile', '-Command', `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (Invoke-WebRequest -UseBasicParsing -Uri '${url}').Content`], { maxBuffer: 1024 * 1024 })).stdout.replace(/^\uFEFF/, '')
      : await (await fetch(url)).text();
    const section = raw.split(/彖曰/)[0];
    const judgment = section.split('\n').filter(l => l.startsWith('**')).map(l => clean(l.slice(2))).join(' ');
    const lines = section.split('\n').filter(l => l.startsWith('*#')).map(l => clean(l.slice(2)).replace(/^((?:初|上|用)[九六]|[九六][二三四五])[，:]/, '$1：'));
    if (!judgment || lines.length < 6 || lines.length > 7 || lines.some(l => /[{}<>]/.test(l))) throw new Error(`Unexpected text: ${name}: ${judgment} / ${lines}`);
    return { number: offset + i + 1, name, judgment, lines: lines.slice(0, 6), special: lines[6] ?? null, source };
  })));
}
// Three transcription/segmentation corrections, documented in collations.ts.
entries[12].lines[3] = entries[12].lines[3].replace('弗克，攻吉', '弗克攻，吉');
entries[22].judgment = entries[22].judgment.replace('不利。有攸往', '不利有攸往');
entries[23].lines[0] = entries[23].lines[0].replace('不復遠，无袛悔', '不遠復，无祗悔');
await writeFile(new URL('../apps/web/src/reference/classics.json', import.meta.url), JSON.stringify(entries, null, 2) + '\n');
console.log(`Imported ${entries.length} hexagrams and ${entries.reduce((n,e)=>n+e.lines.length,0)} lines.`);
