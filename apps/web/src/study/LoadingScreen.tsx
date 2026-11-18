import './loading.css';

const STEPS=['研 墨','点 灯','铺 纸','请 器'];
/**
 * Shown from the first paint (as the lazy-chunk fallback) until the desk is loaded and warmed.
 * `progress` is null while only the page code is downloading (no file counts yet).
 */
export function LoadingScreen({progress=null,leaving=false}:{progress?:number|null;leaving?:boolean}){
  const p=progress===null?null:Math.max(0,Math.min(1,progress));
  const step=STEPS[p===null?0:Math.min(STEPS.length-1,Math.floor(p*STEPS.length))]!;
  return <div className={`study-loading${leaving?' is-leaving':''}`} role="status" aria-live="polite" aria-label={p===null?'书斋载入中':`书斋载入中，${Math.round(p*100)}%`}>
    <div className="study-loading-glow" aria-hidden="true"/>
    <div className="study-loading-mark" aria-hidden="true"><span>观</span><span>爻</span></div>
    <p className="study-loading-title" aria-hidden="true">一 事 一 问</p>
    <div className={`study-loading-bar${p===null?' is-indeterminate':''}`} aria-hidden="true"><i style={p===null?undefined:{transform:`scaleX(${p})`}}/></div>
    <p className="study-loading-step" aria-hidden="true">{step}<small>{p===null?'':`${Math.round(p*100)}%`}</small></p>
  </div>;
}
