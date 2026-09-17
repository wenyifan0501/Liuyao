import { TurtleShell, shellSurface } from './TurtleShell';
import { DeskObjects } from './DeskObjects';
import { Candle } from './Candle';
import { settledCoinValue, coinValueAtDeadline, COIN_SETTLE_LIMIT_MS, COIN_CONTACT_DAMPING, contactDecay } from './coinSettlement';
import { ShellOutline } from './ShellOutline';
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { CuboidCollider, CylinderCollider, Physics, RigidBody, useAfterPhysicsStep, useRapier, type RapierRigidBody } from "@react-three/rapier";
import * as THREE from "three";
import type { ShakeGesture } from "./gesture";
import { Arrival } from "./Arrival";
import { surfaceDetail } from "./materials";
import walnutUrl from "./assets/walnut-albedo.jpg";


// Assets are bundled locally; no external requests while using the scene.
function texture(kind: "shell" | "coin") {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1024;
  const c = canvas.getContext("2d")!;
  let seed = 193;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  c.fillStyle = kind === "shell" ? "#64513a" : "#ac8840"; c.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 18000; i++) {
    c.fillStyle = `rgba(${random() > .5 ? "169,128,82" : "24,17,10"},${random() * .16})`;
    c.fillRect(random() * 1024, random() * 1024, random() * 4, 1 + random() * 2);
  }
  if (kind === "shell") {
    for (let row = -1; row < 7; row++) for (let col = -1; col < 7; col++) {
      const x = col * 190 + (row % 2) * 95, y = row * 160;
      for (let ring = 0; ring < 5; ring++) {
        c.beginPath(); for (let j = 0; j <= 6; j++) { const a = Math.PI / 3 * j + Math.PI / 6, radius = 105 - ring * 8; const xx = x + Math.cos(a) * radius, yy = y + Math.sin(a) * radius; j ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
        c.strokeStyle = ring === 0 ? "#282619" : "rgba(33,29,15,.24)"; c.lineWidth = ring === 0 ? 9 : 2; c.stroke();
      }
    }
  }
  if (kind === "coin") {
    c.strokeStyle = "#50401f"; c.lineWidth = 12; c.beginPath(); c.arc(512,512,463,0,Math.PI*2); c.stroke();
    c.lineWidth = 5; c.beginPath(); c.arc(512,512,435,0,Math.PI*2); c.stroke();
    c.font = 'bold 170px "KaiTi", "STKaiti", serif'; c.fillStyle = "#48371e"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("乾", 512, 210); c.fillText("隆", 512, 820); c.fillText("通", 800, 515); c.fillText("寶", 210, 515);
  }
  if (kind === "coin") {
    for(let i=0;i<950;i++){
      const x=random()*1024,y=random()*1024;
      if(Math.hypot(x-512,y-512)>470)continue;
      c.fillStyle=random()>.6?'rgba(64,96,70,.22)':'rgba(60,46,25,.16)';
      c.beginPath();c.ellipse(x,y,random()*7+1,random()*3+1,random()*Math.PI,0,Math.PI*2);c.fill();
    }
  }
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function Coin({ map }: { map: THREE.Texture }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape(); s.absarc(0, 0, .25, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.moveTo(-.07,-.07); hole.lineTo(-.07,.07); hole.lineTo(.07,.07); hole.lineTo(.07,-.07); hole.closePath(); s.holes.push(hole); return s;
  }, []);
  return <group rotation={[-Math.PI / 2, 0, 0]}>
    <mesh castShadow receiveShadow position={[0,0,-.008]}><extrudeGeometry args={[shape,{depth:.016,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:1,steps:1,curveSegments:40}]}/><meshStandardMaterial color="#8c754c" metalness={.72} roughness={.62}/></mesh>
    {[1,-1].map(side => <mesh key={side} position={[0,0,side * .011]} rotation={[0,side === 1 ? 0 : Math.PI,0]}><ringGeometry args={[.105,.242,48]}/><meshStandardMaterial map={map} color={side === 1 ? "#c5af7d" : "#7a6d4c"} metalness={.5} roughness={.65}/></mesh>)}
  </group>;
}

