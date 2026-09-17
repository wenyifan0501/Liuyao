import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// Long, low freshwater-turtle silhouette with a raised spine and scalloped margins.
export function shellSurface(r:number,a:number) {
  const x=Math.cos(a)*r, z=Math.sin(a)*r;
  const scallop=1-.012*Math.cos(a*24)*r**12;
  const width=.96*(1-.13*z+.035*Math.sin(a*3));
  const neck=Math.exp(-(((a-Math.PI/2)/.23)**2))*.13*r**10;
  const y=.095+.54*Math.pow(Math.max(0,1-r*r),.72)+.055*Math.exp(-x*x*28)*(1-r*r)+neck;
  return new THREE.Vector3(x*width*scallop,y,z*1.48*scallop);
}
function shellGeometry(inner=false) {
  const vertices:number[]=[],uv:number[]=[],indices:number[]=[];
  const rings=40,sides=128;
  for(let j=0;j<=rings;j++)for(let i=0;i<=sides;i++){
    const r=j/rings,a=i/sides*Math.PI*2,p=shellSurface(r,a);
    if(inner){p.x*=.975;p.z*=.975;p.y-=.042;}
    vertices.push(p.x,p.y,p.z);uv.push(p.x/2.1+.5,p.z/3.2+.5);
  }
  for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){
    const a=j*(sides+1)+i,b=a+sides+1;
    if(inner)indices.push(a,b,a+1,b,b+1,a+1);else indices.push(a,a+1,b,b,a+1,b+1);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function scuteMaps(){
  const size=1024,c=document.createElement('canvas'),h=document.createElement('canvas'),rough=document.createElement('canvas');
  c.width=c.height=h.width=h.height=rough.width=rough.height=size;
  const ctx=c.getContext('2d')!,hc=h.getContext('2d')!,rc=rough.getContext('2d')!;
  const color=ctx.createImageData(size,size),height=hc.createImageData(size,size),roughness=rc.createImageData(size,size);
  const seeds:{x:number;z:number;v:number}[]=[];
  for(let i=0;i<5;i++)seeds.push({x:0,z:(i-2)*.29,v:i});
  for(const side of [-1,1])for(let i=0;i<4;i++)seeds.push({x:side*.48,z:(i-1.5)*.36,v:5+i+(side+1)*2});
  for(let i=0;i<24;i++){const a=i/24*Math.PI*2;seeds.push({x:.94*Math.cos(a),z:.94*Math.sin(a),v:13+i});}
  let randomSeed=9281;const random=()=>{randomSeed=randomSeed*16807%2147483647;return randomSeed/2147483647;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const px=(x/size-.5)*2.1/.96,pz=(y/size-.5)*3.2/1.48;
    let first=Infinity,second=Infinity,seed=seeds[0]!;
    for(const s of seeds){const d=(px-s.x)**2+(pz-s.z)**2;if(d<first){second=first;first=d;seed=s;}else if(d<second)second=d;}
    const gap=Math.sqrt(second)-Math.sqrt(first),seam=Math.min(1,gap/.014);
    const growth=Math.sin(Math.sqrt(first)*130+Math.sin(px*22+pz*8)*.8);
    const mottle=Math.sin(px*31+Math.sin(pz*19))*Math.sin(pz*27+px*4);
    const amber=Math.max(0,Math.sin(seed.v*2.7+px*8+pz*11))*.32+Math.max(0,mottle)*.25;
    const noise=random()-.5,tone=seam*(.72+amber)+noise*.065;
    const i=(y*size+x)*4;
    color.data[i]=35+tone*77+growth*2;color.data[i+1]=29+tone*48+growth*1.4;color.data[i+2]=19+tone*24;
    const elevation=100+seam*28+growth*4+noise*6;
    for(let k=0;k<3;k++){height.data[i+k]=elevation;roughness.data[i+k]=155+noise*20-amber*48;}
    color.data[i+3]=height.data[i+3]=roughness.data[i+3]=255;
  }
  ctx.putImageData(color,0,0);hc.putImageData(height,0,0);rc.putImageData(roughness,0,0);
  const map=new THREE.CanvasTexture(c),bump=new THREE.CanvasTexture(h),roughMap=new THREE.CanvasTexture(rough);map.colorSpace=THREE.SRGBColorSpace;
  for(const t of [map,bump,roughMap])t.anisotropy=8;
  return {map,bump,roughMap};
}
export function TurtleShell(){
  const assets=useMemo(()=>{
    const outer=shellGeometry(),inner=shellGeometry(true),maps=scuteMaps();
    const edge=Array.from({length:129},(_,i)=>shellSurface(1,i/128*Math.PI*2));
    const lip=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge,true),192,.019,6,true);
    // A real belly plate leaves a broad front aperture under the elevated neck margin.
    const belly=new THREE.SphereGeometry(1,64,20,0,Math.PI*2,Math.PI/2,Math.PI/2);
    belly.scale(.84,.13,1.27);belly.translate(0,.045,-.045);
    return {outer,inner,lip,belly,...maps};
  },[]);
  useEffect(()=>()=>{for(const asset of Object.values(assets))asset.dispose();},[assets]);
  return <>
    <mesh geometry={assets.outer} castShadow receiveShadow><meshStandardMaterial map={assets.map} bumpMap={assets.bump} bumpScale={.018} roughnessMap={assets.roughMap} roughness={.9}/></mesh>
    <mesh geometry={assets.inner} castShadow><meshStandardMaterial color="#655139" bumpMap={assets.bump} bumpScale={.008} roughness={.94}/></mesh>
    <mesh geometry={assets.lip} castShadow><meshStandardMaterial color="#8a7048" roughness={.73}/></mesh>
    <mesh geometry={assets.belly} castShadow receiveShadow><meshStandardMaterial color="#796648" bumpMap={assets.bump} bumpScale={.01} roughness={.85} side={THREE.DoubleSide}/></mesh>
  </>;
}

