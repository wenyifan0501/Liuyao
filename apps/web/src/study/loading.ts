import * as THREE from 'three';

/**
 * Global asset progress. Every loader the study uses (GLTFLoader, TextureLoader, and the image
 * loaders a GLB uses internally) reports to THREE.DefaultLoadingManager; we mirror it into a tiny
 * store the loading screen can subscribe to. Imported before any preload starts.
 */
type Progress={loaded:number;total:number};
let state:Progress={loaded:0,total:0};
const listeners=new Set<()=>void>();
const set=(loaded:number,total:number)=>{state={loaded,total};listeners.forEach(l=>l());};
const manager=THREE.DefaultLoadingManager;
manager.onStart=(_url,loaded,total)=>set(loaded,total);
manager.onProgress=(_url,loaded,total)=>set(loaded,total);
manager.onLoad=()=>set(state.total,state.total);
manager.onError=()=>set(state.loaded+1,Math.max(state.total,state.loaded+1));

export const loadingProgress={
  subscribe(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};},
  get:()=>state,
};
