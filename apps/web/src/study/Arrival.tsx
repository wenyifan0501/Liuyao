import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function Arrival({ active, onArrival, children }: {active: boolean; onArrival: (ready: boolean) => void; children: ReactNode}) {
  const group=useRef<THREE.Group>(null), elapsed=useRef(0), start=useRef(-18), running=useRef(true);
  const reduced=useMemo(()=>matchMedia('(prefers-reduced-motion: reduce)'),[]);
  useEffect(()=>{elapsed.current=0;start.current=group.current?.position.x ?? -18;running.current=true;onArrival(false);},[active]);
  useFrame((_,dt)=>{
    if (!group.current || !running.current) return;
    elapsed.current+=Math.min(dt,.05);
    const t=reduced.matches ? 1 : THREE.MathUtils.clamp((elapsed.current-(active ? .55 : 0))/1.05,0,1);
    // A restrained overshoot gives the tray weight without oscillating forever.
    const u=t-1, ease=active ? 1+1.32*u*u*u+.32*u*u : 1-(1-t)**3;
    group.current.position.x=THREE.MathUtils.lerp(start.current,active ? 0 : -18,ease);
    group.current.visible=active || t<1;
    if(t===1){running.current=false;onArrival(active);}
  });
  return <group ref={group} position={[-18,0,0]} visible={false}>{children}</group>;
}
