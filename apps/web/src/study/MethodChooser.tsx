import {useEffect,useRef,type RefObject} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {METHOD_COPY,METHOD_ORDER,methodAt,type MethodTrack} from './MethodCarousel';

const TAP_PX=8,SWIPE_FRACTION=.16,SWIPE_SPEED=.45,WHEEL_STEP=60,WHEEL_COOLDOWN=380;
/**
 * Full-stage gesture layer for picking a method after the question is written.
 * Drag or wheel left/right to slide the tools along the desk; tap a side to step,
 * tap the centre (or Enter) to take the tool in front of you.
 */
export function MethodChooser({track,choice,direction,busy,step,confirm,back}:{track:RefObject<MethodTrack>;choice:number;direction:number;busy:boolean;step:(dir:1|-1)=>void;confirm:()=>void;back:()=>void}){
  const stage=useRef<HTMLDivElement>(null),drag=useRef({id:-1,x0:0,t0:0,x:0}),wheel=useRef({sum:0,until:0});
  useEffect(()=>{stage.current?.focus({preventScroll:true});},[]);
  const method=methodAt(choice),copy=METHOD_COPY[method];
  const prev=METHOD_COPY[methodAt(choice-1)],next=METHOD_COPY[methodAt(choice+1)];
  const unit=()=>Math.max(320,window.innerWidth*.34);
  function down(e:React.PointerEvent<HTMLDivElement>){
    if(busy||e.button!==0||(e.target as HTMLElement).closest('button'))return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current={id:e.pointerId,x0:e.clientX,t0:performance.now(),x:e.clientX};
  }
  function move(e:React.PointerEvent<HTMLDivElement>){
    const d=drag.current;if(d.id!==e.pointerId)return;
    d.x=e.clientX;track.current.drag=Math.max(-1.2,Math.min(1.2,(d.x-d.x0)/unit()));
  }
  function up(e:React.PointerEvent<HTMLDivElement>,cancel=false){
    const d=drag.current;if(d.id!==e.pointerId)return;d.id=-1;
    const dx=e.clientX-d.x0,speed=dx/Math.max(1,performance.now()-d.t0);
    track.current.drag=0;
    if(cancel)return;
    if(Math.abs(dx)<TAP_PX){
      const x=e.clientX/window.innerWidth;
      if(x<.3)step(-1);else if(x>.7)step(1);else confirm();
      return;
    }
    if(dx<-unit()*SWIPE_FRACTION||speed<-SWIPE_SPEED)step(1);
    else if(dx>unit()*SWIPE_FRACTION||speed>SWIPE_SPEED)step(-1);
  }
  function onWheel(e:React.WheelEvent<HTMLDivElement>){
    const now=performance.now(),w=wheel.current;
    if(now<w.until)return;
    w.sum+=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
    if(Math.abs(w.sum)>WHEEL_STEP){step(w.sum>0?1:-1);w.sum=0;w.until=now+WHEEL_COOLDOWN;}
  }
  function key(e:React.KeyboardEvent<HTMLDivElement>){
    if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}
    else if(e.key==='ArrowRight'){e.preventDefault();step(1);}
    else if((e.key==='Enter'||e.key===' ')&&e.target===e.currentTarget){e.preventDefault();confirm();}
    else if(e.key==='Escape'){e.preventDefault();back();}
  }
  return <div ref={stage} className="method-stage" tabIndex={0} role="group" aria-roledescription="轮播"
    aria-label={`选择问事方式：当前${copy.title}，${copy.sub}。左右方向键切换，回车选定，Escape 回到信笺。`}
    onPointerDown={down} onPointerMove={move} onPointerUp={e=>up(e)} onPointerCancel={e=>up(e,true)} onWheel={onWheel} onKeyDown={key}>
    <button type="button" className="method-side method-prev" onClick={()=>step(-1)} disabled={busy} aria-label={`上一个：${prev.title}`}><ChevronLeft size={22}/><span>{prev.title}</span></button>
    <button type="button" className="method-side method-next" onClick={()=>step(1)} disabled={busy} aria-label={`下一个：${next.title}`}><span>{next.title}</span><ChevronRight size={22}/></button>
    <div className="method-panel">
      <div className="method-card" key={choice} data-direction={direction} aria-live="polite">
        <span className="method-kicker">{copy.sub}</span>
        <h2>{copy.title}</h2>
        <p>{copy.desc}</p>
      </div>
      <div className="method-dots" aria-hidden="true">{METHOD_ORDER.map(m=><i key={m} className={m===method?'is-current':''}/>)}</div>
      <div className="method-actions">
        <button type="button" className="method-back" onClick={back} disabled={busy}>改写所问</button>
        <button type="button" className="study-cast method-confirm" onClick={confirm} disabled={busy}><span>{busy?'稍 候':copy.verb}</span></button>
      </div>
      <p className="method-hint" aria-hidden="true">左右拖动或滚轮切换 · 点中间选定</p>
    </div>
  </div>;
}
