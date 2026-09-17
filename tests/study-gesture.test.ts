import { describe, expect, it } from "vitest";
import { beginGesture, canRelease, createEjection, tryEject, regripGesture, gestureProgress, moveGesture } from "../apps/web/src/study/gesture.js";

describe("user-controlled turtle-shell casting", () => {
  it("does not throw coins on a click, stationary hold, or one-way drag", () => {
    const g = beginGesture(1, 0, 0, 0);
    expect(canRelease(g, 2000)).toBe(false);
    for (let x = 10; x < 400; x += 10) moveGesture(g, 1, x, 0);
    expect(canRelease(g, 3000)).toBe(false);
  });
  it("requires back-and-forth motion and enough elapsed time", () => {
    const g = beginGesture(1, 0, 0, 0);
    for (const x of [85,-85,85,-85]) moveGesture(g, 1, x, 0);
    expect(gestureProgress(g)).toBe(1);
    expect(canRelease(g, 200)).toBe(false);
    expect(canRelease(g, 700)).toBe(true);
    g.held = false;
    expect(canRelease(g, 800)).toBe(false);
  });
  it("ignores jitter and another finger, and supports vertical shakes", () => {
    const g = beginGesture(7, 0, 0, 0);
    for (const x of [85,-85,85,-85]) moveGesture(g, 8, x, 0);
    for (const x of [1,-1,2,-2]) moveGesture(g, 7, x, 0);
    expect(g.travel).toBe(0);
    for (const y of [85,-85,85,-85]) moveGesture(g, 7, 0, y);
    expect(canRelease(g, 700)).toBe(true);
  });
});

describe("timed coin ejection",()=>{
  it("keeps randomized deadlines inside 1.5 to 4 seconds with a visible gap",()=>{
    for(const sample of [0,.5,1]){
      const e=createEjection(()=>sample);
      expect(e.deadlines[0]).toBeGreaterThanOrEqual(1500);
      expect(e.deadlines[2]).toBeLessThanOrEqual(4000);
      expect(e.deadlines[1]-e.deadlines[0]).toBeGreaterThanOrEqual(250);
    }
  });
  it("never ejects early and finishes by four seconds of continuous shaking",()=>{
    for(const sample of [0,1]){
      const g=beginGesture(1,0,0,0),e=createEjection(()=>sample);e.lastTime=0;
      for(let t=100;t<=4000;t+=100){
        moveGesture(g,1,t%200?85:-85,0);tryEject(g,e,t);
        if(t<1500)expect(e.emitted).toBe(0);
      }
      expect(e.emitted).toBe(3);
    }
  });
  it("does not count stationary holds, release gaps or idle pointer events",()=>{
    let g=beginGesture(1,0,0,0);const e=createEjection(()=>0);e.lastTime=0;
    for(let t=100;t<=500;t+=100){moveGesture(g,1,t%200?85:-85,0);tryEject(g,e,t);}
    expect(e.activeMs).toBe(500);
    tryEject(g,e,10000);expect(e.activeMs).toBe(500);
    g.held=false;e.lastTime=null;expect(tryEject(g,e,11000)).toBe(false);
    g=regripGesture(g,2,0,0,12000);e.lastTime=12000;
    moveGesture(g,2,85,0);tryEject(g,e,12100);expect(e.activeMs).toBe(600);
    moveGesture(g,2,-85,0);tryEject(g,e,20000);expect(e.activeMs).toBe(600);
  });
});
