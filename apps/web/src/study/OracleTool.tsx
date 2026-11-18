import {useEffect,useMemo,useRef,type RefObject} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {canvas,colorTexture,dataTexture,heightToNormal,seeded} from './surfaceMaps';
import {Lazy,Model,useModelMesh,useModelNode} from './models';
import type {DivinationMethod,OracleResult,MeihuaResult,QiuqianResult,JiaobeiResult} from '../../../../packages/contracts';

export type OraclePhase='idle'|'charging'|'casting';
export type OracleMotion={sway:number;energy:number};
type Common={phase:OraclePhase;motion:RefObject<OracleMotion>};
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease=(t:number)=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
function canvasTexture(w:number,h:number,draw:(c:CanvasRenderingContext2D)=>void){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d')!);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}
/** Animation clock that starts when a cast begins and remembers when the server result arrived. */
function useCastClock(phase:OraclePhase,result:unknown){
  const clock=useRef({t:0,running:false,resultAt:-1,animate:!result});
  useEffect(()=>{if(phase==='casting'&&!clock.current.running){clock.current={t:0,running:true,resultAt:-1,animate:true};}},[phase]);
  useEffect(()=>{const c=clock.current;if(result&&c.running&&c.resultAt<0)c.resultAt=c.t;if(result&&!c.running)c.animate=false;},[result]);
  return clock;
}

/* ───────────── 求签：朱漆签筒（Blender：scripts/blender/qiuqian.py） ───────────── */
/** Lot slip UV layout from qiuqian.py: front face u .06–1, v top→bottom in glTF; plain strip u .01–.04. */
const LOT_LEN=1.12,LOT_WIDTH=.05,LOT_FRONT=.06,DRAWN_SCALE=2.1;
const LOT_TINTS=['#ffffff','#f4ead8','#ecdcc2','#e3d0ae'];
/** Paints the drawn lot's number onto a copy of the slip texture, in the slip's own UV space. */
function drawnLotTexture(base:THREE.Texture|null,label:string){
  const W=256,H=2048,el=document.createElement('canvas');el.width=W;el.height=H;const c=el.getContext('2d')!;
  const img=base?.image as CanvasImageSource|undefined;
  if(img)c.drawImage(img,0,0,W,H);else{c.fillStyle='#d6ba80';c.fillRect(0,0,W,H);c.fillStyle='#962016';c.fillRect(0,0,W,H*.075);}
  // The face is 0.05 wide but 1.12 long, so texels are ~2.6× taller in world space: squash glyphs to stay square.
  const pxPerU=W*(1-LOT_FRONT)/LOT_WIDTH,pxPerV=H/LOT_LEN,squash=pxPerV/pxPerU;
  const glyph=LOT_WIDTH*.8*pxPerU,step=LOT_WIDTH*.95*pxPerV,cx=W*(LOT_FRONT+(1-LOT_FRONT)/2);
  c.fillStyle='#2b1a0e';c.font=`bold ${glyph}px "KaiTi","STKaiti","Kaiti SC",serif`;c.textAlign='center';c.textBaseline='middle';
  [...label].forEach((ch,i)=>{c.save();c.translate(cx,H*.15+i*step);c.scale(1,squash);c.fillText(ch,0,0);c.restore();});
  const t=new THREE.CanvasTexture(el);t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;t.anisotropy=8;return t;
}
function shadowed(o:THREE.Object3D){o.traverse(m=>{if((m as THREE.Mesh).isMesh){m.castShadow=true;m.receiveShadow=true;}});return o;}
function withMaterial(o:THREE.Object3D,material:THREE.Material){o.traverse(m=>{if((m as THREE.Mesh).isMesh)(m as THREE.Mesh).material=material;});return shadowed(o);}
function Qiuqian({phase,motion,result}:Common&{result:QiuqianResult|null}){
  const tube=useRef<THREE.Group>(null),sticks=useRef<THREE.Group>(null),drawn=useRef<THREE.Group>(null);
  const clock=useCastClock(phase,result);
  // The tube node holds one mesh per material (lacquer, foot, inside, brass, plaque, gilt); clone per use since the
  // method row and the casting desk may both show a tube. Geometry and materials stay shared.
  // Node transforms carry meshopt's dequantisation scale/offset, so always clone whole nodes, never bare geometry.
  const tubeSource=useModelNode('qiuqian_tube','qiuqian_tube'),lotSource=useModelNode('qiuqian_tube','qiuqian_lot');
  const lot=useModelMesh('qiuqian_tube','qiuqian_lot'),lotBase=lot.material as THREE.MeshStandardMaterial;
  const tubeMesh=useMemo(()=>shadowed(tubeSource.clone(true)),[tubeSource]);
  const lotMaterials=useMemo(()=>LOT_TINTS.map(t=>{const m=lotBase.clone();m.color.set(t);return m;}),[lotBase]);
  const lotClones=useMemo(()=>Array.from({length:30},(_,i)=>withMaterial(lotSource.clone(true),lotMaterials[i%4]!)),[lotSource,lotMaterials]);
  const drawnMaterial=useMemo(()=>{
    const m=lotBase.clone();
    if(result){m.map=drawnLotTexture(lotBase.map,`第${toChinese(result.number)}籤`);}
    return m;
  },[lotBase,result?.number]);
  const drawnLot=useMemo(()=>withMaterial(lotSource.clone(true),drawnMaterial),[lotSource,drawnMaterial]);
  useEffect(()=>()=>{lotMaterials.forEach(m=>m.dispose());},[lotMaterials]);
  useEffect(()=>()=>{if(result)drawnMaterial.map?.dispose();drawnMaterial.dispose();},[drawnMaterial]);
  const sway=useRef(0);
  useFrame((state,dt)=>{
    const t=state.clock.elapsedTime,c=clock.current,m=motion.current,reduce=reducedMotion();
    if(c.running)c.t+=Math.min(dt,.05);
    sway.current+=(m.sway-sway.current)*Math.min(1,dt*12);
    m.sway*=Math.exp(-dt*3);
    const g=tube.current,s=drawn.current;if(!g||!s)return;
    let tilt=0,lift=0,rattle=0,shift=0;
    if(phase==='charging'&&!reduce){tilt=sway.current*.32;shift=sway.current*.22;lift=.15;rattle=m.energy;}
    if(c.running&&c.animate){
      const k=c.t;
      const out=c.resultAt>=0?Math.max(k-Math.max(c.resultAt,1.1),0):0;
      if(!reduce){tilt=Math.sin(k*14)*.12*(1-ease(out/.4));rattle=1-ease(out/.4);}
      g.rotation.x=.5*ease(k/.5)*(1-ease((out-.9)/.6));lift=.2*(1-ease((out-.9)/.6));
      // The chosen lot slides out of the mouth, then drops face-up onto the cloth, growing to reading size.
      const rise=ease((k-.5)/.7),fall=ease(out/.8);
      const from=new THREE.Vector3(0,.85+rise*.55,0).applyEuler(new THREE.Euler(g.rotation.x,0,0)).add(new THREE.Vector3(0,lift,0));
      const to=new THREE.Vector3(.95,.02,1.15);
      s.position.lerpVectors(from,to,fall);s.position.y+=Math.sin(fall*Math.PI)*.6;
      s.rotation.set(g.rotation.x*(1-fall)+(-Math.PI/2)*fall,0,fall*.55);
      s.scale.setScalar(1+(DRAWN_SCALE-1)*fall);
      s.visible=k>.5;
      if(out>1.6)c.running=false;
    }else if(result){s.visible=true;s.position.set(.95,.02,1.15);s.rotation.set(-Math.PI/2,0,.55);s.scale.setScalar(DRAWN_SCALE);g.rotation.x=0;}
    else s.visible=false;
    if(!c.running||!c.animate){g.rotation.x+=(0-g.rotation.x)*Math.min(1,dt*6);}
    g.rotation.z=tilt;g.position.set(shift,lift,0);
    sticks.current?.children.forEach((stick,i)=>{stick.position.y=.86+(i%4)*.05+(rattle?Math.abs(Math.sin(t*31+i*1.7))*.07*rattle:0);});
  });
  return <group position={[-.15,0,-.1]}>
    <group ref={tube}>
      <primitive object={tubeMesh}/>
      <group ref={sticks}>{lotClones.map((o,i)=>{const a=i*2.39996,r=.05+Math.sqrt(i/30)*.24;
        return <group key={i} position={[Math.cos(a)*r,.9,Math.sin(a)*r]} rotation={[.08*Math.cos(a),a*1.7,.08*Math.sin(a)]}><primitive object={o}/></group>;})}</group>
    </group>
    <group ref={drawn} visible={false}><primitive object={drawnLot}/></group>
  </group>;
}
const DIGITS='〇一二三四五六七八九';
function toChinese(n:number){if(n===100)return '一百';if(n<10)return DIGITS[n]!;const tens=Math.floor(n/10),ones=n%10;return `${tens>1?DIGITS[tens]:''}十${ones?DIGITS[ones]:''}`;}

/* ───────────── 掷筊：一对月牙木筊 ───────────── */
/** Blender-built block (scripts/blender/jiaobei.py): convex face +Y, flat face at y=0, height JIAOBEI_HEIGHT. */
const JIAOBEI_SCALE=1.4,JIAOBEI_HEIGHT=.254*JIAOBEI_SCALE;
const FACE_UP={round:new THREE.Euler(0,0,0),flat:new THREE.Euler(Math.PI,0,0)};
function Jiaobei({phase,result}:Common&{result:JiaobeiResult|null}){
  const blocks=[useRef<THREE.Group>(null),useRef<THREE.Group>(null)];
  const clock=useCastClock(phase,result);
  const rest=useMemo(()=>[{p:new THREE.Vector3(-.72,0,-.05),yaw:.35},{p:new THREE.Vector3(.7,0,.55),yaw:-.6}],[]);
  const restY=(face:'flat'|'round')=>face==='flat'?JIAOBEI_HEIGHT:0;
  const idle=useMemo(()=>[{p:new THREE.Vector3(-.42,0,.15),yaw:Math.PI/2},{p:new THREE.Vector3(.42,0,.15),yaw:-Math.PI/2}],[]);
  const tmp=useMemo(()=>({q:new THREE.Quaternion(),e:new THREE.Euler()}),[]);
  useFrame((state,dt)=>{
    const t=state.clock.elapsedTime,c=clock.current,reduce=reducedMotion();
    if(c.running)c.t+=Math.min(dt,.05);
    blocks.forEach((ref,i)=>{
      const g=ref.current;if(!g)return;
      const side=i?1:-1,face=result?result.faces[i]!:'round';
      if(c.running&&c.animate){
        const k=c.t,apex=.55,land=c.resultAt>=0?Math.max(c.resultAt,apex+.25):Infinity;
        if(k<apex){const u=ease(k/apex);g.position.set(side*.4*u,.9+u*1.5,.2);}
        else if(k<land){g.position.set(side*.4,2.4+Math.sin((k-apex)*3)*.08,.2);}
        else{const u=Math.min((k-land)/.55,1),b=Math.abs(Math.sin(u*Math.PI*2.2))*(1-u)*.25;g.position.lerpVectors(new THREE.Vector3(side*.4,2.4,.2),rest[i]!.p,ease(u));g.position.y=Math.max(g.position.y,0)+restY(face)*ease(u)+b;
          tmp.e.set(FACE_UP[face].x,rest[i]!.yaw,0);tmp.q.setFromEuler(tmp.e);g.quaternion.slerp(tmp.q,ease(u));if(u>=1&&i===1)c.running=false;return;}
        if(!reduce){g.rotation.x=k*(9+i*2.5);g.rotation.y=k*(2-i);g.rotation.z=side*k*1.5;}
        return;
      }
      if(result){tmp.e.set(FACE_UP[face].x,rest[i]!.yaw,0);g.position.copy(rest[i]!.p);g.position.y+=restY(face);g.quaternion.setFromEuler(tmp.e);return;}
      if(phase==='charging'){
        // Closed together like a pair of palms: flat faces touching, gently breathing.
        g.position.set(0,.9+(reduce?0:Math.sin(t*2.4)*.05),.2);g.rotation.set(reduce?0:Math.sin(t*3)*.05,reduce?0:Math.sin(t*1.3)*.25,i?0:Math.PI);
        return;
      }
      g.position.copy(idle[i]!.p);g.rotation.set(0,idle[i]!.yaw,0);
    });
  });
  return <group position={[-.35,.0,.15]}>{blocks.map((ref,i)=><group key={i} ref={ref}>
    <Lazy><Model name="jiaobei" scale={JIAOBEI_SCALE}/></Lazy>
  </group>)}</group>;
}

/* ───────────── 梅花：先天八卦盘与梅枝 ───────────── */
const XIANTIAN=['乾','巽','坎','艮','坤','震','离','兑'] as const;// clockwise from the far side (south up)
const BITS:Record<string,number[]>={乾:[1,1,1],兑:[1,1,0],离:[1,0,1],震:[1,0,0],巽:[0,1,1],坎:[0,1,0],艮:[0,0,1],坤:[0,0,0]};
function plateMaps(){
  const N=1024,cx=N/2,cy=N/2,k=N/1024,random=seeded(5813);
  const inlay=(c:CanvasRenderingContext2D,fill:string,taiji?:{light:string;dark:string})=>{
    c.save();c.translate(cx,cy);c.scale(k,k);c.fillStyle=fill;c.strokeStyle=fill;
    [470,452,300,282,170].forEach((r,i)=>{c.lineWidth=i===0?9:3.5;c.beginPath();for(let j=0;j<=8;j++){const a=j*Math.PI/4+Math.PI/8;const x=r*Math.sin(a),y=-r*Math.cos(a);j?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();});
    XIANTIAN.forEach((name,j)=>{
      c.save();c.rotate(j*Math.PI/4);
      BITS[name]!.forEach((bit,l)=>{const y=-195-l*30;if(bit)c.fillRect(-62,y-9,124,18);else{c.fillRect(-62,y-9,52,18);c.fillRect(10,y-9,52,18);}});
      c.font='bold 62px "KaiTi","STKaiti","Kaiti SC",serif';c.textAlign='center';c.textBaseline='middle';c.fillText(name,0,-378);
      c.restore();
    });
    const r=112;
    if(taiji){c.fillStyle=taiji.light;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();
      c.fillStyle=taiji.dark;c.beginPath();c.arc(0,0,r,-Math.PI/2,Math.PI/2);c.arc(0,r/2,r/2,Math.PI/2,-Math.PI/2,true);c.arc(0,-r/2,r/2,Math.PI/2,-Math.PI/2,false);c.fill();
      c.beginPath();c.arc(0,-r/2,r/7,0,Math.PI*2);c.fill();c.fillStyle=taiji.light;c.beginPath();c.arc(0,r/2,r/7,0,Math.PI*2);c.fill();}
    else{c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();}
    c.restore();
  };
  const color=canvas(N,c=>{
    // Dark rosewood with radial lathe marks and long grain.
    const g=c.createRadialGradient(cx,cy,80,cx,cy,N*.55);g.addColorStop(0,'#4a2a19');g.addColorStop(1,'#2a160d');c.fillStyle=g;c.fillRect(0,0,N,N);
    for(let i=0;i<520;i++){const y=random()*N;c.strokeStyle=`rgba(${random()>.5?'110,62,34':'18,9,5'},${.05+random()*.12})`;c.lineWidth=.6+random()*2.4;c.beginPath();c.moveTo(0,y);for(let x=0;x<=N;x+=64)c.lineTo(x,y+Math.sin(x/170+i)*7+Math.sin(x/37+i*3)*1.5);c.stroke();}
    for(let i=0;i<40000;i++){c.fillStyle=`rgba(${random()>.5?'150,90,50':'10,5,2'},${random()*.05})`;c.fillRect(random()*N,random()*N,1+random()*2,1);}
    c.filter=`blur(${3*k}px)`;inlay(c,'rgba(8,4,2,.85)');c.filter='none';
    const gold=c.createLinearGradient(0,0,N,N);gold.addColorStop(0,'#e7c77d');gold.addColorStop(.5,'#c79a4c');gold.addColorStop(1,'#e2bd6e');
    inlay(c,gold as unknown as string,{light:'#efe2c4',dark:'#140a05'});
  });
  const height=canvas(N,c=>{
    c.fillStyle='#808080';c.fillRect(0,0,N,N);
    for(let i=0;i<300;i++){const y=random()*N;c.strokeStyle=`rgba(${random()>.5?150:100},${random()>.5?150:100},${random()>.5?150:100},.25)`;c.lineWidth=1;c.beginPath();c.moveTo(0,y);c.lineTo(N,y+Math.sin(i)*8);c.stroke();}
    c.filter=`blur(${4*k}px)`;inlay(c,'#303030');c.filter=`blur(${1.2*k}px)`;inlay(c,'#c8c8c8');c.filter='none';
  });
  const orm=canvas(N,c=>{
    c.fillStyle='rgb(255,140,0)';c.fillRect(0,0,N,N);
    inlay(c,'rgb(255,70,255)',{light:'rgb(255,60,0)',dark:'rgb(255,45,0)'});
  });
  const maps={map:colorTexture(color),normalMap:heightToNormal(height,2.4),orm:dataTexture(orm)};
  return {...maps,dispose(){Object.values(maps).forEach(t=>t.dispose());}};
}
let plateCache:ReturnType<typeof plateMaps>|null=null;
/** The plate's inlay maps take ~1M pixel ops; paint once per page and reuse in the chooser and on the desk. */
const sharedPlateMaps=()=>plateCache??=plateMaps();
function octagon(r:number){const s=new THREE.Shape();for(let k=0;k<8;k++){const a=k*Math.PI/4+Math.PI/8;const x=r*Math.sin(a),y=r*Math.cos(a);k?s.lineTo(x,y):s.moveTo(x,y);}s.closePath();return s;}
function PlumBranch(){
  const curve=useMemo(()=>new THREE.CatmullRomCurve3([[-.9,0,.15],[-.45,0,.02],[0,0,.1],[.35,0,-.12],[.75,0,-.05]].map(p=>new THREE.Vector3(...p as [number,number,number]))),[]);
  const twig=useMemo(()=>new THREE.CatmullRomCurve3([[.0,0,.1],[.18,0,.32],[.3,0,.4]].map(p=>new THREE.Vector3(...p as [number,number,number]))),[]);
  const blossoms:[number,number,number,number][]=[[-.55,.03,.02,.9],[-.1,.035,.11,1],[.42,.03,-.12,.85],[.3,.035,.4,1.05],[.76,.03,-.02,.7],[.12,.03,.24,.6]];
  return <group position={[1.45,.03,.75]} rotation={[0,.5,0]}>
    <mesh castShadow><tubeGeometry args={[curve,40,.026,8,false]}/><meshStandardMaterial color="#3b2a20" roughness={.9}/></mesh>
    <mesh castShadow><tubeGeometry args={[twig,16,.014,6,false]}/><meshStandardMaterial color="#3b2a20" roughness={.9}/></mesh>
    {blossoms.map(([x,y,z,s],i)=><group key={i} position={[x,y,z]} scale={s} rotation={[0,i,0]}>
      {Array.from({length:5},(_,p)=>{const a=p*Math.PI*2/5;return <mesh key={p} position={[Math.cos(a)*.055,0,Math.sin(a)*.055]} scale={[1,.35,1]}><sphereGeometry args={[.05,12,8]}/><meshStandardMaterial color="#f2d9dc" roughness={.65}/></mesh>;})}
      <mesh position={[0,.012,0]}><sphereGeometry args={[.025,10,8]}/><meshStandardMaterial color="#e2b54f" emissive="#6b4a10" emissiveIntensity={.2}/></mesh>
    </group>)}
  </group>;
}
function Meihua({phase,result}:Common&{result:MeihuaResult|null}){
  const maps=useMemo(sharedPlateMaps,[]);
  const base=useMemo(()=>new THREE.ExtrudeGeometry(octagon(1),{depth:.09,bevelEnabled:true,bevelSize:.03,bevelThickness:.025,bevelSegments:5}),[]);
  const rim=useMemo(()=>{const s=octagon(1.01);s.holes.push(octagon(.94) as unknown as THREE.Path);return new THREE.ExtrudeGeometry(s,{depth:.03,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:3});},[]);
  const top=useMemo(()=>new THREE.ShapeGeometry(octagon(.985)),[]);
  useMemo(()=>{const uv=top.getAttribute('uv'),p=top.getAttribute('position');for(let i=0;i<uv.count;i++)uv.setXY(i,(p.getX(i)+1)/2,(p.getY(i)+1)/2);},[top]);
  useEffect(()=>()=>{base.dispose();top.dispose();rim.dispose();},[base,top,rim]);
  const clock=useCastClock(phase,result);
  const glows=[useRef<THREE.MeshStandardMaterial>(null),useRef<THREE.MeshStandardMaterial>(null)];
  const bars=useRef<THREE.Group>(null);
  const upper=result?trigramOf(result.bits.slice(3,6)):null,lower=result?trigramOf(result.bits.slice(0,3)):null;
  const sector=(name:string|null)=>{const k=name?XIANTIAN.indexOf(name as typeof XIANTIAN[number]):0;return Math.PI/2-k*Math.PI/4-Math.PI/8;};
  useFrame((_,dt)=>{
    const c=clock.current;if(c.running)c.t+=Math.min(dt,.05);
    const k=c.running&&c.animate?(c.resultAt<0?-1:c.t-c.resultAt):99;
    glows.forEach((m,i)=>{if(m.current){const on=result?ease((k-.2-i*.6)/.4):0;m.current.opacity=on*.72;m.current.emissiveIntensity=.6+on*.8;}});
    bars.current?.children.forEach((bar,i)=>{const u=result?ease((k-1.4-i*.18)/.35):0;bar.visible=u>0;bar.position.y=.02+(1-u)*.35;bar.scale.setScalar(.6+.4*u);});
    if(k>4)c.running=false;
  });
  return <group position={[-.35,0,-.25]}>
    <group rotation={[-Math.PI/2,0,0]}>
      <mesh geometry={base} castShadow receiveShadow><meshPhysicalMaterial color="#3a1f12" roughness={.38} clearcoat={.7} clearcoatRoughness={.3}/></mesh>
      <mesh geometry={top} position={[0,0,.116]} receiveShadow><meshPhysicalMaterial map={maps.map} normalMap={maps.normalMap} roughnessMap={maps.orm} metalnessMap={maps.orm} roughness={1} metalness={1} clearcoat={.35} clearcoatRoughness={.35}/></mesh>
      <mesh geometry={rim} position={[0,0,.11]} castShadow receiveShadow><meshStandardMaterial color="#c49a52" metalness={.95} roughness={.32}/></mesh>
      {[upper,lower].map((name,i)=><mesh key={i} position={[0,0,.12]}><ringGeometry args={[.36,.97,32,1,sector(name),Math.PI/4]}/><meshStandardMaterial ref={glows[i]} color={i?'#f3d39a':'#f7c37a'} emissive={i?'#d79a4a':'#e4a050'} transparent opacity={0} depthWrite={false}/></mesh>)}
    </group>
    <group ref={bars} position={[0,0,1.95]}>{result?.bits.map((bit,i)=>{const moving=result.moving===i+1;const color=moving?'#b5402c':'#2b1a10';return <group key={i} position={[0,.02,-i*.15]} visible={false}>
      {bit?<mesh castShadow><boxGeometry args={[.9,.04,.08]}/><meshStandardMaterial color={color} roughness={.35}/></mesh>:<>{[-.27,.27].map(x=><mesh key={x} position={[x,0,0]} castShadow><boxGeometry args={[.36,.04,.08]}/><meshStandardMaterial color={color} roughness={.35}/></mesh>)}</>}
    </group>;})}</group>
    <PlumBranch/>
  </group>;
}
function trigramOf(bits:number[]){return Object.keys(BITS).find(n=>BITS[n]!.join('')===bits.join(''))!;}

/** Footprint of each resting tool in OracleTool space, used to place its HTML hit area and caption. */
const TOOL_BOUNDS:Record<Exclude<DivinationMethod,'liuyao'>,[[number,number,number],[number,number,number]]>={
  qiuqian:[[-.58,0,-.52],[.28,1.48,.32]],
  jiaobei:[[-1.1,0,-.6],[.4,.4,1.2]],
  meihua:[[-1.35,0,-1.25],[.65,.16,.75]],
};
/**
 * Keeps the HTML station (hit area + caption) glued to the tool on screen, whatever the camera does.
 * The station is centred with translate(-50%,-50%), so we write its centre and size.
 */
function useScreenAnchor(method:DivinationMethod,root:RefObject<THREE.Group|null>,anchor?:RefObject<HTMLElement|null>){
  const {camera,size}=useThree();
  const corners=useMemo(()=>Array.from({length:8},()=>new THREE.Vector3()),[]);
  useFrame(()=>{
    const el=anchor?.current,g=root.current;
    if(!el||!g||method==='liuyao')return;
    const [lo,hi]=TOOL_BOUNDS[method];let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    corners.forEach((p,i)=>{
      p.set(i&1?hi[0]:lo[0],i&2?hi[1]:lo[1],i&4?hi[2]:lo[2]).applyMatrix4(g.matrixWorld).project(camera);
      const x=(p.x+1)*size.width/2,y=(1-p.y)*size.height/2;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
    });
    Object.assign(el.style,{left:`${(minX+maxX)/2}px`,top:`${(minY+maxY)/2}px`,width:`${maxX-minX}px`,height:`${maxY-minY}px`});
  });
}
export function OracleTool({method,phase,motion,result,anchor}:{method:DivinationMethod;phase:OraclePhase;motion:RefObject<OracleMotion>;result?:OracleResult|null;anchor?:RefObject<HTMLElement|null>}){
  const root=useRef<THREE.Group>(null);
  useScreenAnchor(method,root,anchor);
  return <group ref={root}>
    {method==='qiuqian'&&<Lazy><Qiuqian phase={phase} motion={motion} result={result?.method==='qiuqian'?result:null}/></Lazy>}
    {method==='jiaobei'&&<Jiaobei phase={phase} motion={motion} result={result?.method==='jiaobei'?result:null}/>}
    {method==='meihua'&&<Meihua phase={phase} motion={motion} result={result?.method==='meihua'?result:null}/>}
  </group>;
}