function LaunchedCoin({map,gesture,mouth,index,register,onImpact}:{map:THREE.Texture;gesture:RefObject<ShakeGesture>;mouth:RefObject<THREE.Vector3>;index:number;register:(body:RapierRigidBody|null)=>void;onImpact:()=>void}){
  const body=useRef<RapierRigidBody|null>(null);
  const touched=useRef(false);
  useAfterPhysicsStep(()=>{
    const b=body.current;if(!b || !touched.current || b.isSleeping())return;
    const q=b.rotation(),v=b.linvel(),w=b.angvel();
    const decay=contactDecay(1-2*(q.x*q.x+q.z*q.z),Math.hypot(v.x,v.y,v.z)+Math.hypot(w.x,w.y,w.z),1/60);
    if(decay<1){b.setLinvel({x:v.x*decay,y:v.y*decay,z:v.z*decay},false);b.setAngvel({x:w.x*decay,y:w.y*decay,z:w.z*decay},false);}
  });
  // Capture the current mouth position and movement separately for each escaping coin.
  const initial=useMemo(()=>({
    position:[mouth.current.x+(Math.random()-.5)*.12,Math.max(.5,mouth.current.y),mouth.current.z+.12] as [number,number,number],
    rotation:[Math.random()*Math.PI*2,Math.random()*Math.PI*2,Math.random()*Math.PI*2] as [number,number,number],
    velocity:[gesture.current.direction*(.65+Math.random()*.55)+(index-1)*.35,.3+Math.random()*.45,1.1+Math.random()*.8] as [number,number,number],
    angular:[4+Math.random()*5,(Math.random()-.5)*7,gesture.current.direction*(3+Math.random()*4)] as [number,number,number],
  }),[]);
  return <RigidBody ref={b=>{body.current=b;register(b);}} additionalSolverIterations={8} position={initial.position} rotation={initial.rotation} linearVelocity={initial.velocity} angularVelocity={initial.angular} colliders={false} restitution={.08} friction={.75} linearDamping={.35} angularDamping={.9} ccd onCollisionEnter={()=>{touched.current=true;body.current?.setLinearDamping(COIN_CONTACT_DAMPING.linear);body.current?.setAngularDamping(COIN_CONTACT_DAMPING.angular);onImpact();}}><CylinderCollider args={[.01,.25]} contactSkin={.002}/><Coin map={map}/></RigidBody>;
}

function FallingCoins({map,gesture,onSettled,onImpact,coinPositions,mouth,count}:{count:number;coinPositions:RefObject<THREE.Vector3[]>;mouth:RefObject<THREE.Vector3>;map:THREE.Texture;gesture:RefObject<ShakeGesture>;onSettled:(value:number|null)=>void;onImpact:()=>void}){
  const bodies=useRef<(RapierRigidBody|null)[]>([]),still=useRef(0),finished=useRef(false);
  const {rapier}=useRapier();
  function complete(value:number|null){
    if(finished.current)return;
    finished.current=true;
    // Freeze the visible poses as well as the result: stacked contacts cannot wake them again.
    bodies.current.forEach(b=>{if(b){b.setLinvel({x:0,y:0,z:0},false);b.setAngvel({x:0,y:0,z:0},false);b.setBodyType(rapier.RigidBodyType.Fixed,false);}});
    onSettled(value);
  }
  const completeRef=useRef(complete);completeRef.current=complete;
  useEffect(()=>{
    if(count!==3)return;
    // Wall-clock deadline is independent of physics substeps and rendering frame rate.
    const timer=setTimeout(()=>{
      if(finished.current)return;
      const states=bodies.current.filter((b):b is RapierRigidBody=>b!==null).map(b=>{
        const q=b.rotation();return {up:1-2*(q.x*q.x+q.z*q.z),speed:0};
      });
      completeRef.current(coinValueAtDeadline(states));
    },COIN_SETTLE_LIMIT_MS);
    return ()=>clearTimeout(timer);
  },[count]);
  useAfterPhysicsStep(()=>{
    if(finished.current)return;
    bodies.current.forEach((body,i)=>{if(body){const p=body.translation();coinPositions.current[i].set(p.x,p.y,p.z);}});
    if(count!==3 || bodies.current.filter(Boolean).length!==3)return;
    const states=bodies.current.map(body=>{
      const b=body!,q=b.rotation(),v=b.linvel(),w=b.angvel();
      return {up:1-2*(q.x*q.x+q.z*q.z),speed:b.isSleeping()?0:Math.hypot(v.x,v.y,v.z)+Math.hypot(w.x,w.y,w.z)};
    });
    const value=settledCoinValue(states);
    still.current=value!==null?still.current+1/60:0;
    if(still.current>.55)complete(value);
  });
  return <>{Array.from({length:count},(_,i)=><LaunchedCoin key={i} map={map} gesture={gesture} mouth={mouth} index={i} register={body=>{bodies.current[i]=body;}} onImpact={onImpact}/>)}</>;
}

