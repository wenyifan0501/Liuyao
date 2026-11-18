import {useState} from 'react';
import type {OracleResult as Result,MeihuaResult,QiuqianResult,JiaobeiResult} from '../../../../packages/contracts';
import {HEXAGRAMS} from '../../../../src/domain/constants';
import {HexagramReader} from '../reference/HexagramBook';

const DIGITS='〇一二三四五六七八九';
export function chineseNumber(n:number){if(n===100)return '一百';if(n<10)return DIGITS[n]!;const t=Math.floor(n/10),o=n%10;return `${t>1?DIGITS[t]:''}十${o?DIGITS[o]:''}`;}
export function lotGrade(r:QiuqianResult){const parts=r.title.split(/[\s\u3000]+/).filter(Boolean);return {grade:parts.at(-1) ?? '',stems:parts.length>2?parts[1]!:''};}
export function oracleHeadline(r:Result){
  if(r.method==='meihua')return `${r.primary} 之 ${r.changed} · ${r.relation}`;
  if(r.method==='qiuqian')return `第 ${r.number} 签 · ${lotGrade(r).grade}`;
  return `${r.name} · ${r.faces.map(f=>f==='flat'?'平':'凸').join('')}`;
}
const byBits=(bits:number[])=>HEXAGRAMS.find(h=>h.binary.join('')===bits.join(''))!;

