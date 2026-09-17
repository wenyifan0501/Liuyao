import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { ConsultationView, CreateConsultation, TrialView } from "../../../../packages/contracts";
type Me = { user: { id: string; username: string }; trial: TrialView; capabilities: { ai: boolean } };
const fromHash = () => /^#\/consultations\/([a-f0-9-]{36})$/.exec(location.hash)?.[1] ?? null;
export function useConsultations() {
  const [me, setMe] = useState<Me | null>(null), [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(fromHash), [current, setCurrent] = useState<ConsultationView | null>(null);
  const [history, setHistory] = useState<ConsultationView[]>([]), [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [auth, setAuth] = useState(false);
  const active = useRef(selected); active.current = selected;
  const pending = useRef<{ payload: string; key: string } | null>(null);
  const lock = useRef(false);
  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : "连接失败，请重试。");
    if (e instanceof ApiError && e.status === 401) { setMe(null); setHistory([]); setCurrent(null); setAuth(true); }
  }
  async function refresh() {
    const user = await api<Me>("/me"); setMe(user);
    const data = await api<{ consultations: ConsultationView[] }>("/consultations"); setHistory(data.consultations); setMore(data.consultations.length === 30);
  }
  useEffect(() => {
    let live = true;
    api<Me>("/me").then(async user => {
      if (!live) return; setMe(user);
      const data = await api<{ consultations: ConsultationView[] }>("/consultations");
      if (live) { setHistory(data.consultations); setMore(data.consultations.length === 30); }
    }).catch(e => { if (live && !(e instanceof ApiError && e.status === 401)) setError("暂时连接不上服务，请刷新重试。"); }).finally(() => { if (live) setReady(true); });
    const change = () => { setSelected(fromHash()); setError(""); };
    addEventListener("hashchange", change);
    return () => { live = false; removeEventListener("hashchange", change); };
  }, []);
  useEffect(() => {
    let live = true; setCurrent(null);
    if (!selected || !me) { setLoading(false); return; }
    setLoading(true);
    api<ConsultationView>(`/consultations/${selected}`).then(data => { if (live) setCurrent(data); }).catch(e => { if (live) fail(e); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [selected, me?.user.id]);
  function navigate(id: string | null) { active.current = id; setSelected(id); setCurrent(null); setError(""); location.hash = id ? `/consultations/${id}` : "/"; }
  async function create(data: CreateConsultation) {
    if (!me) { setAuth(true); return; }
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    const payload = JSON.stringify(data);
    if (pending.current?.payload !== payload) pending.current = { payload, key: crypto.randomUUID() };
    try {
      const result = await api<ConsultationView>("/consultations", data, pending.current.key);
      pending.current = null;
      setHistory(h => [result, ...h.filter(c => c.id !== result.id)]); navigate(result.id); return result.id;
    } catch(e) { fail(e); } finally { lock.current = false; setBusy(false); }
  }
  async function cast(values: number[], method: "three_coins" | "manual" = "three_coins") {
    if (!current || lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      const result = await api<ConsultationView>(`/consultations/${current.id}/cast`, { method, values });
      if (active.current === result.id) setCurrent(result);
      setHistory(h => h.map(c => c.id === result.id ? result : c));
    } catch(e) { fail(e); } finally { lock.current = false; setBusy(false); }
  }
  async function favorite(id:string,value:boolean) {
    if(lock.current)return;lock.current=true;setBusy(true);setError("");
    try{const result=await api<ConsultationView>(`/consultations/${id}/favorite`,{favorite:value});
      setHistory(h=>h.map(c=>c.id===id?result:c));if(active.current===id)setCurrent(result);
    }catch(e){fail(e);}finally{lock.current=false;setBusy(false);}
  }
  async function remove(id:string) {
    if(lock.current)return false;lock.current=true;setBusy(true);setError("");
    try{await api(`/consultations/${id}/delete`,{});setHistory(h=>h.filter(c=>c.id!==id));
      if(me)sessionStorage.removeItem(`study-lines:${me.user.id}:${id}`);
      if(active.current===id)navigate(null);return true;
    }catch(e){fail(e);return false;}finally{lock.current=false;setBusy(false);}
  }
  async function logout() { if (lock.current) return; try { await api("/auth/logout", {}); setMe(null); setHistory([]); navigate(null); } catch(e) { fail(e); } }
  async function loadMore() {
    if (lock.current) return; lock.current = true;
    try { const data = await api<{ consultations: ConsultationView[] }>(`/consultations?offset=${history.length}`); setHistory(h => [...h, ...data.consultations.filter(c => !h.some(x => x.id === c.id))]); setMore(data.consultations.length === 30); }
    catch(e) { fail(e); } finally { lock.current = false; }
  }
  return { me, ready, selected, current, history, more, loading, busy, error, auth, setAuth, setError, refresh, create, cast, favorite, remove, logout, loadMore, navigate };
}