function Shell({ phase, gesture, onGrab, canGrab, group, anchor, mouth }: {
  group: RefObject<THREE.Group | null>; anchor: RefObject<HTMLButtonElement | null>; mouth: RefObject<THREE.Vector3>;
  phase: string; gesture: RefObject<ShakeGesture>;
  onGrab: (id:number,x:number,y:number)=>void; canGrab:boolean;
}) {
  const {camera,size}=useThree();
  const velocity=useRef([0,0,0,0,0]);
  const points=useMemo(()=>Array.from({length:9*32},(_,i)=>{
    const lat=Math.floor(i/32)/8*Math.PI/2, lon=i%32/32*Math.PI*2;
    return shellSurface(Math.sin(lat),lon);
  }),[]);
  const projected=useMemo(()=>new THREE.Vector3(),[]);
  useFrame((_,dt)=>{
    const object=group.current; if (!object) return;
    const g=gesture.current, raised=["loading","shaking","falling"].includes(phase);
    const destinations=[-.65+(raised?g.x*.8:0),raised?1.35:.12,-.65+(raised?g.y*.32:0),raised?-.1+g.y*.5:.08,raised?-g.x*.4:-.12];
    const values=[object.position.x,object.position.y,object.position.z,object.rotation.x,object.rotation.z];
    // A damped spring gives the object weight, lag and a small settling recoil.
    const steps=Math.max(1,Math.ceil(Math.min(dt,.05)/.008)), h=Math.min(dt,.05)/steps;
    for(let n=0;n<steps;n++) for(let i=0;i<5;i++) {
      velocity.current[i]+=(110*(destinations[i]-values[i])-17*velocity.current[i])*h;
      values[i]+=velocity.current[i]*h;
    }
    object.position.set(values[0],values[1],values[2]); object.rotation.x=values[3]; object.rotation.z=values[4];
    object.updateWorldMatrix(true,false);
    mouth.current.set(0,.13,1.43).applyMatrix4(object.matrixWorld);
    // The input surface and motion cues follow the actual raised and tilted shell.
    if(anchor.current){
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      for(const vertex of points){projected.copy(vertex).applyMatrix4(object.matrixWorld).project(camera);
        const x=(projected.x+1)*size.width/2,y=(1-projected.y)*size.height/2;
        minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      }
      Object.assign(anchor.current.style,{left:`${(minX+maxX)/2}px`,top:`${(minY+maxY)/2}px`,width:`${maxX-minX+8}px`,height:`${maxY-minY+8}px`});
    }
  });
  return <group ref={group} position={[-.65,.12,-.65]} rotation={[.08,.15,-.12]} onPointerDown={e=>{
    if(!canGrab || e.button!==0)return; e.stopPropagation();e.nativeEvent.preventDefault();
    if(e.nativeEvent.target instanceof Element)e.nativeEvent.target.setPointerCapture(e.pointerId);
    onGrab(e.pointerId,e.clientX,e.clientY);
  }}>
    <TurtleShell/>
  </group>;
}

function ReturningCoins({map,positions,mouth,onLoaded}:{map:THREE.Texture;positions:RefObject<THREE.Vector3[]>;mouth:RefObject<THREE.Vector3>;onLoaded:()=>void}){
  const groups=useRef<(THREE.Group|null)[]>([]),elapsed=useRef(0),done=useRef(false);
  const starts=useMemo(()=>positions.current.map(p=>p.clone()),[]);
  useFrame((_,dt)=>{
    elapsed.current+=Math.min(dt,.05);
    groups.current.forEach((object,i)=>{
      if(!object)return;
      const t=THREE.MathUtils.clamp((elapsed.current-.25-i*.12)/.7,0,1),u=t*t*(3-2*t);
      object.position.copy(starts[i]).lerp(mouth.current,u); object.position.y+=Math.sin(t*Math.PI)*.55;
      object.rotation.set(t*Math.PI*.5,t*Math.PI*2,0);object.scale.setScalar(1-.8*Math.pow(t,8));object.visible=t<1;
    });
    if(elapsed.current>1.22 && !done.current){done.current=true;onLoaded();}
  });
  return <>{starts.map((p,i)=><group key={i} ref={o=>{groups.current[i]=o;}} position={p}><Coin map={map}/></group>)}</>;
}

