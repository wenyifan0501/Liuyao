import {Suspense,useEffect,useRef,useState} from 'react';
import {useFrame,useLoader,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {OracleTool,type OracleMotion} from './OracleTool';
import {TurtleShell} from './TurtleShell';
import {preloadModels,type ModelName} from './models';
import brocadeUrl from './assets/mat-brocade.webp';
import {loadingProgress} from './loading';

/** Everything the desk can show, so nothing is fetched when the user reaches the second step. */
const ALL_MODELS:ModelName[]=['desk','turtle_shell','teacup_saucer','inkstone','brush_rest','seal','jiaobei','qiuqian_tube','desk_lamp'];
let started=false;
/** Start every download at once; called as soon as the study module is evaluated. */
export function preloadStudyAssets(){
  if(started)return;started=true;
  preloadModels(ALL_MODELS);
  useLoader.preload(THREE.TextureLoader,brocadeUrl);
}

const WARM_FRAMES=6;
/**
 * Mounts every divination tool once, hidden under the desk top, and renders a few frames so their
 * procedural maps are painted, textures uploaded and shader programs compiled behind the loading
 * screen. Later mounts (the method row, the casting desk) then reuse all of it and appear instantly.
 */
export function Warmup({onDone}:{onDone:()=>void}){
  const [active,setActive]=useState(true);
  const motion=useRef<OracleMotion>({sway:0,energy:0});
  return active?<Suspense fallback={null}><WarmSet motion={motion} onDone={()=>{setActive(false);onDone();}}/></Suspense>:null;
}
function WarmSet({motion,onDone}:{motion:React.RefObject<OracleMotion>;onDone:()=>void}){
  const {gl,scene,camera}=useThree();
  const frames=useRef(0),done=useRef(false);
  useEffect(()=>{
    // Compile now rather than on first sight; compileAsync uses parallel shader compilation when available.
    const compile=(gl as THREE.WebGLRenderer & {compileAsync?:(s:THREE.Object3D,c:THREE.Camera)=>Promise<unknown>}).compileAsync;
    void (compile?compile.call(gl,scene,camera):Promise.resolve(gl.compile(scene,camera))).catch(()=>{});
  },[]);
  useFrame(()=>{
    if(done.current)return;
    // Nested lazy models may still be streaming in; only count frames once every file has arrived.
    const {loaded,total}=loadingProgress.get();
    if(total>0&&loaded<total){frames.current=0;return;}
    if(++frames.current>=WARM_FRAMES){done.current=true;onDone();}
  });
  // Below the 0.3-thick desk slab: rendered (so uploaded and compiled) but never visible.
  return <group position={[0,-2.2,0]} scale={.2}>
    <TurtleShell/>
    {(['meihua','qiuqian','jiaobei'] as const).map((m,i)=><group key={m} position={[(i-1)*4,0,0]}><OracleTool method={m} phase="idle" motion={motion} result={null}/></group>)}
  </group>;
}
