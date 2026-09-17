import {describe,expect,it} from 'vitest';
import {settledCoinValue,coinValueAtDeadline,COIN_SETTLE_LIMIT_MS} from '../apps/web/src/study/coinSettlement.js';
describe('physical coin settlement',()=>{
  it('accepts a stable stack regardless of its height',()=>{
    const stack=[{up:1,speed:0,y:.01},{up:-.97,speed:.05,y:.04},{up:.94,speed:.09,y:.07}];
    expect(settledCoinValue(stack)).toBe(8);
  });
  it('waits for all three faces and does not decide a standing coin',()=>{
    expect(settledCoinValue([{up:1,speed:0},{up:-1,speed:0}])).toBe(null);
    expect(settledCoinValue([{up:1,speed:0},{up:-1,speed:0},{up:.2,speed:0}])).toBe(null);
    expect(settledCoinValue([{up:1,speed:0},{up:-1,speed:0},{up:1,speed:.5}])).toBe(null);
  });
});

it('caps waiting at three seconds and resolves moving stacked coins by current face',()=>{
  expect(COIN_SETTLE_LIMIT_MS).toBe(3000);
  const moving=[{up:.2,speed:4},{up:-.15,speed:2},{up:.8,speed:1}];
  expect(settledCoinValue(moving)).toBe(null);
  expect(coinValueAtDeadline(moving)).toBe(8);
  expect(coinValueAtDeadline(moving.slice(0,2))).toBe(null);
});
