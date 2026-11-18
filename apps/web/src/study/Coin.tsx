import {useMemo} from 'react';
import * as THREE from 'three';
import {canvas,colorTexture,dataTexture,heightToNormal,seeded} from './surfaceMaps';

const R=.25,HOLE=.07,THICK=.018,PX=1024,C=PX/2,SCALE=(PX/2-12)/R;
type Face='front'|'back';
function paint(face:Face){
  const random=seeded(face==='front'?4421:9133);
  const raised=(c:CanvasRenderingContext2D,fill:string)=>{
    c.fillStyle=fill;c.strokeStyle=fill;
    c.beginPath();c.arc(C,C,R*SCALE,0,Math.PI*2);c.arc(C,C,R*SCALE-34,0,Math.PI*2,true);c.fill('evenodd');
    const h=HOLE*SCALE;c.fillRect(C-h-30,C-h-30,2*h+60,2*h+60);
    c.font='bold 205px "KaiTi","STKaiti","Kaiti SC",serif';c.textAlign='center';c.textBaseline='middle';
    if(face==='front')[['乾',0,-1],['隆',0,1],['通',1,0],['寶',-1,0]].forEach(([ch,x,y])=>c.fillText(ch as string,C+(x as number)*330,C+(y as number)*330+8));
    else{c.lineWidth=26;c.lineCap='round';for(const side of [-1,1]){const x=C+side*330;c.beginPath();c.moveTo(x,C-110);c.bezierCurveTo(x+side*40,C-40,x-side*40,C+40,x,C+110);c.stroke();c.beginPath();c.moveTo(x-40,C-30);c.lineTo(x+40,C-30);c.stroke();}}
  };
  const height=canvas(PX,c=>{
    c.fillStyle='#000';c.fillRect(0,0,PX,PX);
    c.fillStyle='#5a5a5a';c.beginPath();c.arc(C,C,R*SCALE,0,Math.PI*2);c.fill();
    c.filter='blur(3px)';raised(c,'#e8e8e8');c.filter='none';
    for(let i=0;i<9000;i++){const v=Math.floor(random()*40);c.fillStyle=`rgba(${v},${v},${v},.12)`;c.fillRect(random()*PX,random()*PX,2,2);}
  });
  const color=canvas(PX,c=>{
    c.fillStyle='#3d3020';c.fillRect(0,0,PX,PX);
    const g=c.createRadialGradient(C,C,60,C,C,R*SCALE);g.addColorStop(0,'#6a5532');g.addColorStop(1,'#5a4527');
    c.fillStyle=g;c.beginPath();c.arc(C,C,R*SCALE,0,Math.PI*2);c.fill();
    // Green-brown patina pooling in the recessed field.
    for(let i=0;i<1400;i++){const a=random()*Math.PI*2,r=(.3+random()*.62)*R*SCALE;c.fillStyle=random()>.55?`rgba(70,104,78,${.08+random()*.18})`:`rgba(40,30,18,${.1+random()*.2})`;c.beginPath();c.ellipse(C+Math.cos(a)*r,C+Math.sin(a)*r,4+random()*16,2+random()*8,random()*3,0,Math.PI*2);c.fill();}
    raised(c,'#b8935a');
    // Worn high points catch more polish.
    c.globalCompositeOperation='lighter';c.filter='blur(6px)';raised(c,'rgba(70,52,22,.5)');c.filter='none';c.globalCompositeOperation='source-over';
    for(let i=0;i<6000;i++){c.fillStyle=`rgba(${random()>.5?'230,200,140':'30,22,12'},${random()*.06})`;c.fillRect(random()*PX,random()*PX,random()*3,1);}
  });
  const orm=canvas(PX,c=>{
    // G = roughness, B = metalness (glTF convention, read by three.js).
    c.fillStyle='rgb(255,190,110)';c.fillRect(0,0,PX,PX);
    for(let i=0;i<900;i++){const a=random()*Math.PI*2,r=(.3+random()*.62)*R*SCALE;c.fillStyle=`rgba(255,235,40,${.3+random()*.3})`;c.beginPath();c.arc(C+Math.cos(a)*r,C+Math.sin(a)*r,4+random()*12,0,Math.PI*2);c.fill();}
    raised(c,'rgb(255,95,235)');
  });
  return {map:colorTexture(color),normalMap:heightToNormal(height,3.2),orm:dataTexture(orm)};
}
function faceGeometry(){
  const s=new THREE.Shape();s.absarc(0,0,R,0,Math.PI*2,false);
  const hole=new THREE.Path();hole.moveTo(-HOLE,-HOLE);hole.lineTo(-HOLE,HOLE);hole.lineTo(HOLE,HOLE);hole.lineTo(HOLE,-HOLE);hole.closePath();s.holes.push(hole);
  const g=new THREE.ShapeGeometry(s,64);const p=g.getAttribute('position'),uv=g.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,.5+p.getX(i)*SCALE/PX,.5+p.getY(i)*SCALE/PX);
  return g;
}
function edgeGeometry(){
  const s=new THREE.Shape();s.absarc(0,0,R-.003,0,Math.PI*2,false);
  const hole=new THREE.Path();hole.moveTo(-HOLE,-HOLE);hole.lineTo(-HOLE,HOLE);hole.lineTo(HOLE,HOLE);hole.lineTo(HOLE,-HOLE);hole.closePath();s.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(s,{depth:THICK-.006,bevelEnabled:true,bevelSize:.003,bevelThickness:.003,bevelSegments:2,steps:1,curveSegments:64});
  g.translate(0,0,-(THICK-.006)/2);return g;
}
export type CoinAssets=ReturnType<typeof createCoinAssets>;
export function createCoinAssets(){
  const front=paint('front'),back=paint('back'),face=faceGeometry(),edge=edgeGeometry();
  const material=(m:ReturnType<typeof paint>)=>new THREE.MeshStandardMaterial({map:m.map,normalMap:m.normalMap,normalScale:new THREE.Vector2(1.1,1.1),roughnessMap:m.orm,metalnessMap:m.orm,roughness:1,metalness:1});
  const materials={front:material(front),back:material(back),edge:new THREE.MeshStandardMaterial({color:'#7a6038',metalness:.9,roughness:.45})};
  return {face,edge,materials,dispose(){face.dispose();edge.dispose();Object.values(materials).forEach(m=>m.dispose());[front,back].forEach(f=>{f.map.dispose();f.normalMap.dispose();f.orm.dispose();});}};
}
let shared:CoinAssets|null=null;
/** Painted once per page (two 1024² canvases + normal maps) and kept: remounts must not repaint. */
export function useCoinAssets(){
  return useMemo(()=>shared??=createCoinAssets(),[]);
}
/** Cast Qing cash coin: front face (+Y) reads 乾隆通寶, back carries mint marks. */
export function Coin({assets}:{assets:CoinAssets}){
  return <group rotation={[-Math.PI/2,0,0]}>
    <mesh geometry={assets.edge} material={assets.materials.edge} castShadow receiveShadow/>
    <mesh geometry={assets.face} material={assets.materials.front} position={[0,0,THICK/2+.0005]} receiveShadow/>
    <mesh geometry={assets.face} material={assets.materials.back} position={[0,0,-THICK/2-.0005]} rotation={[0,Math.PI,0]} receiveShadow/>
  </group>;
}
