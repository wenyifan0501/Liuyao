import {useEffect,useRef,type RefObject} from 'react';
import {loadingProgress} from './loading';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import type {DivinationMethod} from '../../../../packages/contracts';
import {OracleTool,type OracleMotion} from './OracleTool';
import {TurtleShell} from './TurtleShell';
import {Coin,type CoinAssets} from './Coin';

export const METHOD_ORDER:readonly DivinationMethod[]=['liuyao','meihua','qiuqian','jiaobei'];
export const METHOD_COPY:Record<DivinationMethod,{title:string;sub:string;desc:string;verb:string}>={
  liuyao:{title:'六爻',sub:'龟甲摇钱',desc:'三枚铜钱摇六次成卦，纳甲装卦，细看一件事的来龙去脉。',verb:'以 此 起 卦'},
  meihua:{title:'梅花易数',sub:'报数起卦',desc:'心中取三个数成卦，观体用生克与旺衰，宜问走向与时机。',verb:'以 此 报 数'},
  qiuqian:{title:'关帝灵签',sub:'摇筒求签',desc:'摇动签筒求得一签，以签诗点醒心事，宜问方向与心境。',verb:'以 此 求 签'},
  jiaobei:{title:'掷筊',sub:'一问可否',desc:'双筊一掷，答可与不可，宜问一个已经想清楚的决定。',verb:'以 此 问 筊'},
};
/** Shared between the HTML chooser (writes target/drag) and the 3D row (integrates current/velocity). */
export type MethodTrack={target:number;current:number;velocity:number;drag:number};
export const methodAt=(index:number)=>METHOD_ORDER[((Math.round(index)%4)+4)%4]!;

/** Neighbours rest past the frame edges, clear of the tea cup and books on the left and the letter on the right. */
const SPACING=6.2,LIFT=1.25;
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

function LiuyaoPiece({coin}:{coin:CoinAssets}){
  // Same pose as the casting tray, so the hand-off to the real shell is seamless.
  return <><group position={[-.65,.12,-.65]} rotation={[.08,.15,-.12]}><TurtleShell/></group>
    {[-1,0,1].map(i=><group key={i} position={[i*.65-.3,.045,1.5]} rotation={[0,i*.7,0]}><Coin assets={coin}/></group>)}</>;
}

const WARM_FRAMES=8;
/**
 * The four tools on one row. Swiping slides the row; a tool in transit is lifted
 * clear of the desk props and set down again, like being carried across the desk.
 * Mounted for the whole session and hidden when not choosing: it is drawn under the desk for its
 * first frames, so opening the chooser later never pays for mounting, uploads or shader compiles.
 */
export function MethodCarousel({track,coin,visible}:{track:RefObject<MethodTrack>;coin:CoinAssets;visible:boolean}){
  const root=useRef<THREE.Group>(null),items=useRef<(THREE.Group|null)[]>([]);
  const motion=useRef<OracleMotion>({sway:0,energy:0});
  const warmed=useRef(0);
  // Enter with the row gliding in from the right each time the chooser opens.
  useEffect(()=>{if(!visible)return;const t=track.current;t.current=reduced()?t.target:t.target-1;t.velocity=0;},[visible]);
  useFrame((_,dt)=>{
    const g=root.current;if(!g)return;
    const {loaded,total}=loadingProgress.get();
    const warming=!visible&&warmed.current<WARM_FRAMES;
    if(warming&&!(total>0&&loaded<total))warmed.current++;
    g.visible=visible||warming;g.position.y=visible?0:-3;
    if(!g.visible)return;
    const t=track.current,desired=t.target-t.drag;
    if(reduced()){t.current=desired;t.velocity=0;}
    else{
      // Critically damped spring, sub-stepped so a slow frame cannot overshoot.
      const k=55,c=2*Math.sqrt(k),total=Math.min(dt,.05),steps=Math.ceil(total/.008),h=total/steps;
      for(let n=0;n<steps;n++){t.velocity+=(k*(desired-t.current)-c*t.velocity)*h;t.current+=t.velocity*h;}
    }
    items.current.forEach((g,i)=>{
      if(!g)return;
      const rel=i-t.current-4*Math.round((i-t.current)/4),a=Math.abs(rel);
      g.visible=a<1.7;
      const inTransit=a<1?Math.min(a,1-a):0,lift=LIFT*THREE.MathUtils.smoothstep(inTransit,0,.16);
      g.position.set(rel*SPACING,lift,0);
      g.rotation.set(lift*.06,0,-Math.sign(rel)*lift*.08);
      g.scale.setScalar(1-.12*Math.min(1,a));
    });
  });
  return <group ref={root} visible={false}>{METHOD_ORDER.map((m,i)=><group key={m} ref={o=>{items.current[i]=o;}}>
    {m==='liuyao'?<LiuyaoPiece coin={coin}/>:<OracleTool method={m} phase="idle" motion={motion} result={null}/>}
  </group>)}</group>;
}
