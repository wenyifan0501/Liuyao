import * as THREE from 'three';

type SurfaceKind='slate'|'linen'|'paper'|'bamboo'|'soapstone'|'glaze';
/** Seeded, original material maps: pigment, micro-relief and wear share the same grain. */
export function objectSurface(kind:SurfaceKind){
  const size=512;
  const canvases=Array.from({length:3},()=>{const c=document.createElement('canvas');c.width=c.height=size;return c;});
  const contexts=canvases.map(c=>c.getContext('2d')!);
  const data=contexts.map(c=>c.createImageData(size,size));
  const palette:Record<SurfaceKind,number[]>={slate:[69,73,64],linen:[112,120,98],paper:[193,176,140],bamboo:[175,138,78],soapstone:[147,103,76],glaze:[157,179,162]};
  let seed=8731;const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const noise=random()-.5;
    const cloud=Math.sin(x*.031+Math.sin(y*.019)*2)*Math.sin(y*.024+x*.006);
    const vein=Math.exp(-Math.abs(Math.sin(x*.026+y*.015+Math.sin(y*.035)*.7))*32);
    const weave=(x%4===0?1:-.25)+(y%4===0?1:-.25);
    const edge=Math.max(0,1-Math.min(x,y,size-1-x,size-1-y)/24);
    let detail=cloud*8+noise*9,rough=190,height=128+noise*16;
    if(kind==='slate'){detail=cloud*10+noise*12+vein*12;height+=vein*14;rough=185+cloud*22;}
    if(kind==='linen'){detail=weave*10+cloud*3+noise*12+edge*22;height+=weave*30;rough=232;}
    if(kind==='paper'){detail=cloud*5+noise*8-edge*10;height+=Math.sin(y*2)*16;rough=244;}
    if(kind==='bamboo'){const grain=Math.sin(x*.6+Math.sin(y*.02)*.6);detail=grain*10+cloud*9+noise*9;height+=grain*16;rough=160+cloud*20;}
    if(kind==='soapstone'){detail=cloud*18+vein*33+noise*5;height+=vein*5;rough=155+cloud*28;}
    if(kind==='glaze'){detail=cloud*3+noise*4;rough=112+cloud*14;height=128+noise*3;}
    const i=(y*size+x)*4;
    for(let ch=0;ch<3;ch++){data[0].data[i+ch]=palette[kind][ch]+detail;data[1].data[i+ch]=height;data[2].data[i+ch]=rough;}
    data.forEach(d=>d.data[i+3]=255);
  }
  contexts.forEach((c,i)=>c.putImageData(data[i],0,0));
  if(kind==='glaze'){
    // Fine crazing beneath the glaze, deliberately low contrast.
    for(let i=0;i<90;i++){
      let x=random()*size,y=random()*size;
      contexts[0].beginPath();contexts[0].moveTo(x,y);
      for(let j=0;j<4;j++){x+=(random()-.5)*60;y+=random()*35;contexts[0].lineTo(x,y);}
      contexts[0].strokeStyle='rgba(67,92,72,.16)';contexts[0].lineWidth=.65;contexts[0].stroke();
    }
  }
  const [map,bumpMap,roughnessMap]=canvases.map(c=>{const t=new THREE.CanvasTexture(c);t.anisotropy=8;return t;});
  map.colorSpace=THREE.SRGBColorSpace;
  return {map,bumpMap,roughnessMap,dispose(){map.dispose();bumpMap.dispose();roughnessMap.dispose();}};
}
