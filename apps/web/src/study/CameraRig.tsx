import { useEffect, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MethodTrack } from './MethodCarousel';

export type DeskView = 'intro' | 'overview' | 'writing' | 'casting' | 'choosing';
export type CameraMemory = { position: THREE.Vector3; target: THREE.Vector3 } | null;
export function CameraRig({ view, memory, paper, shell, onMoving, track }: {
  view: DeskView; memory: RefObject<CameraMemory>; paper: RefObject<HTMLElement | null>;
  shell: RefObject<HTMLButtonElement | null>; onMoving: (moving: boolean) => void; track?: RefObject<MethodTrack>;
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
      ? view === 'writing' ? [0, 9.8, 9] : view === 'casting' || view === 'choosing' ? [-.4, 9, 9] : [0, 12.5, 11.8]
      // Close enough that the table fills the frame (front edge just in view), as in reference 1.
      : view === 'writing' ? [.8, 6.6, 7.6] : view === 'casting' ? [-.5, 6.2, 7.0] : view === 'choosing' ? [-.45, 5.2, 6.6] : [0, 7.4, 7.9];
    const aim = mobile ? [0, 0, view === 'writing' ? 1.8 : view === 'casting' || view === 'choosing' ? .8 : -1.2]
      : view === 'choosing' ? [-.45, .2, .1] : [view === 'casting' ? -.4 : .1, 0, view === 'casting' ? .7 : .1];
    const p = new THREE.Vector3(...position), t = new THREE.Vector3(...aim);
    if (view === 'choosing' && track && !reduce) {
      // The camera leads the swipe a little, pulls back while the row is moving and eases in when it settles.
      const v = THREE.MathUtils.clamp(track.current.velocity, -7, 7), speed = Math.abs(v);
      p.x += v * .16; p.y += speed * .07; p.z += speed * .12; t.x += v * .07;
    }
    const amount = reduce ? 1 : 1 - Math.exp(-7 * Math.min(dt, .05));
    camera.position.lerp(p, amount); target.current.lerp(t, amount); camera.lookAt(target.current);
    if (moving.current && camera.position.distanceTo(p) + target.current.distanceTo(t) < .035) { moving.current = false; onMoving(false); }
    memory.current = { position: camera.position.clone(), target: target.current.clone() };

  });
  return null;
}