function Lines({bits,moving,marks}:{bits:number[];moving?:number;marks?:[string,string]}){
  return <div className="mh-lines" aria-hidden="true">{bits.map((b,i)=>({b,i})).reverse().map(({b,i})=><div key={i} className={`${b?'yang':'yin'}${moving===i+1?' moving':''}`}><i/><i/>{marks&&(i===4||i===1)&&<em>{i===4?marks[0]:marks[1]}</em>}</div>)}</div>;
}
function Meihua({r}:{r:MeihuaResult}){
  const [tab,setTab]=useState<'chart'|'book'>('chart');
  const a=r.analysis;const upperIsBody=r.moving<=3;
  return <section className="oracle-result oracle-meihua">
    <header><span className="oracle-kicker">梅花易数 · 三数起卦</span><h2>{r.primary}<small> 之 </small>{r.changed}</h2></header>
    <div className="chart-tabs" role="tablist" aria-label="梅花卦内容">{(['chart','book'] as const).map(v=><button key={v} role="tab" aria-selected={tab===v} onClick={()=>setTab(v)}>{v==='chart'?'卦象':'卦义'}</button>)}</div>
    {tab==='chart'?<>
      <div className="mh-trio">{[['本卦',r.primary,r.bits,r.moving],['互卦',r.mutual,r.mutualBits,undefined],['变卦',r.changed,r.changedBits,undefined]].map(([label,name,bits,moving],i)=><figure key={i}>
        <figcaption>{label as string}</figcaption><Lines bits={bits as number[]} {...(moving?{moving:moving as number}:{})} {...(i===0?{marks:(upperIsBody?['体','用']:['用','体']) as [string,string]}:{})}/><p>{name as string}</p>
      </figure>)}</div>
      <div className="mh-relation"><span>体 · {r.body}</span><b>{r.relation}</b><span>用 · {r.use}</span></div>
      {a&&<table className="mh-facts"><thead><tr><th>位</th><th>经卦</th><th>五行</th><th>对体卦</th><th>{a.monthBranch?`${a.monthBranch}月`:'月令'}</th></tr></thead><tbody>{a.trigrams.map(t=><tr key={t.role} className={t.role==='体'?'is-body':''}><td>{t.role}</td><td>{t.trigram}<small>{t.image}</small></td><td>{t.element}</td><td>{t.relation ?? '—'}</td><td className={t.state?`state-${t.state}`:''}>{t.state ?? '—'}</td></tr>)}</tbody></table>}
      <p className="oracle-meta">取数 {r.numbers.join(' · ')} · 第 {r.moving} 爻动{a?.monthBranch?` · 月建${a.monthBranch}，${a.monthElement}当令`:' · 旧记录未存起卦时间，不论旺衰'}</p>
    </>:<HexagramReader primary={byBits(r.bits)} mutual={byBits(r.mutualBits)} changed={byBits(r.changedBits)} moving={[r.moving]} closing="经文吉凶属于原文语境；梅花断事以体用生克与旺衰为主。"/>}
    <details><summary>取法</summary><p>{r.rule}</p></details>
  </section>;
}
function Qiuqian({r}:{r:QiuqianResult}){
  const {grade,stems}=lotGrade(r);
  const tone=/上上|大吉|上吉/.test(grade)?'high':/下下/.test(grade)?'low':'mid';
  return <section className="oracle-result oracle-qiuqian">
    <div className="lot-sheet">
      <p className="lot-head">關聖帝君靈籤</p>
      <div className="lot-body">
        <p className="lot-number">第{chineseNumber(r.number)}籤</p>
        {stems&&<p className="lot-stems">{stems}</p>}
        <div className="lot-poem">{r.poem.map((line,i)=><p key={i}>{line}</p>)}</div>
        <p className={`lot-stamp tone-${tone}`}>{grade}</p>
      </div>
    </div>
    <p className="oracle-meta">{tone==='high'?'签等为整体基调，顺中仍看诗中所提的前提。':tone==='low'?'下下是「此时此法不宜」的提醒，不是注定的结局。':'吉凶参半，重在诗中指向的条件与转机。'}</p>
    <a className="oracle-source" href={r.source} target="_blank" rel="noreferrer">签诗原文出处 · 维基文库 ↗</a>
    <details><summary>取法</summary><p>{r.rule}</p></details>
  </section>;
}
const CRESCENT='M-66 -4 C-52 44 52 44 66 -4 C40 18 -40 18 -66 -4Z';
function Block({face,x,rotate}:{face:'flat'|'round';x:number;rotate:number}){
  return <g transform={`translate(${x} 52) rotate(${rotate})`}>
    <path d={CRESCENT} transform="translate(3 6)" fill="#00000040"/>
    {face==='round'?<><path d={CRESCENT} fill="#922c1e"/><path d="M-50 10 C-34 34 34 34 50 10" stroke="#f0a283" strokeWidth="3" fill="none" opacity=".5" strokeLinecap="round"/></>
    :<><path d={CRESCENT} fill="#d6a274"/>{[6,14,22].map(y=><path key={y} d={`M-52 ${y-6} C-30 ${y+12} 30 ${y+12} 52 ${y-6}`} stroke="#9c6a3e" strokeWidth="1.1" fill="none" opacity=".5"/>)}</>}
  </g>;
}
const OUTCOMES=[{name:'圣筊',faces:'一平一凸',note:'允可'},{name:'笑筊',faces:'两平',note:'未明'},{name:'阴筊',faces:'两凸',note:'暂缓'}] as const;
function Jiaobei({r}:{r:JiaobeiResult}){
  return <section className={`oracle-result oracle-jiaobei is-${r.name==='圣筊'?'holy':r.name==='笑筊'?'laugh':'yin'}`}>
    <span className="oracle-kicker">掷筊 · 一次问事一筊</span>
    <svg className="jb-figure" viewBox="0 0 320 110" role="img" aria-label={`两块木筊：${r.faces.map(f=>f==='flat'?'平面朝上':'凸面朝上').join('，')}`}><Block face={r.faces[0]!} x={92} rotate={-12}/><Block face={r.faces[1]!} x={228} rotate={14}/></svg>
    <h2 className="jb-name">{r.name}</h2>
    <p className="jb-meaning">{r.meaning}</p>
    <ul className="jb-legend">{OUTCOMES.map(o=><li key={o.name} aria-current={o.name===r.name||undefined}><b>{o.name}</b><span>{o.faces}</span><small>{o.note}</small></li>)}</ul>
    <details><summary>取法</summary><p>{r.rule}</p></details>
  </section>;
}
export function OracleResult({result}:{result:Result}){
  return result.method==='meihua'?<Meihua r={result}/>:result.method==='qiuqian'?<Qiuqian r={result}/>:<Jiaobei r={result}/>;
}
