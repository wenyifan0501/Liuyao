import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { ArrowRight, Sparkles } from "lucide-react";
import type { AiConversationView, AiRunKind, AiRunView, ConsultationView } from "../../../packages/contracts";
import { api } from "./api";

export function AiPanel({ consultation, onQuota, enabled = true }: { consultation: ConsultationView; onQuota: () => Promise<void>; enabled?: boolean }) {
  const [data, setData] = useState<AiConversationView | null>(null);
  const [error, setError] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [sending, setSending] = useState(false);
  const [question, setQuestion] = useState("");
  const [clarification, setClarification] = useState("");
  const [pollingKick, setPollingKick] = useState(0);
  const request = useRef<{ body: string; key: string } | null>(null);
  const quota = useRef(onQuota); quota.current = onQuota;
  const generation = useRef(0);
  const signature = useRef("");
  const active = data?.runs.find(r => r.status === "queued" || r.status === "running");
  const initial = data?.runs.find(r => r.kind === "initial" && r.status === "succeeded");

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let delay = 2000;
      const revision = generation.current;
      try {
        const next = await api<AiConversationView>(`/consultations/${consultation.id}/ai`);
        if (!live || revision !== generation.current) return;
        setConnectionError("");
        setData(next);
        const nextSignature = next.runs.map(r => `${r.id}:${r.status}`).join(",");
        if (signature.current && signature.current !== nextSignature) await quota.current().catch(() => {});
        signature.current = nextSignature;
        if (!next.runs.some(r => r.status === "queued" || r.status === "running")) delay = 8000;
      } catch(e) { if (live) setConnectionError(e instanceof Error ? e.message : "连接中断，正在重连…"); delay = 5000; }
      finally { if (live) timer = setTimeout(() => void poll(), delay); }
    };
    void poll();
    return () => { live = false; clearTimeout(timer); generation.current++; };
  }, [consultation.id, pollingKick]);

  async function start(kind: AiRunKind, text = "") {
    if (sending || active || !enabled) return;
    setSending(true); setError(""); generation.current++;
    const body = { kind, question: text.trim() };
    const encoded = JSON.stringify(body);
    if (request.current?.body !== encoded) request.current = { body: encoded, key: crypto.randomUUID() };
    try {
      const run = await api<AiRunView>(`/consultations/${consultation.id}/ai`, body, request.current.key);
      setData(old => ({ framing: old?.framing ?? null, remainingFollowUps: old?.remainingFollowUps ?? 0, runs: [...(old?.runs.filter(r => r.id !== run.id) ?? []), run] }));
      signature.current = run.id;
      request.current = null;
      setPollingKick(value => value + 1);
      if (kind === "follow_up") setQuestion("");
      if (kind === "framing") setClarification("");
      await quota.current().catch(() => {});
    } catch(e) { setError(e instanceof Error ? e.message : "提交失败，请重试"); }
    finally { setSending(false); }
  }

  if (!data) return <div className="availability" role="status">{connectionError || "正在读取咨询进度…"}</div>;
  const last = data.runs.at(-1);
  const failed = last?.status === "failed" && (consultation.chart ? last.kind !== "framing" : last.kind === "framing") ? last : undefined;
  const framing = data.framing;
  return <div className="ai-panel">
    {!enabled && <div className="availability">AI 服务未启用，已有解读仍可查看。暂时无法生成新的解读。</div>}
    {(error || connectionError) && <p className="form-error" role="alert">{error || connectionError}</p>}
    {!consultation.chart && <div className="framing-card">
      <h3><Sparkles size={17}/> 先把问题说清楚</h3>
      {!framing && <><p>让 AI 确认是否还缺少关键信息，再开始起卦。</p><button className="outline-button" disabled={!!active || sending || !enabled} onClick={() => void start("framing")}>确认问题 <ArrowRight size={15}/></button></>}
      {framing?.status === "ready" && <><p>{framing.normalizedQuestion}</p><small>问题已确认，可以回到桌面起卦。</small></>}
      {framing?.status === "needs_clarification" && <><p>{framing.clarifyingQuestion}</p><div className="clarification-choices">{framing.choices.map(choice => <button key={choice} className="outline-button" disabled={sending || !!active} onClick={() => void start("framing", choice)}>{choice}</button>)}</div><form onSubmit={e => { e.preventDefault(); void start("framing", clarification); }}><label className="sr-only" htmlFor="clarification">补充回答</label><input id="clarification" maxLength={2000} value={clarification} onChange={e => setClarification(e.target.value)} placeholder="也可以用自己的话补充…"/><button className="outline-button" disabled={sending || !!active || !clarification.trim()}>提交补充</button></form></>}
      <small>问题确认有次数上限；也可直接按当前问题起卦。</small>
    </div>}
    {data.runs.filter(r => r.kind !== "framing" && r.status === "succeeded").map(run => <div className="ai-turn" key={run.id}>
      {run.kind === "follow_up" && <div className="user-message">{run.question}</div>}
      <div className="answer-heading"><Sparkles size={16}/>{run.kind === "initial" ? "本次解读" : "继续聊这件事"}</div>
      <div className="ai-answer"><Markdown components={{ img: () => null }}>{run.text}</Markdown></div>
    </div>)}
    {active && <div className="generation" aria-busy="true"><div className="answer-heading" role="status"><span className="pulse"/>{active.status === "queued" ? "已排队，稍后开始…" : active.kind === "framing" ? "正在确认问题边界…" : active.text ? "正在生成解读…" : "正在结合卦盘分析…"}</div>{active.text && <div className="ai-answer"><Markdown components={{ img: () => null }}>{active.text}</Markdown></div>}<small>可以离开页面，回来后会恢复进度。完成前正文尚未保存为正式回答。</small></div>}
    {failed && <div className="availability"><div><p>{failed.error}</p><button className="outline-button" disabled={sending || !!active || !enabled} onClick={() => void start(failed.kind, failed.question)}>重试本次生成</button></div></div>}
    {consultation.chart && enabled && !initial && !active && !failed && <div className="interpretation-start"><p>卦盘已准备好，可以开始解读。</p><button className="primary-button" disabled={sending} onClick={() => void start("initial")}><Sparkles size={17}/> 开始 AI 解读</button><small>预占 1 次免费咨询额度，生成失败会退还。</small></div>}
    {initial && <form className="follow-up-box" onSubmit={e => { e.preventDefault(); void start("follow_up", question); }}><label htmlFor="follow-up">围绕这件事，继续聊聊</label><textarea id="follow-up" maxLength={2000} value={question} onChange={e => setQuestion(e.target.value)} placeholder="你最想进一步了解什么？" disabled={sending || !!active}/><div><small>本次还可免费追问 {data.remainingFollowUps} 次</small><button className="primary-button" disabled={!question.trim() || sending || !!active || data.remainingFollowUps < 1 || !enabled}>发送 <ArrowRight size={15}/></button></div>{data.remainingFollowUps === 0 && <p className="muted">免费追问已用完，付费功能尚未开放。已保存的解读仍可查看。</p>}</form>}
  </div>;
}
