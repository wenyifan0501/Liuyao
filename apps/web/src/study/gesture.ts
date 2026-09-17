export interface ShakeGesture {
  held: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  x: number;
  y: number;
  direction: number;
  reversals: number;
  travel: number;
  startedAt: number;
}
export const emptyGesture = (): ShakeGesture => ({ held: false, pointerId: -1, startX: 0, startY: 0, lastX: 0, lastY: 0, x: 0, y: 0, direction: 0, reversals: 0, travel: 0, startedAt: 0 });
export function beginGesture(pointerId: number, x: number, y: number, now: number): ShakeGesture {
  return { ...emptyGesture(), held: true, pointerId, startX: x, startY: y, lastX: x, lastY: y, startedAt: now };
}
export function moveGesture(g: ShakeGesture, pointerId: number, x: number, y: number) {
  if (!g.held || g.pointerId !== pointerId) return;
  const dx = x - g.lastX, dy = y - g.lastY;
  // Ignore sub-pixel jitter; deliberately require changes of direction.
  if (Math.hypot(dx, dy) < 6) return;
  const dominant = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
  const direction = Math.sign(dominant);
  if (g.direction && direction !== g.direction) g.reversals++;
  g.direction = direction;
  g.travel += Math.min(Math.hypot(dx, dy), 90);
  g.lastX = x; g.lastY = y;
  g.x = Math.max(-1, Math.min(1, (x - g.startX) / 110));
  g.y = Math.max(-1, Math.min(1, (y - g.startY) / 90));
}
export function gestureProgress(g: ShakeGesture) { return Math.min(1, g.travel / 220, g.reversals / 2); }
export function canRelease(g: ShakeGesture, now: number) { return g.held && gestureProgress(g) === 1 && now - g.startedAt >= 350; }

/** Regripping preserves the accumulated shake; release itself never ejects. */
export function regripGesture(g: ShakeGesture, pointerId: number, x: number, y: number, now: number): ShakeGesture {
  return {...beginGesture(pointerId,x,y,now),travel:g.travel,reversals:g.reversals,direction:g.direction,startedAt:g.startedAt || now};
}
export interface EjectionState { emitted: number; deadlines: [number,number,number]; activeMs: number; lastTime: number | null; lastTravel: number }
export function createEjection(random = Math.random): EjectionState {
  const deadlines=Array.from({length:3},()=>1500+random()*2000).sort((a,b)=>a-b).map((t,i)=>t+i*250) as [number,number,number];
  return {emitted:0,deadlines,activeMs:0,lastTime:null,lastTravel:0};
}
/** Each coin escapes between 1.5 and 4 seconds of active shaking, with spaced random deadlines. */
export function tryEject(g: ShakeGesture, state: EjectionState, now: number) {
  if(!g.held || state.emitted>=3 || g.travel<=state.lastTravel)return false;
  const delta=state.lastTime===null?0:now-state.lastTime;
  // Long gaps are pauses, not accumulated shaking; stationary pointer events do not count.
  if(delta>0 && delta<=300)state.activeMs+=delta;
  state.lastTime=now;state.lastTravel=g.travel;
  if(g.reversals<1 || state.activeMs<(state.deadlines[state.emitted] ?? Infinity))return false;
  state.emitted++;return true;
}
