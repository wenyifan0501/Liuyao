import { GatheringLight } from './GatheringLight';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { ConsultationView } from '../../../../packages/contracts';

/** One persistent sheet: only its position and contents change, never a dialog. */
export function QuestionPaper({ stage, current, question, setQuestion, values, busy, error, open, close, submit, chart }: {
  stage: 'rest' | 'write' | 'side'; current: ConsultationView | null;
  question: string; setQuestion: (value: string) => void; values: readonly number[];
  busy: boolean; error: string; open: () => void; close: () => void;
  submit: () => void; chart: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (stage !== 'write' || current) return;
    // Focus after the lift finishes; do not open a mobile keyboard mid-flight.
    const timer = setTimeout(() => input.current?.focus({preventScroll:true}), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 950);
    return () => clearTimeout(timer);
  }, [stage, current]);
  return <>
    <div className={`letter-weight weight-${stage}`} aria-hidden="true"/>
    <section className={`letter-paper letter-${stage}`} aria-label="问事信笺" onKeyDown={e => { if (e.key === 'Escape' && !busy) close(); }}>
      <div className="letter-grain" aria-hidden="true"/>
      {stage === 'rest' && <button className="letter-open" aria-label="拿起信笺，写下所问之事" onClick={open} disabled={busy}><GatheringLight/><span className="letter-watermark" aria-hidden="true">问</span></button>}
      {stage === 'write' && <div className="letter-content">
        <header><span/><button aria-label="放回信笺" onClick={close} disabled={busy}><X size={19}/></button></header>
        {current ? <><p className="letter-existing">{current.question}</p>{current.background.map((text,i) => <p key={i}>{text}</p>)}{current.timeWindow && <p>{current.timeWindow}</p>}<button className="letter-seal" onClick={close}>收笔</button></> : <form onSubmit={e => { e.preventDefault(); submit(); }}>
          <label className="sr-only" htmlFor="letter-question">写下所问之事</label>
          <textarea id="letter-question" ref={input} required maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="此刻，你想问什么？" disabled={busy}/>
          {error && <p role="alert" className="letter-error">{error}</p>}
          <div className="letter-sign"><span/><button type="submit" className="letter-seal" disabled={busy || !question.trim()} aria-label="落印收笔，留存问题并起卦">{busy ? '稍候' : '问卦'}</button></div>
        </form>}
      </div>}
      {stage === 'side' && <div className="letter-summary"><span>今 日 所 问</span><button className="letter-question-link" onClick={open} disabled={busy}>{current?.question ?? question}</button><div className="study-hexagram" aria-label={`已完成 ${values.length} 爻`}>{Array.from({length:6},(_,j) => { const i=5-j,v=values[i]; return <div className={`study-line ${v ? 'is-drawn' : ''}`} key={i}><span className="study-line-index">{['初','二','三','四','五','上'][i]}</span><div className={v && v%2===0 ? 'yin' : 'yang'}><i/><i/></div><small>{v===6?'×':v===9?'○':''}</small></div>; })}</div><small>{current?.chart?.primaryHexagram.name ?? `${values.length} / 6 爻已成`}</small>{current?.chart && <button className="study-paper-link" onClick={chart}>展开卦盘 ↗</button>}</div>}
    </section>
  </>;
}
