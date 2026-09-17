import { useEffect, useRef, useState } from "react";
import { ArrowRight, Compass, X } from "lucide-react";
import { api } from "./api";
import type { ConsultationView } from "../../../packages/contracts";
import { HexagramBook } from "./reference/HexagramBook";
const relatives: Record<string, string> = { siblings: "兄弟", offspring: "子孙", parents: "父母", wealth: "妻财", officials: "官鬼" };
function Brand() { return <div className="brand"><span className="brand-mark"><Compass size={25}/></span><span>观爻<small>GUAN YAO</small></span></div>; }
export function AuthDialog({ close, done }: { close: () => void; done: () => Promise<void> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="auth-dialog" ref={ref} onCancel={close}><button className="dialog-close icon-button" aria-label="关闭登录" onClick={close}><X size={20}/></button><Brand/><h2>{register ? "开启你的第一次问事" : "欢迎回来"}</h2><p className="muted">{register ? "邀请内测中，凭邀请码注册。" : "登录，继续那些还在关心的事情。"}</p><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError(""); const form = new FormData(e.currentTarget); const data = { username: String(form.get("username")), password: String(form.get("password")) };
    try { if (register && !registered) { await api("/auth/register", { ...data, invitation: String(form.get("invitation")).trim() }); setRegistered(true); } await api("/auth/login", data); await done(); } catch(e) { setError(e instanceof Error ? e.message : "连接失败，请重试"); } finally { setBusy(false); }
  }}><label>用户名<input name="username" autoComplete="username" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]+" placeholder="英文、数字或下划线"/></label><label>密码<input type="password" name="password" autoComplete={register ? "new-password" : "current-password"} required minLength={10} maxLength={128} placeholder="至少 10 个字符"/></label>{register && !registered && <label>邀请码<input name="invitation" required minLength={32} maxLength={64} autoComplete="off" placeholder="输入收到的一次性邀请码"/></label>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "请稍候…" : register && !registered ? "注册并登录" : "登录"}<ArrowRight size={17}/></button></form><button className="auth-switch" onClick={() => { setRegister(!register); setError(""); setRegistered(false); }}>{register ? "已有账号？去登录" : "有邀请码？创建账号"}</button></dialog>;
}

function Hexagram({ lines }: { lines: readonly { yinYang: string; moving?: boolean }[] }) { return <div className="hexagram" aria-hidden="true">{[...lines].reverse().map((l, i) => <div key={i} className={`yao ${l.yinYang} ${l.moving ? "moving" : ""}`}><i/><i/></div>)}</div>; }
function ChartSummary({ consultation }: { consultation: ConsultationView }) {
  const c = consultation.chart!;
  return <div className="chart-summary"><div><Hexagram lines={c.primaryLines}/><small>本卦</small><h2>{c.primaryHexagram.name}</h2><span>{c.primaryHexagram.palace}宫</span></div><ArrowRight className="chart-arrow" size={23}/><div><Hexagram lines={c.changedLines}/><small>变卦</small><h2>{c.changedHexagram.name}</h2><span>{c.changingLines.length ? `${c.changingLines.join("、")} 爻动` : "静卦 · 无动爻"}</span></div></div>;
}
export function ChartDialog({ consultation, close }: { consultation: ConsultationView; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const c = consultation.chart!;
  const [page, setPage] = useState<'chart' | 'meaning'>('chart');
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog className="chart-dialog" aria-labelledby="chart-title" ref={ref} onCancel={close}><header><h2 id="chart-title">这一次的卦盘</h2><button className="icon-button" aria-label="关闭卦盘" onClick={close}><X size={20}/></button></header><p className="muted">{consultation.question}</p><div className="chart-tabs" role="tablist" aria-label="卦盘内容">{(['chart', 'meaning'] as const).map((value, index) => <button key={value} id={value + '-tab'} role="tab" aria-selected={page === value} aria-controls={value + '-panel'} tabIndex={page === value ? 0 : -1} onClick={() => setPage(value)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'chart' : event.key === 'End' ? 'meaning' : page === 'chart' ? 'meaning' : 'chart'; setPage(next); document.getElementById(next + '-tab')?.focus(); } }}>{index === 0 ? '排盘' : '卦义'}</button>)}</div><div id="meaning-panel" role="tabpanel" aria-labelledby="meaning-tab" hidden={page !== 'meaning'}><HexagramBook consultation={consultation}/></div><div id="chart-panel" role="tabpanel" aria-labelledby="chart-tab" hidden={page !== 'chart'}><ChartSummary consultation={consultation}/><div className="calendar-info"><span>月建 <b>{c.timeContext.monthBranch}</b></span><span>日辰 <b>{c.timeContext.dayStem}{c.timeContext.dayBranch}</b></span><span>旬空 <b>{c.timeContext.voidBranches.join("、")}</b></span></div><div className="table-scroll"><table><caption>六爻详情 · 上爻在上，初爻在下</caption><thead><tr><th>爻位</th><th>六神</th><th>六亲纳甲</th><th>阴阳</th><th>标记</th></tr></thead><tbody>{[...c.primaryLines].reverse().map(l => <tr key={l.position}><td>{l.position}</td><td>{l.spirit}</td><td>{relatives[l.relative]} {l.stem}{l.branch}</td><td>{l.yinYang === "yang" ? "阳" : "阴"}{l.moving && <span className="moving-tag">动</span>}</td><td>{[l.isSelf ? "世" : "", l.isResponse ? "应" : "", l.isVoid ? "空" : ""].filter(Boolean).join(" · ") || "—"}</td></tr>)}</tbody></table></div><div className="chart-provenance"><p>起卦方式：{c.casting.method === "simulated_three_coins" ? "模拟三枚铜钱" : c.casting.method === "three_coins" ? "三枚铜钱" : "手动录入"}</p><p>原始结果：{c.casting.values.join(" · ")}（初爻至上爻）</p><p>{new Date(c.timeContext.castAt).toLocaleString("zh-CN", { timeZone: c.timeContext.timezone })} · {c.timeContext.timezone}</p></div></div></dialog>;
}
