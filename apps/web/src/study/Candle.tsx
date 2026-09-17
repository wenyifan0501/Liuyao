import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';

export function Candle(){
  const flame=useRef<THREE.Group>(null),light=useRef<THREE.PointLight>(null),halo=useRef<THREE.Sprite>(null);
  const reduced=useMemo(()=>matchMedia('(prefers-reduced-motion: reduce)'),[]);
  const glow=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
    const c=canvas.getContext('2d')!,gradient=c.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(255,221,146,.6)');gradient.addColorStop(.2,'rgba(255,178,73,.2)');gradient.addColorStop(1,'rgba(255,140,40,0)');
    c.fillStyle=gradient;c.fillRect(0,0,128,128);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  },[]);
  const profile=useMemo(()=>[[0,0],[.038,.025],[.047,.07],[.034,.13],[.017,.2],[0,.29]].map(([x,y])=>new THREE.Vector2(x,y)),[]);
  const holder=useMemo(()=>[[0,0],[.3,0],[.32,.035],[.29,.075],[.15,.09],[.07,.14],[.065,.32],[.16,.36],[.26,.39],[.27,.43],[.24,.435],[.17,.39],[0,.38]].map(([x,y])=>new THREE.Vector2(x,y)),[]);
  useEffect(()=>()=>glow.dispose(),[glow]);
  useFrame(({clock})=>{
    const t=clock.elapsedTime;
    const sway=reduced.matches?0:Math.sin(t*1.7)*.065+Math.sin(t*3.1)*.026;
    const breath=reduced.matches?0:Math.sin(t*2.3)*.045+Math.sin(t*4.7)*.018;
    if(flame.current){flame.current.rotation.z=sway;flame.current.rotation.x=sway*.6;flame.current.scale.y=1+breath;}
    if(light.current){light.current.intensity=17*(1+breath);light.current.position.x=sway*.12;}
    if(halo.current)halo.current.material.opacity=.7+breath;
  });
  return <group position={[-1.55,.015,-3.15]}>
    <mesh castShadow receiveShadow><latheGeometry args={[holder,48]}/><meshStandardMaterial color="#796039" metalness={.72} roughness={.48}/></mesh>
    <mesh position={[0,.67,0]} castShadow><cylinderGeometry args={[.115,.13,.57,40]}/><meshStandardMaterial color="#ded0a5" roughness={.83}/></mesh>
    <mesh position={[0,.958,0]} rotation={[-Math.PI/2,0,0]}><torusGeometry args={[.086,.025,10,40]}/><meshStandardMaterial color="#e8d9ad" roughness={.65}/></mesh>
    {[0,.9,2.4,4.1,5.3].map((a,i)=><mesh key={a} position={[Math.cos(a)*.115,.86-i%3*.07,Math.sin(a)*.115]} scale={[.022,.07+i%3*.025,.021]}><sphereGeometry args={[1,12,16]}/><meshStandardMaterial color="#e5d7b0" roughness={.8}/></mesh>)}
    <mesh position={[0,.984,0]}><cylinderGeometry args={[.008,.01,.067,8]}/><meshStandardMaterial color="#32251a"/></mesh>
    <group ref={flame} position={[0,1,0]}>
      <mesh><latheGeometry args={[profile,24]}/><meshBasicMaterial color="#ffb343" toneMapped={false}/></mesh>
      <mesh scale={[.62,.7,.62]} position={[0,0,.014]}><latheGeometry args={[profile,24]}/><meshBasicMaterial color="#fff2c4" toneMapped={false}/></mesh>
    </group>
    <sprite ref={halo} position={[0,1.12,0]} scale={[.95,.95,1]}><spriteMaterial map={glow} transparent opacity={.7} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false}/></sprite>
    <pointLight ref={light} position={[0,1.12,0]} intensity={17} distance={10} decay={2} color="#ffd19a"/>
  </group>;
}
