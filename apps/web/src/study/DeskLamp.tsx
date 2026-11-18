import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import {Model,type Tune} from './models';

/** Blender lamp (scripts/blender/lamp.py): bulb at y=1.31, shade centre at y≈1.48 in model units. */
const SCALE=1.05,BULB_Y=1.31*SCALE,SHADE_Y=1.48*SCALE;
const tune:Tune=(m,mesh)=>{
  if(m.name==='lamp_paper'){m.emissive.set('#ffa955');m.emissiveIntensity=.95;m.color.set('#f3d9b0');}
  if(m.name==='lamp_bulb')m.emissiveIntensity=4;
  // Only the body keeps shadows from the bulb; thin posts and spokes would rake long lines across the desk.
  if(mesh.name!=='lamp_body')m.userData.noShadow=true;
};
export function DeskLamp({position=[-1.55,0,-3.15] as [number,number,number]}){
  const glow=useMemo(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
    const c=canvas.getContext('2d')!,g=c.createRadialGradient(128,128,0,128,128,128);
    g.addColorStop(0,'rgba(255,214,150,.55)');g.addColorStop(.35,'rgba(255,176,90,.18)');g.addColorStop(1,'rgba(255,150,60,0)');
    c.fillStyle=g;c.fillRect(0,0,256,256);
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
  },[]);
  useEffect(()=>()=>glow.dispose(),[glow]);
  return <group position={position} rotation={[0,.12,0]}>
    <Model name="desk_lamp" scale={SCALE} tune={tune}/>
    <sprite position={[0,SHADE_Y,0]} scale={[3.2,3.2,1]}><spriteMaterial map={glow} transparent opacity={.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false}/></sprite>
    {/* Paper panels do not cast shadows, so light spills through the shade; the frame and column do. */}
    <pointLight position={[0,BULB_Y,0]} intensity={42} distance={16} decay={1.8} color="#ffc78a" castShadow shadow-mapSize={[1024,1024]} shadow-bias={-.002} shadow-normalBias={.03} shadow-radius={4}/>
  </group>;
}