export function DeskScene({ released, anchor, onLoaded, highlighted, active, onArrival, phase, round, gesture, onGrab, canGrab, onSettled, onImpact, onReady }: { released:number; anchor: RefObject<HTMLButtonElement | null>; onLoaded:()=>void; highlighted: boolean; active: boolean; onArrival: (ready: boolean) => void; phase: string; round: number; gesture: RefObject<ShakeGesture>; onGrab: (id: number,x: number,y: number) => void; canGrab: boolean; onSettled: (value: number | null) => void; onImpact: () => void; onReady: () => void }) {
  const shellGroup = useRef<THREE.Group>(null);
  const coinPositions=useRef([-1,0,1].map(i=>new THREE.Vector3(i*.65-.3,.045,1.5))), mouth=useRef(new THREE.Vector3(-.65,1.35,.6));
  useEffect(()=>{if(phase === "idle")coinPositions.current=[-1,0,1].map(i=>new THREE.Vector3(i*.65-.3,.045,1.5));},[phase]);
  const sources = useLoader(THREE.TextureLoader, [walnutUrl]);
  const wood = useMemo(() => { const map = sources[0].clone(); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.needsUpdate = true; return map; }, [sources]);
  const woodDetail = useMemo(() => surfaceDetail("wood"), []), clothDetail = useMemo(() => surfaceDetail("cloth"), []);
  const coin = useMemo(() => texture("coin"), []);
  useEffect(() => { onReady(); }, []);
  useEffect(() => () => { wood.dispose(); woodDetail.dispose(); clothDetail.dispose(); coin.dispose(); }, [wood,woodDetail,clothDetail,coin]);
  return <>
    <ShellOutline target={shellGroup} active={active && canGrab && (highlighted || phase === "shaking")}/>
    <color attach="background" args={["#1d1a13"]}/><hemisphereLight intensity={1.05} color="#e2ded0" groundColor="#3a3026"/><directionalLight castShadow position={[-3,7,2]} intensity={2.65} color="#fff0d5" shadow-mapSize={[2048,2048]} shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={8} shadow-camera-bottom={-8} shadow-bias={-.00015} shadow-normalBias={.025} shadow-radius={3}/><pointLight position={[4,3,-2]} intensity={8} color="#bdbdb0"/>
    <mesh receiveShadow position={[0,-.17,0]}><boxGeometry args={[24,.3,20]}/><meshStandardMaterial map={wood} bumpMap={woodDetail.bump} bumpScale={.012} roughnessMap={woodDetail.roughness} roughness={.8} color="#a7967d"/></mesh>
    <mesh receiveShadow rotation={[-Math.PI/2,0,-.06]} position={[-.1,-.007,.8]}><planeGeometry args={[4.9,4.9]}/><meshStandardMaterial color="#716247" roughness={1}/></mesh>
    <mesh receiveShadow rotation={[-Math.PI/2,0,-.06]} position={[-.1,-.006,.8]}><planeGeometry args={[4.68,4.68]}/><meshStandardMaterial color="#847c61" roughnessMap={clothDetail.roughness} bumpMap={clothDetail.bump} bumpScale={.007} roughness={1}/></mesh>
    <DeskObjects wood={wood}/><Candle/>
    <Arrival active={active} onArrival={onArrival}>
    <Shell group={shellGroup} anchor={anchor} mouth={mouth} phase={phase} gesture={gesture} onGrab={onGrab} canGrab={canGrab}/>
    {round === 0 && phase === "idle" && [-1,0,1].map(i => <group key={i} position={[i*.65-.3,.045,1.5]} rotation={[0,i*.7,0]}><Coin map={coin}/></group>)}
    </Arrival>{phase === "loading" && <ReturningCoins map={coin} positions={coinPositions} mouth={mouth} onLoaded={onLoaded}/>}<Physics gravity={[0,-9.81,0]} timeStep={1/60}><RigidBody type="fixed" colliders={false}><CuboidCollider args={[12,.15,10]} position={[0,-.17,0]}/>{[[0,0,-4],[0,0,4],[-3,0,0],[3,0,0]].map((p,i) => <CuboidCollider key={i} position={p as [number,number,number]} args={i<2 ? [3,1,.1] : [.1,1,4]}/>)}</RigidBody>{active && released > 0 && (phase === "shaking" || phase === "falling" || phase === "settled") && <FallingCoins count={released} key={round} coinPositions={coinPositions} mouth={mouth} map={coin} gesture={gesture} onSettled={onSettled} onImpact={onImpact}/>}</Physics>
  </>;
}
