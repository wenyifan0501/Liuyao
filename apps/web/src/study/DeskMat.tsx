import {useEffect,useMemo} from 'react';
import {useLoader} from '@react-three/fiber';
import * as THREE from 'three';
import brocadeUrl from './assets/mat-brocade.webp';
import {heightToNormal} from './surfaceMaps';

/** Square indigo silk brocade mat with a silver cloud-scroll border (texture: logs/reference, AI-woven). */
export const MAT={size:4.9,thickness:.014,x:-.1,z:.8,yaw:-.06};
let normalCache:THREE.Texture|null=null;
/** Woven relief from the pattern's luminance, built once: the silver threads stand slightly proud. */
function brocadeNormal(image:HTMLImageElement|ImageBitmap){
  if(normalCache)return normalCache;
  const size=512,c=document.createElement('canvas');c.width=c.height=size;
  c.getContext('2d')!.drawImage(image as CanvasImageSource,0,0,size,size);
  normalCache=heightToNormal(c,1.6);return normalCache;
}
export function DeskMat(){
  const source=useLoader(THREE.TextureLoader,brocadeUrl);
  const map=useMemo(()=>{const t=source.clone();t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.needsUpdate=true;return t;},[source]);
  const normal=useMemo(()=>brocadeNormal(source.image as HTMLImageElement),[source]);
  useEffect(()=>()=>map.dispose(),[map]);
  const {size,thickness}=MAT;
  return <group position={[MAT.x,-.02,MAT.z]} rotation={[0,MAT.yaw,0]}>
    <mesh position={[0,thickness/2,0]} castShadow receiveShadow><boxGeometry args={[size,thickness,size]}/><meshStandardMaterial color="#1c2440" roughness={.85}/></mesh>
    <mesh position={[0,thickness+.0006,0]} rotation={[-Math.PI/2,0,0]} receiveShadow>
      <planeGeometry args={[size,size]}/>
      <meshPhysicalMaterial map={map} color="#a9aec4" normalMap={normal} normalScale={new THREE.Vector2(.35,.35)} roughness={.7} sheen={.5} sheenRoughness={.5} sheenColor="#8f9bc4"/>
    </mesh>
  </group>;
}
