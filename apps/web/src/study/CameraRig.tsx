import { useEffect, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type DeskView = 'intro' | 'overview' | 'writing' | 'casting';
export type CameraMemory = { position: THREE.Vector3; target: THREE.Vector3 } | null;
export function CameraRig({ view, memory, paper, shell, onMoving }: {
  view: DeskView; memory: RefObject<CameraMemory>; paper: RefObject<HTMLElement | null>;
  shell: RefObject<HTMLButtonElement | null>; onMoving: (moving: boolean) => void;
}) {
  const { camera, size } = useThree();
  const target = useRef(new THREE.Vector3(0, 0, 0));
  const moving = useRef(true);
  const [reduce, setReduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduce(query.matches);
    query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (memory.current) { camera.position.copy(memory.current.position); target.current.copy(memory.current.target); }
  }, [camera, memory]);
  useEffect(() => { moving.current = true; onMoving(true); }, [view, size.width, size.height, reduce]);
  useFrame((_, dt) => {
    const mobile = size.width < 700;
    const position = mobile
      ? view === 'writing' ? [0, 9.8, 9] : view === 'casting' ? [-.4, 9, 9] : [0, 12.5, 11.8]
      : view === 'writing' ? [.8, 7.2, 8.4] : view === 'casting' ? [-.5, 6.8, 7.8] : [0, 8.5, 9.6];
    const aim = mobile ? [0, 0, view === 'writing' ? 1.8 : view === 'casting' ? .8 : -1.2] : [view === 'casting' ? -.4 : .2, 0, view === 'casting' ? .7 : 0];
    const p = new THREE.Vector3(...position), t = new THREE.Vector3(...aim);
    const amount = reduce ? 1 : 1 - Math.exp(-7 * Math.min(dt, .05));
    camera.position.lerp(p, amount); target.current.lerp(t, amount); camera.lookAt(target.current);
    if (moving.current && camera.position.distanceTo(p) + target.current.distanceTo(t) < .035) { moving.current = false; onMoving(false); }
    memory.current = { position: camera.position.clone(), target: target.current.clone() };

  });
  return null;
}
