export interface CoinState { up: number; speed: number }
/** Height is irrelevant: a flat, stable stack is a valid result. */
export function settledCoinValue(states: readonly CoinState[]): number | null {
  if(states.length!==3 || states.some(s=>!Number.isFinite(s.up) || !Number.isFinite(s.speed) || s.speed>.16 || Math.abs(s.up)<.86)) return null;
  return states.reduce((sum,s)=>sum+(s.up>0?3:2),0);
}

export const COIN_CONTACT_DAMPING = { linear: 4, angular: 7 };
export function contactDecay(up: number, speed: number, dt: number) {
  return Math.abs(up)>.8 && speed<1.2 ? Math.exp(-8*dt) : 1;
}

export const COIN_SETTLE_LIMIT_MS = 3000;
/** Deadline uses the current face orientation, even if the coin is still moving or tilted. */
export function coinValueAtDeadline(states: readonly CoinState[]): number | null {
  if(states.length!==3 || states.some(s=>!Number.isFinite(s.up)))return null;
  return states.reduce((sum,s)=>sum+(s.up>0?3:2),0);
}
