import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {objectSurface} from './objectSurfaces';

function SoftBox({size,position,color,map,roughness=.8,surface}:{surface?:ReturnType<typeof objectSurface>;size:[number,number,number];position?:[number,number,number];color:string;map?:THREE.Texture;roughness?:number}){
  const geometry=useMemo(()=>new RoundedBoxGeometry(...size,3,Math.min(...size)*.18),[...size]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry} position={position} castShadow receiveShadow><meshStandardMaterial color={color} map={map} {...(surface?{map:surface.map,bumpMap:surface.bumpMap,roughnessMap:surface.roughnessMap,bumpScale:.008}:{})} roughness={roughness}/></mesh>;
}
function bookLabel(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=512;const c=canvas.getContext('2d')!;
  c.fillStyle='#c9b894';c.fillRect(0,0,128,512);c.strokeStyle='#7d6e512e';c.strokeRect(12,12,104,488);
  c.fillStyle='#443d30';c.textAlign='center';c.font='48px KaiTi, STKaiti, serif';['周','易','集','解'].forEach((text,i)=>c.fillText(text,64,110+i*85));
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
}
export function DeskObjects(_props:{wood:THREE.Texture}){
  const assets=useMemo(()=>({stone:objectSurface('slate'),cloth:objectSurface('linen'),paper:objectSurface('paper'),bamboo:objectSurface('bamboo'),seal:objectSurface('soapstone'),glaze:objectSurface('glaze'),label:bookLabel()}),[]);
  useEffect(()=>()=>{Object.values(assets).forEach(asset=>asset.dispose());},[assets]);
  const cup=useMemo(()=>[[.21,0],[.24,.025],[.23,.07],[.28,.12],[.37,.3],[.43,.49],[.44,.53],[.415,.535],[.4,.49],[.34,.28],[.26,.12],[.21,.105]].map(([x,y])=>new THREE.Vector2(x,y)),[]);
  const inkRim=useMemo(()=>{
    const shape=new THREE.Shape();const w=.63,h=.9,r=.13;
    shape.moveTo(-w+r,-h);shape.lineTo(w-r,-h);shape.quadraticCurveTo(w,-h,w,-h+r);
    shape.lineTo(w,h-r);shape.quadraticCurveTo(w,h,w-r,h);shape.lineTo(-w+r,h);
    shape.quadraticCurveTo(-w,h,-w,h-r);shape.lineTo(-w,-h+r);shape.quadraticCurveTo(-w,-h,-w+r,-h);
    const hole=new THREE.Path();hole.absellipse(0,-.31,.46,.63,0,Math.PI*2,true);shape.holes.push(hole);
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:.095,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.018,bevelThickness:.018,curveSegments:48});
    const uv=geometry.getAttribute('uv'),positions=geometry.getAttribute('position');
    for(let i=0;i<uv.count;i++)uv.setXY(i,(positions.getX(i)+.65)/1.3,(positions.getY(i)+.92)/1.84);
    return geometry;
  },[]);
  const saucer=useMemo(()=>[[0,.012],[.22,.012],[.35,.02],[.5,.065],[.61,.08],[.62,.063],[.54,.033],[.35,-.012],[.23,-.018],[0,-.018]].map(([x,y])=>new THREE.Vector2(x,y)),[]);
  const bristles=useMemo(()=>[[0,-.14],[.042,-.14],[.054,-.095],[.043,-.03],[.026,.05],[.005,.135],[0,.15]].map(([x,y])=>new THREE.Vector2(x,y)),[]);
  const hairLines=useMemo(()=>{
    const points:number[]=[];
    for(let i=0;i<36;i++){const a=i/36*Math.PI*2;
      for(let j=0;j<6;j++){for(const t of [j/6,(j+1)/6]){const r=.051*Math.pow(1-t,.8);points.push(Math.cos(a)*r,Math.sin(a)*r,.86+t*.27);}}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));return g;
  },[]);
  useEffect(()=>()=>{inkRim.dispose();hairLines.dispose();},[inkRim,hairLines]);
  return <>
    <group position={[-2.8,.025,-2.8]} rotation={[0,-.12,0]}>
      {[0,1].map(i=><group key={i} position={[i*.05,i*.18,0]} rotation={[0,i*.075,0]}>
        <SoftBox size={[1.45,.12,1.94]} position={[0,.075,0]} color="#ffffff" surface={assets.paper}/>
        {[-1,1].map(side=><mesh key={side} position={[0,.075+side*.071,0]} castShadow><boxGeometry args={[1.51,.022,2.02]}/><meshStandardMaterial color={i?'#7c968d':'#ada78e'} map={assets.cloth.map} bumpMap={assets.cloth.bumpMap} bumpScale={.008} roughnessMap={assets.cloth.roughnessMap} roughness={1}/></mesh>)}
        {Array.from({length:9},(_,j)=><mesh key={j} position={[.729,.027+j*.011,0]}><boxGeometry args={[.003,.0025,1.87]}/><meshStandardMaterial color="#8c7b5b"/></mesh>)}
        {[-.7,-.25,.25,.7].map(z=><mesh key={z} position={[-.65,.08,z]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.077,.009,5,12]}/><meshStandardMaterial color="#c6b78f" roughness={1}/></mesh>)}
      </group>)}
      <mesh position={[.44,.349,-.17]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.28,1.18]}/><meshStandardMaterial map={assets.label} roughness={1}/></mesh>
    </group>
    <group position={[-3.05,.018,-.8]}>
      <mesh receiveShadow castShadow><latheGeometry args={[saucer,64]}/><meshPhysicalMaterial map={assets.glaze.map} bumpMap={assets.glaze.bumpMap} bumpScale={.004} roughnessMap={assets.glaze.roughnessMap} color="#ffffff" roughness={.3} clearcoat={.45}/></mesh>
      <mesh position={[0,.025,0]} castShadow><latheGeometry args={[cup,64]}/><meshPhysicalMaterial map={assets.glaze.map} bumpMap={assets.glaze.bumpMap} bumpScale={.004} roughnessMap={assets.glaze.roughnessMap} roughness={.27} clearcoat={.65} clearcoatRoughness={.22} side={THREE.DoubleSide}/></mesh>
      <mesh position={[0,.554,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.426,.012,8,64]}/><meshStandardMaterial color="#b8b394" roughness={.45}/></mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,.435,0]}><circleGeometry args={[.386,64]}/><meshPhysicalMaterial color="#37270f" roughness={.16} clearcoat={1}/></mesh>
    </group>
    <group position={[2.95,.025,-2.45]} rotation={[0,-.12,0]}>
      <SoftBox size={[1.3,.09,1.85]} position={[0,-.025,0]} color="#b0b6ae" surface={assets.stone}/><mesh geometry={inkRim} rotation={[-Math.PI/2,0,0]} position={[0,.02,0]} castShadow receiveShadow><meshStandardMaterial map={assets.stone.map} bumpMap={assets.stone.bumpMap} bumpScale={.012} roughnessMap={assets.stone.roughnessMap} roughness={.95}/></mesh>
      <mesh position={[0,.037,.31]} rotation={[-Math.PI/2,0,0]} scale={[1,1.36,1]}><circleGeometry args={[.445,64]}/><meshPhysicalMaterial color="#111a17" roughness={.19} clearcoat={.8}/></mesh>
      <group position={[0,.14,-.55]} rotation={[0,.17,0]}><SoftBox size={[.19,.09,.63]} color="#62635b" surface={assets.stone} roughness={.9}/><mesh position={[0,.047,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.035,.36]}/><meshStandardMaterial color="#a88c50"/></mesh></group>
      <group position={[-.91,.06,-.05]} rotation={[0,.14,0]}>
        <SoftBox size={[.48,.12,.22]} position={[0,0,-.65]} color="#ffffff" surface={assets.glaze} roughness={.6}/>
        <mesh castShadow rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.037,.051,1.7,20]}/><meshStandardMaterial map={assets.bamboo.map} bumpMap={assets.bamboo.bumpMap} bumpScale={.003} roughnessMap={assets.bamboo.roughnessMap} roughness={.9}/></mesh>
        {[-.68,-.61,.58,.65].map(z=><mesh key={z} position={[0,0,z]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.045,.006,6,20]}/><meshStandardMaterial color="#735834"/></mesh>)}
        <mesh position={[0,0,.99]} rotation={[-Math.PI/2,0,0]} castShadow><latheGeometry args={[bristles,32]}/><meshStandardMaterial color="#c0b69d" roughness={.95}/></mesh>
        <mesh position={[0,0,1.09]} rotation={[-Math.PI/2,0,0]}><coneGeometry args={[.023,.105,24]}/><meshStandardMaterial color="#36362c" roughness={.9}/></mesh>
        <lineSegments geometry={hairLines}><lineBasicMaterial color="#756a51" transparent opacity={.5}/></lineSegments>
      </group>
      <group position={[.95,.075,-.6]}>
        <SoftBox size={[.29,.2,.29]} color="#ffffff" surface={assets.seal} roughness={.85}/>
        <SoftBox size={[.305,.035,.305]} position={[0,-.079,0]} color="#a99983" surface={assets.seal}/>
        <mesh position={[0,.16,0]} castShadow><torusGeometry args={[.079,.038,12,32]}/><meshStandardMaterial map={assets.seal.map} bumpMap={assets.seal.bumpMap} bumpScale={.005} roughnessMap={assets.seal.roughnessMap} roughness={.8}/></mesh>
      </group>
    </group>
  </>;
}
