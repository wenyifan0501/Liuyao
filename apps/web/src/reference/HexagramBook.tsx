import { useState } from 'react';
import type { ConsultationView } from '../../../../packages/contracts';
import { TRIGRAMS } from '../../../../src/domain/constants';
import type { HexagramDefinition } from '../../../../src/domain/types';
import classics from './classics.json';
import { READINGS } from './readings';
import { COLLATIONS } from './collations';
import './book.css';

export function HexagramBook({ consultation }: { consultation: ConsultationView }) {
  const chart = consultation.chart!;
  return <HexagramReader primary={chart.primaryHexagram} changed={chart.changedHexagram} moving={chart.changingLines} closing="经文中的吉凶属于原文语境，本次问事仍需结合完整六爻分析。"/>;
}

/** Classical text reader shared by every method that produces hexagrams. */
export function HexagramReader({ primary, changed, mutual, moving, closing }: { primary: HexagramDefinition; changed: HexagramDefinition; mutual?: HexagramDefinition; moving: readonly number[]; closing: string }) {
  const [side, setSide] = useState<'primary' | 'changed' | 'mutual'>('primary');
  const definition = side === 'primary' ? primary : side === 'mutual' && mutual ? mutual : changed;
  const original = classics.find(entry => entry.number === definition.kingWenNumber);
  const reading = READINGS.find(entry => entry.number === definition.kingWenNumber);
  if (!original || !reading) return <p className="book-note">这卦的资料暂未收录，排盘仍可正常查看。</p>;
    const lineCard = (text: string, index: number, marked: boolean) => <article className={`book-line${marked ? ' book-line-marked' : ''}`} key={index}>
    <h4>{text.split('：')[0]}{marked && <span>{side === 'primary' ? '动爻' : '对应爻位'}</span>}</h4>
    <blockquote>{text.split('：').slice(1).join('：')}</blockquote>
    <p>{reading.lines[index]}</p>
  </article>;
  return <div className="hexagram-book">
    <div className="book-selector" role="group" aria-label="选择阅读的卦">
      <button aria-pressed={side === 'primary'} onClick={() => setSide('primary')}>本卦 · {primary.name}</button>
      {mutual && <button aria-pressed={side === 'mutual'} onClick={() => setSide('mutual')}>互卦 · {mutual.name}</button>}
      {!!moving.length && <button aria-pressed={side === 'changed'} onClick={() => setSide('changed')}>变卦 · {changed.name}</button>}
    </div>
    <div className="book-cover">
      <div className="book-symbol" aria-hidden="true">{[...definition.binary].reverse().map((bit, i) => <div className={bit ? 'solid' : ''} key={i}><i/><i/></div>)}</div>
      <div><span className="book-kicker">《周易》第 {definition.kingWenNumber} 卦</span><h3>{definition.name}</h3><p>{reading.theme}</p></div>
    </div>
    <div className="book-trigrams"><span>上卦 · {definition.upperTrigram}为{TRIGRAMS[definition.upperTrigram].image}</span><span>下卦 · {definition.lowerTrigram}为{TRIGRAMS[definition.lowerTrigram].image}</span></div>
    <section className="book-section"><h3>卦辞<span>原文</span></h3><blockquote>{original.judgment}</blockquote><p className="book-reading-label">白话导读 · 本站整理</p><p>{reading.judgment}</p></section>
    {side === 'mutual' ? <section className="book-section" key={side}><h3>六爻爻辞</h3><p className="book-note">互卦取本卦二至四爻、三至五爻组成，用于观察过程，不另取动爻。</p><details className="book-more"><summary>展开全部六爻</summary>{original.lines.map((text, index) => lineCard(text, index, false))}</details></section> : <section className="book-section" key={side}>
      <h3>{moving.length ? side === 'primary' ? '这次的动爻' : '变卦对应爻位' : '六爻爻辞'}</h3>
      <p className="book-note">{moving.length ? side === 'primary' ? '按初爻至上爻排列。下方说明只帮助读懂经文意象。' : '以下与本卦动爻位置相同，供对照阅读；并非变卦又产生了动爻。' : '这次是静卦，没有动爻，本卦与变卦相同。可展开阅读六爻。'}</p>
      {original.lines.map((text, index) => moving.includes(index + 1) ? lineCard(text, index, true) : null)}
      {moving.length < 6 && <details className="book-more"><summary>{moving.length ? `展开其余 ${6 - moving.length} 爻` : '展开全部六爻'}</summary>{original.lines.map((text, index) => !moving.includes(index + 1) ? lineCard(text, index, false) : null)}</details>}
      {original.special && <details className="book-more"><summary>{original.number === 1 ? '用九' : '用六'} · 补充经文</summary><blockquote>{original.special}</blockquote><p className="book-note">这是乾、坤卦特有的补充经文，不是第七爻；此处仅供阅读，不自动用于本次断卦。</p></details>}
    </section>}
    <footer className="book-source"><p>经文出自《周易》，沿用底本字形，个别校订另注。<a href={original.source} target="_blank" rel="noreferrer">查看原文出处 ↗</a></p>{COLLATIONS[original.number] && <p>校记：{COLLATIONS[original.number].note}<a href={COLLATIONS[original.number].source} target="_blank" rel="noreferrer">对读出处 ↗</a></p>}<p>白话为本站简要导读，非逐字训诂。{closing}</p></footer>
  </div>;
}
