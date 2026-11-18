import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {Lazy,Model,type Tune} from './models';
import {canvas,colorTexture,dataTexture,heightToNormal,seeded} from './surfaceMaps';

const W=1.46,D=1.96,PAGES=.105,COVER=.012;
type BookSpec={cloth:string;title:string[];seed:number};
type Placement={position?:[number,number,number];rotation?:[number,number,number]};
/** Thread-bound (線裝) volume: cloth covers, four-hole binding, paper slip title. */
function bookMaps({cloth,title,seed}:BookSpec){
  const random=seeded(seed),N=1024,H=Math.round(N*D/W);
  // Binding runs along the right edge; the title slip sits at the upper left, as in 線裝 books.
  const sx=N/W,sz=H/D,holes=[-.72,-.26,.26,.72].map(z=>(z+D/2)*sz),spineX=N-.11*sx;
  const weave=(c:CanvasRenderingContext2D,base:string)=>{
    c.fillStyle=base;c.fillRect(0,0,N,H);
    for(let y=0;y<H;y+=3){c.fillStyle=`rgba(255,255,255,${.015+random()*.03})`;c.fillRect(0,y,N,1);}
    for(let x=0;x<N;x+=3){c.fillStyle=`rgba(0,0,0,${.03+random()*.04})`;c.fillRect(x,0,1,H);}
    for(let i=0;i<260;i++){c.fillStyle=`rgba(${random()>.5?'255,255,255':'0,0,0'},${random()*.06})`;c.beginPath();c.ellipse(random()*N,random()*H,20+random()*80,6+random()*30,random()*3,0,Math.PI*2);c.fill();}
    // Worn corners lighten the dye.
    for(const [x,y] of [[N,0],[N,H],[0,0],[0,H]]){const g=c.createRadialGradient(x,y,0,x,y,90);g.addColorStop(0,'rgba(220,210,190,.35)');g.addColorStop(1,'rgba(220,210,190,0)');c.fillStyle=g;c.fillRect(0,0,N,H);}
  };
  const thread=(c:CanvasRenderingContext2D,color:string,width:number)=>{
    c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';
    c.beginPath();c.moveTo(spineX,holes[0]!-60);holes.forEach(z=>c.lineTo(spineX,z));c.lineTo(spineX,holes[3]!+60);c.stroke();
    holes.forEach(z=>{c.beginPath();c.moveTo(N,z);c.lineTo(spineX,z);c.stroke();});
    c.beginPath();c.moveTo(N,holes[0]!-60);c.lineTo(spineX,holes[0]!-60);c.moveTo(N,holes[3]!+60);c.lineTo(spineX,holes[3]!+60);c.stroke();
  };
  const slip=(c:CanvasRenderingContext2D,fill:string,ink?:string)=>{
    const x=.12*sx,y=.12*sz,w=.24*sx,h=1.05*sz;c.fillStyle=fill;c.fillRect(x,y,w,h);
    if(ink){c.strokeStyle='rgba(120,90,50,.35)';c.lineWidth=3;c.strokeRect(x+10,y+10,w-20,h-20);
      c.fillStyle=ink;c.font=`${w*.52}px "KaiTi","STKaiti","Kaiti SC",serif`;c.textAlign='center';c.textBaseline='middle';
      title.forEach((ch,i)=>c.fillText(ch,x+w/2,y+h*.16+i*h*.68/Math.max(1,title.length-1)));}
  };
  const color=canvas(H,c=>{weave(c,cloth);thread(c,'#e8e1cf',7);c.fillStyle='rgba(10,10,20,.8)';holes.forEach(z=>{c.beginPath();c.arc(spineX,z,6,0,Math.PI*2);c.fill();});slip(c,'#e3d4ad','#3b2f22');},N);
  const height=canvas(H,c=>{c.fillStyle='#808080';c.fillRect(0,0,N,H);for(let i=0;i<4000;i++){c.fillStyle=`rgba(${random()>.5?'255,255,255':'0,0,0'},.05)`;c.fillRect(random()*N,random()*H,3,3);}
    c.filter='blur(2px)';thread(c,'#e0e0e0',8);c.fillStyle='#202020';holes.forEach(z=>{c.beginPath();c.arc(spineX,z,7,0,Math.PI*2);c.fill();});slip(c,'#a8a8a8');c.filter='none';},N);
  const rough=canvas(H,c=>{c.fillStyle='rgb(0,235,0)';c.fillRect(0,0,N,H);thread(c,'rgb(0,170,0)',7);slip(c,'rgb(0,215,0)');},N);
  const edges=canvas(256,c=>{c.fillStyle='#e6dcc3';c.fillRect(0,0,1024,256);for(let y=0;y<256;y+=2){c.fillStyle=`rgba(120,100,70,${.08+random()*.12})`;c.fillRect(0,y,1024,1);}
    const g=c.createLinearGradient(0,0,0,256);g.addColorStop(0,'rgba(150,120,80,.25)');g.addColorStop(.5,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(150,120,80,.25)');c.fillStyle=g;c.fillRect(0,0,1024,256);},1024);
  const maps={map:colorTexture(color),normalMap:heightToNormal(height,2),roughnessMap:dataTexture(rough),edges:colorTexture(edges)};
  return {...maps,dispose(){Object.values(maps).forEach(t=>t.dispose());}};
}
function Book({spec,...props}:{spec:BookSpec}&Placement){
  const maps=useMemo(()=>bookMaps(spec),[spec]);
  const geometry=useMemo(()=>({cover:new RoundedBoxGeometry(W,COVER,D,2,.005),pages:new RoundedBoxGeometry(W-.03,PAGES,D-.03,2,.012)}),[]);
  useEffect(()=>()=>{maps.dispose();geometry.cover.dispose();geometry.pages.dispose();},[maps,geometry]);
  return <group {...props}>
    <mesh geometry={geometry.cover} position={[0,COVER/2,0]} castShadow receiveShadow><meshStandardMaterial color={spec.cloth} roughness={.95}/></mesh>
    <mesh geometry={geometry.pages} position={[.01,COVER+PAGES/2,0]} castShadow receiveShadow><meshStandardMaterial map={maps.edges} roughness={.95}/></mesh>
    <mesh geometry={geometry.cover} position={[0,COVER*1.5+PAGES,0]} castShadow receiveShadow><meshStandardMaterial map={maps.map} normalMap={maps.normalMap} roughnessMap={maps.roughnessMap} roughness={1}/></mesh>
  </group>;
}
const BOOKS:BookSpec[]=[{cloth:'#2b3a52',title:['周','易','集','解'],seed:311},{cloth:'#3d4a43',title:['梅','花','易','數'],seed:733}];
const stone:Tune=m=>{m.metalness=0;m.roughness=.58;m.color.set('#857478');};
const glaze:Tune=m=>{m.metalness=0;m.roughness=.18;};
const matte:Tune=m=>{m.metalness=Math.min(m.metalness,.1);};
/**
 * Composition after reference 1 (logs/reference): the mat holds the centre; the left side is
 * lamp → books → tea from back to front, the right side is the writing set along the back
 * (inkstone, brush on its rest, seal), leaving the front right for the letter.
 */
export function DeskObjects(){
  const thickness=COVER*2+PAGES;
  return <>
    <group position={[-3.85,0,-1.05]} rotation={[0,.32,0]}>
      <Book spec={BOOKS[1]!} position={[.03,0,.02]} rotation={[0,.05,0]}/>
      <Book spec={BOOKS[0]!} position={[-.02,thickness,-.01]} rotation={[0,-.04,0]}/>
    </group>
    <Lazy><Model name="teacup_saucer" tune={glaze} position={[-3.6,0,1.55]} rotation={[0,.6,0]}/></Lazy>
    <Lazy><Model name="inkstone" tune={stone} position={[1.75,0,-2.85]} rotation={[0,Math.PI/2+.04,0]}/></Lazy>
    <Lazy><Model name="brush_rest" tune={matte} position={[3.55,0,-2.2]} rotation={[0,-.95,0]}/></Lazy>
    <Lazy><Model name="seal" tune={matte} position={[4.15,0,-3.15]} rotation={[0,-.35,0]}/></Lazy>
  </>;
}
