import type { CSSProperties } from 'react';

/** Deterministic, staggered motes; decorative and never intercept pointer input. */
export function GatheringLight() {
  return <span className="gathering-light" aria-hidden="true">{Array.from({length:18}, (_,i) => {
    const angle = i * Math.PI * 2 / 18;
    return <i key={i} style={{
      left:`${50 + Math.cos(angle)*52}%`, top:`${50 + Math.sin(angle)*52}%`,
      '--drift-x':`${Math.cos(angle)*38}px`, '--drift-y':`${Math.sin(angle)*38}px`,
      '--gather-delay':`${-i*.71}s`, '--gather-duration':`${3.8+(i%5)*.37}s`,
      width: i%3 === 0 ? '3px' : '2px', height:i%3 === 0 ? '3px' : '2px',
    } as CSSProperties}/>;
  })}</span>;
}
