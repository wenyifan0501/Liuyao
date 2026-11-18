import {useEffect,useRef,useState,type RefObject} from 'react';
import type {DivinationMethod} from '../../../../packages/contracts';
import {GatheringLight} from './GatheringLight';
import type {OracleMotion,OraclePhase} from './OracleTool';

const SHAKE_DISTANCE=1500, HOLD_MS=600;
const CAPTIONS:Record<Exclude<DivinationMethod,'liuyao'>,Record<OraclePhase,string>>={
  qiuqian:{idle:'按住签筒，左右摇动',charging:'心中默念所问，继续摇',casting:'签出…'},
  jiaobei:{idle:'按住双筊，心中默念所问',charging:'默念完毕，松手掷出',casting:'筊落…'},
  meihua:{idle:'点击八卦盘，报三个数',charging:'',casting:'成卦…'},
};
export function OracleStation({anchor,method,busy,blocked,phase,setPhase,motion,cast}:{anchor:RefObject<HTMLDivElement|null>;method:Exclude<DivinationMethod,'liuyao'>;busy:boolean;blocked:boolean;phase:OraclePhase;setPhase:(p:OraclePhase)=>void;motion:RefObject<OracleMotion>;cast:(numbers?:number[])=>Promise<unknown>}){
  const [opened,setOpened]=useState(false),[numbers,setNumbers]=useState(['','','']),[progress,setProgress]=useState(0);
  const locked=useRef(false),gesture=useRef({id:-1,x:0,lastDir:0,distance:0,down:0});
  const disabled=busy||blocked||phase==='casting';
  useEffect(()=>()=>{motion.current.sway=0;motion.current.energy=0;setPhase('idle');},[]);
  function release(){motion.current.sway=0;motion.current.energy=0;setProgress(0);}
  function fire(values?:number[]){
    if(locked.current)return;locked.current=true;release();setPhase('casting');
    // The server result arrives during the animation; a failure returns the tool to rest.
    void cast(values).then(r=>{if(!r)setPhase('idle');},()=>setPhase('idle')).finally(()=>{locked.current=false;setTimeout(()=>setPhase('idle'),2600);});
  }
  function shake(dx:number){
    const g=gesture.current,dir=Math.sign(dx);
    g.distance+=Math.abs(dx)*(dir&&dir!==g.lastDir?1.4:1);if(dir)g.lastDir=dir;
    motion.current.sway=Math.max(-1,Math.min(1,motion.current.sway+dx/90));motion.current.energy=Math.min(1,g.distance/SHAKE_DISTANCE+.3);
    setProgress(Math.min(1,g.distance/SHAKE_DISTANCE));
    if(g.distance>=SHAKE_DISTANCE){g.id=-1;fire();}
  }
  function down(e:React.PointerEvent<HTMLButtonElement>){
    if(disabled||e.button!==0)return;
    if(method==='meihua'){setOpened(true);return;}
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current={id:e.pointerId,x:e.clientX,lastDir:0,distance:0,down:performance.now()};setPhase('charging');
  }
  function move(e:React.PointerEvent<HTMLButtonElement>){
    const g=gesture.current;if(g.id!==e.pointerId||method!=='qiuqian')return;
    const dx=e.clientX-g.x;g.x=e.clientX;shake(dx);
  }
  function up(e:React.PointerEvent<HTMLButtonElement>,cancel=false){
    const g=gesture.current;if(g.id!==e.pointerId)return;g.id=-1;
    if(method==='jiaobei'&&!cancel&&performance.now()-g.down>=HOLD_MS){fire();return;}
    release();setPhase('idle');
  }
  function key(e:React.KeyboardEvent<HTMLButtonElement>){
    if(disabled)return;
    if(method==='meihua'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setOpened(true);return;}
    if(method==='qiuqian'&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();if(phase==='idle')setPhase('charging');shake(e.key==='ArrowLeft'?-120:120);return;}
    if(method==='qiuqian'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();fire();return;}
    if(method==='jiaobei'&&(e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();gesture.current.down=performance.now();setPhase('charging');}
  }
  function keyUp(e:React.KeyboardEvent<HTMLButtonElement>){
    if(method==='jiaobei'&&(e.key==='Enter'||e.key===' ')&&phase==='charging'){e.preventDefault();fire();}
  }
  const caption=CAPTIONS[method][phase];
  const label={qiuqian:'签筒：按住后左右拖动摇签；键盘左右方向键摇动，Enter 直接求签',jiaobei:'木筊：按住默念所问，松手掷出；键盘按住 Enter 或空格后松开',meihua:'先天八卦盘：点击后报三个数起卦'}[method];
  // Position and size are written every frame by the 3D tool (useScreenAnchor), so hit area and caption follow it.
  return <div ref={anchor} className={`oracle-station oracle-station-${method} is-${phase}`}>
    {method==='meihua'&&opened&&phase==='idle'?<form className="meihua-slip" onSubmit={e=>{e.preventDefault();fire(numbers.map(Number));}}>
      <p className="meihua-slip-title">报 数 起 卦</p>
      <p className="meihua-slip-note">心中默想所问，随手取三个数：可以是此刻所见、所闻或所想之数。</p>
      <div>{numbers.map((n,i)=><label key={i}><span>{['上卦','下卦','动爻'][i]}</span><input aria-label={`第${i+1}个数，取${['上卦','下卦','动爻'][i]}`} placeholder={['一','二','三'][i]} type="number" inputMode="numeric" min={1} max={999999999} required step={1} value={n} disabled={disabled} onChange={e=>setNumbers(a=>a.map((v,j)=>i===j?e.target.value:v))}/></label>)}</div>
      <div className="meihua-slip-actions"><button type="button" className="meihua-slip-cancel" onClick={()=>setOpened(false)}>收起</button><button className="letter-seal" disabled={disabled}>成卦</button></div>
    </form>:<button className="oracle-object-target" aria-label={label} disabled={disabled}
      onPointerDown={down} onPointerMove={move} onPointerUp={e=>up(e)} onPointerCancel={e=>up(e,true)} onKeyDown={key} onKeyUp={keyUp} onBlur={()=>{if(phase==='charging'){release();setPhase('idle');}}}>
      {phase==='idle'&&<GatheringLight/>}
      {method==='qiuqian'&&phase==='charging'&&<span aria-hidden="true" className="shell-motion-cues"><i className="cue-left"/><i className="cue-right"/></span>}
    </button>}
    {caption&&!(method==='meihua'&&opened&&phase==='idle')&&<p className="oracle-caption" aria-hidden="true">{caption}{method==='qiuqian'&&phase==='charging'&&<span className="oracle-progress"><i style={{width:`${progress*100}%`}}/></span>}</p>}
    <span className="sr-only" role="status">{phase==='casting'?'正在落定…':''}</span>
  </div>;
}
