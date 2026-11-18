import {METHOD_NAMES} from '../../../../packages/contracts';
import {useState} from 'react';
import {Star,Trash2} from 'lucide-react';
import type {ConsultationView} from '../../../../packages/contracts';
export function HistoryEntry({record,busy,selected,open,favorite,remove}:{record:ConsultationView;busy:boolean;selected:boolean;open:()=>void;favorite:()=>void;remove:()=>Promise<boolean>}){
  const [confirm,setConfirm]=useState(false);
  return <article className={`archive-entry ${selected?'is-current':''}`}>
    <button className="study-history-item" disabled={busy} onClick={open} aria-current={selected?'page':undefined}><span>{record.question}</span><small>{new Date(record.createdAt).toLocaleDateString('zh-CN')} · {METHOD_NAMES[record.method ?? 'liuyao']} · {record.chart?.primaryHexagram.name ?? (record.oracle ? '已留存' : '待起卦')}</small></button>
    <div className="archive-entry-actions"><button disabled={busy} aria-label={record.favorite?'取消收藏':'收藏'} aria-pressed={!!record.favorite} onClick={favorite}><Star size={17} fill={record.favorite?'currentColor':'none'}/></button><button disabled={busy} aria-label="删除记录" onClick={()=>setConfirm(true)}><Trash2 size={16}/></button></div>
    {confirm && <div className="archive-delete-confirm"><span>删除这次问事？</span><button disabled={busy} onClick={()=>setConfirm(false)}>取消</button><button className="danger" disabled={busy} onClick={async()=>{if(await remove())setConfirm(false);}}>删除</button></div>}
  </article>;
}
