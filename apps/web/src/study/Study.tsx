import {OracleStation} from './OracleStation';
import type {OracleMotion,OraclePhase} from './OracleTool';
import {oracleHeadline} from './OracleResult';
import {MethodChooser} from './MethodChooser';
import {methodAt,type MethodTrack} from './MethodCarousel';
import {OracleResult} from './OracleResult';
import {METHOD_NAMES,type DivinationMethod} from '../../../../packages/contracts';
import { HistoryEntry } from './HistoryEntry';
import { GatheringLight } from './GatheringLight';
import { Component, Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { LoadingScreen } from "./LoadingScreen";
import { Warmup, preloadStudyAssets } from "./preload";
import { loadingProgress } from "./loading";
import { Canvas } from "@react-three/fiber";
import { LogOut, Plus, Menu, X } from "lucide-react";
import { DeskScene } from "./scene";
import { QuestionPaper } from "./QuestionPaper";
import "./letter.css";
import { CameraRig, type CameraMemory, type DeskView } from "./CameraRig";
import { AiPanel } from "../AiPanel";
import { AuthDialog, ChartDialog } from "../ConsultationDialogs";
import { useConsultations } from "./useConsultations";
import { regripGesture, createEjection, tryEject, emptyGesture, gestureProgress, moveGesture } from "./gesture";
import type { CreateConsultation } from "../../../../packages/contracts";
import "./study.css";
import "./oracle.css";

// Begin downloading every model and texture the moment the study code arrives.
preloadStudyAssets();

type Session = ReturnType<typeof useConsultations>;
type Phase = "idle" | "loading" | "shaking" | "falling" | "settled";
const positions = ["初", "二", "三", "四", "五", "上"];
class SceneBoundary extends Component<{ children: ReactNode; onFail?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail?.(); }
  render() { return this.state.failed ? <div className="study-fallback">当前设备无法开启 3D 场景。<br/>仍可录入铜钱结果，或查看已有咨询。</div> : this.props.children; }
}
/** Canvas fallback (rendered only when WebGL is unavailable): lifts the loading curtain once, after mount. */
function NoWebGL({ onShow }: { onShow: () => void }) {
  useEffect(() => { if (!document.querySelector('.study-world canvas')) onShow(); }, []);
  return <div className="study-fallback">此浏览器不支持 3D，可录入铜钱结果或查看咨询。</div>;
}
function Modal({ children, close, className = "", label }: { children: ReactNode; close: () => void; className?: string; label: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-label={label} className={`study-dialog ${className}`} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>{children}</dialog>;
}
export default function Study() {
  const session = useConsultations();
  const cameraMemory = useRef<CameraMemory>(null);
  return <StudyRoom session={session} cameraMemory={cameraMemory}/>;
}
function StudyRoom({ session: s, cameraMemory }: { session: Session; cameraMemory: React.RefObject<CameraMemory> }) {
  const [phase, setPhase] = useState<Phase>("idle"), [round, setRound] = useState(0);
  const storageKey = s.selected && s.me ? `study-lines:${s.me.user.id}:${s.selected}` : null;
  const [draft, setDraft] = useState<{ key: string | null; values: number[] }>({key:null,values:[]});
  const lines = draft.key === storageKey ? draft.values : [];
  const setLines = (update: (v: number[]) => number[]) => setDraft(d => ({key:storageKey,values:update(d.key === storageKey ? d.values : [])}));
  const [question, setQuestion] = useState(""), [topic, setTopic] = useState<CreateConsultation["topic"]>("other");
  const [background, setBackground] = useState(""), [timeWindow, setTimeWindow] = useState("");
  const [editing, setEditing] = useState(false), [chat, setChat] = useState(false), [archive, setArchive] = useState(false), [chart, setChart] = useState(false), [manual, setManual] = useState(false);
  const [method,setMethod]=useState<DivinationMethod>('liuyao'),[oraclePhase,setOraclePhase]=useState<OraclePhase>('idle');
  const oracleMotion=useRef<OracleMotion>({sway:0,energy:0});
  // Method is chosen on the desk after writing: a row of tools slides left/right under the camera.
  const [choosing,setChoosing]=useState(false),[choice,setChoice]=useState(0),[choiceDirection,setChoiceDirection]=useState(0),[instantArrival,setInstantArrival]=useState(false);
  const methodTrack=useRef<MethodTrack>({target:0,current:0,velocity:0,drag:0});
  const [manualValues, setManualValues] = useState([7,7,7,7,7,7]);
  const [muted] = useState(true), [hint, setHint] = useState(""), [ready, setReady] = useState(false), [progress, setProgress] = useState(0);
  // Loading screen: stays until every file is in, the desk has rendered and all tools are warmed.
  const files = useSyncExternalStore(loadingProgress.subscribe, loadingProgress.get);
  const [warm, setWarm] = useState(false), [sceneFailed, setSceneFailed] = useState(false), [loadingGone, setLoadingGone] = useState(false);
  const filesDone = files.total > 0 && files.loaded >= files.total;
  const reveal = (ready && warm && filesDone && s.ready) || sceneFailed;
  const loadFraction = files.total ? Math.min(files.loaded / files.total, 1) * .8 + (ready ? .1 : 0) + (warm ? .1 : 0) : null;
  useEffect(() => { if (!reveal) return; const t = setTimeout(() => setLoadingGone(true), 900); return () => clearTimeout(t); }, [reveal]);
  // Never trap the page behind the curtain (no WebGL, a stalled request): give up waiting after 30 s.
  useEffect(() => { const t = setTimeout(() => setSceneFailed(true), 30000); return () => clearTimeout(t); }, []);
  const paperAnchor = useRef<HTMLElement>(null), shellAnchor = useRef<HTMLButtonElement>(null), oracleAnchor = useRef<HTMLDivElement>(null);
  const [shellHovered, setShellHovered] = useState(false), [shellFocused, setShellFocused] = useState(false);
  const [cameraMoving, setCameraMoving] = useState(true);
  const gesture = useRef(emptyGesture());
  const ejection=useRef(createEjection());
  const [released,setReleased]=useState(0);
  const phaseRef = useRef<Phase>("idle");
  const audio = useRef<AudioContext | null>(null);
  const current = s.current, busy = s.busy || oraclePhase!=='idle' || ["loading","shaking","falling"].includes(phase);
  const activeMethod=current?.method ?? method;
  const complete=!!(current?.chart || current?.oracle);
  const values = current?.chart?.casting.values ?? lines;
  const choosingNow = choosing && !s.selected;
  const view: DeskView = editing ? "writing" : choosingNow ? "choosing" : !s.selected ? "intro" : complete ? "overview" : "casting";
  const arrived = !!s.selected && !editing;
  const [arrivalReady,setArrivalReady] = useState(false);
  const disabled = !arrivalReady || editing || cameraMoving || !ready || !s.ready || s.loading || s.busy || !!current?.chart || values.length >= 6 || chat || chart || archive || manual || s.auth;
  const disabledRef = useRef(disabled); disabledRef.current = disabled;
  const currentRef = useRef(current); currentRef.current = current;
  const mutedRef = useRef(muted); mutedRef.current = muted;
  const step = (value: Phase) => { phaseRef.current = value; setPhase(value); };
  useEffect(() => () => { void audio.current?.close(); }, []);
  useEffect(() => {
    let restored: number[] = [];
    try { const v=JSON.parse(storageKey ? sessionStorage.getItem(storageKey) ?? '[]' : '[]'); if (Array.isArray(v) && v.length<=6 && v.every(n=>[6,7,8,9].includes(n))) restored=v; } catch {}
    setShellHovered(false); setShellFocused(false); setReleased(0); ejection.current=createEjection();
    setDraft({key:storageKey,values:restored}); gesture.current=emptyGesture(); step('idle'); setRound(0); setProgress(0); setHint(''); setChat(false); setChart(false); setManual(false); setEditing(false);
    if (!s.selected) { setQuestion(''); setBackground(''); setTimeWindow(''); setTopic('other'); setMethod('liuyao'); setInstantArrival(false); }
  }, [storageKey, s.selected]);
  useEffect(() => { if (storageKey && draft.key === storageKey) { try { if (current?.chart) sessionStorage.removeItem(storageKey); else sessionStorage.setItem(storageKey, JSON.stringify(draft.values)); } catch {} } }, [storageKey,draft,current?.chart]);

  function chime() {
    if (mutedRef.current || !audio.current) return;
    const ctx = audio.current, osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "triangle"; osc.frequency.setValueAtTime(900 + Math.random() * 600, ctx.currentTime);
    gain.gain.setValueAtTime(.025, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .14);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .15);
  }
  function begin(pointerId: number, x: number, y: number) {
    if (disabledRef.current || ["loading","falling"].includes(phaseRef.current) || gesture.current.held) return;
    if (!currentRef.current) { void pickUpShell(); return; }
    if (!mutedRef.current) { audio.current ??= new AudioContext(); void audio.current.resume(); }
    if (phaseRef.current !== "shaking") {
      gesture.current=emptyGesture(); ejection.current=createEjection(); setReleased(0); setRound(n=>n+1); setProgress(0); setHint(""); step("loading"); return;
    }
    gesture.current=regripGesture(gesture.current,pointerId,x,y,performance.now());
    ejection.current.lastTime=performance.now();
  }
  function finish(cancel = false) {
    const g=gesture.current;
    ejection.current.lastTime=null;
    g.held=false; g.pointerId=-1; g.x=0; g.y=0;
    if (cancel && ["loading","shaking"].includes(phaseRef.current)) {
      gesture.current=emptyGesture(); setReleased(0); ejection.current=createEjection(); setProgress(0); setRound(0); step("idle"); setHint("");
    }
  }
  function eject() {
    if (phaseRef.current !== "shaking" || !tryEject(gesture.current,ejection.current,performance.now())) return;
    setReleased(ejection.current.emitted);
    if (ejection.current.emitted === 3) { gesture.current.held=false; step("falling"); }
  }
  const ejectRef=useRef(eject); ejectRef.current=eject;
  const chimeRef=useRef(chime); chimeRef.current=chime;
  const finishRef = useRef(finish); finishRef.current = finish;
  useEffect(() => {
    const move = (e: PointerEvent) => { if (!gesture.current.held || gesture.current.pointerId !== e.pointerId) return; e.preventDefault(); const before=gesture.current.reversals; moveGesture(gesture.current,e.pointerId,e.clientX,e.clientY); if(gesture.current.reversals>before)chimeRef.current(); setProgress(gestureProgress(gesture.current)); ejectRef.current(); };
    const up = (e: PointerEvent) => { if (e.pointerId === gesture.current.pointerId) finishRef.current(); };
    const cancelPointer = (e: PointerEvent) => { if (e.pointerId === gesture.current.pointerId) finishRef.current(true); };
    const cancel = () => finishRef.current(true);
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener("pointermove",move,{passive:false}); window.addEventListener("pointerup",up); window.addEventListener("pointercancel",cancelPointer); window.addEventListener("blur",cancel); document.addEventListener("visibilitychange",hidden);
    return () => { window.removeEventListener("pointermove",move); window.removeEventListener("pointerup",up); window.removeEventListener("pointercancel",cancelPointer); window.removeEventListener("blur",cancel); document.removeEventListener("visibilitychange",hidden); };
  }, []);
  function settled(result: number | null) {
    if (phaseRef.current !== "falling") return;
    step("settled");
    if (result === null) setHint("铜钱未平放，请重新摇这一爻。");
    else { setHint(""); setLines(previous => previous.length < 6 ? [...previous,result] : previous); }
  }
  const status = !s.ready || s.loading ? "正在找回你的问事…" : s.busy ? "正在保存，请稍候…" : current?.chart ? "卦盘已留存，随时入席继续聊" : phase === "loading" ? "三钱归壳…" : phase === "shaking" ? `左右摇动，让铜钱随势甩出 · 已出 ${released} / 3 枚` : phase === "falling" ? "待三钱落定…" : hint || (values.length === 6 ? "六爻已成，确认后留存卦盘" : current ? `第 ${values.length + 1} 次 · 点击龟甲拿起` : choosingNow ? `择一法问之 · 当前${methodAt(choice) === "liuyao" ? "六爻" : methodAt(choice) === "meihua" ? "梅花易数" : methodAt(choice) === "qiuqian" ? "关帝灵签" : "掷筊"}` : "先在纸上落笔，再为这件事起卦");
  async function saveCast(method: "three_coins" | "manual" = "three_coins") { await s.cast(method === "manual" ? manualValues : lines, method); }
  async function pickUpShell() {
    if (s.busy || s.loading || !s.ready) return;
    if (s.selected && !current) { if (!s.me) s.setAuth(true); else s.setError("这次问事尚未载入，请稍后重试或开始新的问事。"); return; }
    if (!question.trim()) { setEditing(true); setHint("先在信笺上写下所问之事，再拿起龟甲。"); return; }
    if (!editing) { setEditing(true); return; }
    if (!document.querySelector<HTMLFormElement>('.letter-paper form')?.reportValidity()) return;
    // Sealing the letter puts it aside and brings the tools onto the desk to choose from.
    methodTrack.current.target = choice; methodTrack.current.drag = 0;
    setEditing(false); setChoosing(true); setHint("");
  }
  function stepChoice(dir: 1 | -1) {
    if (s.busy) return;
    methodTrack.current.target += dir;
    setChoice(c => c + dir); setChoiceDirection(dir);
  }
  async function confirmChoice() {
    if (s.busy || s.loading || !s.ready || !question.trim()) return;
    const chosen = methodAt(choice);
    setMethod(chosen);
    const created = await s.create({method:chosen,question:question.trim(),topic,background:background.trim() ? [background.trim()] : [],timeWindow:timeWindow.trim() || null,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai"});
    if (created) { setInstantArrival(true); setChoosing(false); }
  }
  function backToLetter() { if (!s.busy) { setChoosing(false); setEditing(true); } }
  function shakeKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Escape") { e.preventDefault(); finish(true); return; }
    if (["ArrowLeft","ArrowRight","ArrowDown","Enter"," "].includes(e.key)) {
      e.preventDefault(); if (e.repeat) return;
      if (phaseRef.current !== "shaking") { begin(-2,0,0); return; }
      if (!gesture.current.held) begin(-2,0,0);
      const g=gesture.current;
      if (!g.held || g.pointerId !== -2) return;
      if (e.key === "ArrowDown") { moveGesture(g,-2,g.lastX,g.y>0 ? -85 : 85); eject(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { moveGesture(g,-2,e.key === "ArrowLeft" ? -85 : 85,0); chime(); eject(); }
      else finish();
      setProgress(gestureProgress(g));
    }
  }
  function newQuestion() { if (!busy) { setArchive(false); setEditing(false); setChoosing(false); setQuestion(''); setBackground(''); setTimeWindow(''); setHint(''); s.navigate(null); } }
  return <main className={`study study-mode-${view}`}>
    {!loadingGone && <LoadingScreen progress={loadFraction} leaving={reveal}/>}
    <div aria-hidden="true" className={`study-world ${phase === "shaking" ? "is-held" : ""}`}><SceneBoundary onFail={() => setSceneFailed(true)}><Canvas shadows dpr={[1,1.5]} camera={{position:[0,7.4,7.9],fov:42}} gl={{antialias:true}} onCreated={({gl}) => { gl.toneMappingExposure = 1.12; }} fallback={<NoWebGL onShow={() => setSceneFailed(true)}/>}><Suspense fallback={null}><Warmup onDone={() => setWarm(true)}/><CameraRig view={view} memory={cameraMemory} paper={paperAnchor} shell={shellAnchor} onMoving={setCameraMoving} track={methodTrack}/><DeskScene oracleAnchor={oracleAnchor} choosing={choosingNow} track={methodTrack} instantArrival={instantArrival} method={activeMethod} oraclePhase={oraclePhase} oracleMotion={oracleMotion} oracle={current?.oracle} released={released} anchor={shellAnchor} onLoaded={() => { if (phaseRef.current === "loading") step("shaking"); }} highlighted={shellHovered || shellFocused} active={arrived} onArrival={setArrivalReady} phase={phase} round={round} gesture={gesture} onGrab={begin} canGrab={!disabled} onSettled={settled} onImpact={chime} onReady={() => setReady(true)}/></Suspense></Canvas></SceneBoundary></div>
    <div className="study-vignette"/>
    {choosingNow && !editing && <MethodChooser track={methodTrack} choice={choice} direction={choiceDirection} busy={s.busy || s.loading} step={stepChoice} confirm={() => void confirmChoice()} back={backToLetter}/>}
    <header className="study-header"><button className="study-logo" aria-label="观爻，打开问事簿" aria-haspopup="dialog" aria-expanded={archive} onClick={() => setArchive(true)} disabled={busy}><span className="study-seal" aria-hidden="true">观<br/>爻</span><Menu className="study-logo-menu" size={16} aria-hidden="true"/></button></header>
    {s.error && <div className="study-error" role="alert">{s.error}<button aria-label="关闭提示" onClick={() => s.setError("")}><X size={16}/></button></div>}
    <QuestionPaper method={activeMethod} choosing={choosingNow} stage={editing ? 'write' : s.selected || choosingNow ? 'side' : 'rest'} current={current} question={question} setQuestion={v=>{setQuestion(v);setHint('');}} values={values} busy={busy || s.loading} error={s.error || hint} open={()=>setEditing(true)} close={()=>setEditing(false)} submit={()=>void pickUpShell()} chart={()=>setChart(true)}/>
    {activeMethod==='liuyao' && arrived && arrivalReady && !current?.chart && values.length < 6 && <button ref={shellAnchor} onPointerEnter={() => setShellHovered(true)} onPointerLeave={() => setShellHovered(false)} onFocus={e => setShellFocused(e.currentTarget.matches(":focus-visible"))} className={`study-shell-object ${["loading","shaking"].includes(phase) ? "is-shaking" : ""}`} aria-label={current ? "龟甲：点击拿起，来回拖动，铜钱会随摇动甩出；键盘左右摇、Escape放回" : "拿起龟甲，收笔起卦"} disabled={disabled || ["loading","falling"].includes(phase)} onPointerDown={e => { if (e.button !== 0 || !current) return; e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); begin(e.pointerId,e.clientX,e.clientY); }} onClick={() => { if (!current) void pickUpShell(); else if (editing) setEditing(false); }} onKeyDown={shakeKey} onBlur={() => { setShellFocused(false); if (gesture.current.pointerId === -2) finish(true); }}><GatheringLight/>{phase === "shaking" && <span aria-hidden="true" className="shell-motion-cues"><i className="cue-left"/><i className="cue-right"/></span>}</button>}
    {activeMethod!=='liuyao' && current && (!complete || oraclePhase==='casting') && !editing && <OracleStation key={current.id} anchor={oracleAnchor} method={activeMethod} busy={s.busy} phase={oraclePhase} setPhase={setOraclePhase} motion={oracleMotion} blocked={cameraMoving || s.loading || archive || chat || chart || s.auth} cast={s.oracle}/>}
    <p className="sr-only" role="status">{status}</p>
    {hint && <div className="study-error" role="alert">{hint}<button aria-label="关闭提示" onClick={() => setHint('')}><X size={16}/></button></div>}
    <footer className="study-footer" hidden={!s.selected || editing || oraclePhase==='casting' || (!complete && (activeMethod!=='liuyao'||values.length < 6))}><div className="study-controls">
      {complete ? <button className="study-cast" onClick={() => setChat(true)}><span>{activeMethod==='liuyao'||activeMethod==='meihua'?'解 卦':activeMethod==='qiuqian'?'解 签':'解 筊'}</span></button> : values.length === 6 ? <button className="study-cast" onClick={() => void saveCast()} disabled={s.busy}><span>{s.busy ? "正在留存…" : "留 存 卦 盘"}</span></button> : null}
    </div></footer>
    {archive && <Modal label="问事簿" close={() => setArchive(false)} className="study-archive"><section className="study-sheet"><header><h2>问事簿</h2><button aria-label="关闭问事簿" onClick={() => setArchive(false)}><X size={21}/></button></header><p className="study-archive-note">{s.me ? `${s.me.user.username}${s.me.trial.remainingConsultations === null ? " · 咨询次数不限" : ` · 还有 ${s.me.trial.remainingConsultations} 次免费咨询`}` : "登录后找回你的问事。"}</p><button className="primary-button" onClick={newQuestion}><Plus size={16}/> 新的问事</button>{current && activeMethod==='liuyao' && !current.chart && <button className="study-account-button" disabled={busy || values.length > 0} onClick={() => {setArchive(false);setManual(true);}}>录入铜钱结果</button>}{s.error && <p role="alert" className="form-error">{s.error}</p>}<nav aria-label="历史咨询">{s.history.map(c => <HistoryEntry key={c.id} record={c} busy={s.busy} selected={c.id===s.selected} open={() => { setArchive(false); if (c.id !== s.selected) s.navigate(c.id); else if(c.chart||c.oracle)setChat(true); }} favorite={()=>void s.favorite(c.id,!c.favorite)} remove={()=>s.remove(c.id)}/>)}{!s.history.length && <p className="study-archive-note">每一次问事，都会留在这里。</p>}{s.more && <button className="study-preview" onClick={() => void s.loadMore()}>加载更早的问事</button>}</nav><button className="study-account-button" onClick={() => s.me ? void s.logout() : s.setAuth(true)}>{s.me ? <><LogOut size={16}/> 退出登录</> : "登录 / 注册"}</button></section></Modal>}
    {chat && current && <Modal label="一席对谈" close={() => setChat(false)}><section className={`study-conversation method-${activeMethod}`}><header><div><span className="study-eyebrow">一席对谈 · {METHOD_NAMES[activeMethod]}</span><h2>{current.question}</h2><small className="conversation-result">{current.chart ? `${current.chart.primaryHexagram.name} 之 ${current.chart.changedHexagram.name} · 卦盘已保存` : current.oracle ? oracleHeadline(current.oracle) : "先把问题聊清楚，再回到桌面起卦"}</small>{complete && <button className="study-inline-chart" onClick={() => setChart(true)}>查看完整结果</button>}</div><button autoFocus aria-label="回到桌面" onClick={() => setChat(false)}><X size={22}/></button></header><div className="study-chat-scroll"><AiPanel key={current.id} consultation={current} onQuota={s.refresh} enabled={!!s.me?.capabilities.ai}/></div></section></Modal>}
    {manual && current && <Modal label="录入铜钱结果" close={() => !s.busy && setManual(false)} className="study-small-modal"><section className="study-sheet"><header><h2>录入铜钱结果</h2><button aria-label="关闭录入" disabled={s.busy} onClick={() => setManual(false)}><X size={20}/></button></header><p>按投掷顺序，由初爻到上爻录入。</p>{manualValues.map((v,i) => <label key={i}>{positions[i]}爻<select aria-label={`第${i+1}爻`} value={v} disabled={s.busy || !!current.chart} onChange={e => setManualValues(a => a.map((x,j) => i===j ? Number(e.target.value) : x))}>{[6,7,8,9].map((n,j) => <option key={n} value={n}>{n} · {["老阴","少阳","少阴","老阳"][j]}</option>)}</select></label>)}{s.error && <p role="alert" className="form-error">{s.error}</p>}{current.chart ? <button className="primary-button" onClick={() => setManual(false)}>已保存，回到桌面</button> : <button className="primary-button" disabled={s.busy} onClick={() => void saveCast("manual")}>{s.busy ? "正在留存…" : "确认六爻并保存"}</button>}</section></Modal>}
    {s.auth && <AuthDialog close={() => s.setAuth(false)} done={async () => { await s.refresh(); s.setAuth(false); s.setError(""); }}/>} {chart && current?.oracle && <Modal label="问事结果" close={()=>setChart(false)} className="study-small-modal oracle-result-dialog"><button className="oracle-close" aria-label="关闭结果" onClick={()=>setChart(false)}><X size={20}/></button><OracleResult result={current.oracle}/></Modal>} {chart && current?.chart && <ChartDialog consultation={current} close={() => setChart(false)}/>}
  </main>;
}
