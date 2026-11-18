import * as THREE from 'three';

/** Build a tangent-space normal map from a grayscale height canvas (Sobel). */
export function heightToNormal(height:HTMLCanvasElement,strength=2){
  const w=height.width,h=height.height,src=height.getContext('2d')!.getImageData(0,0,w,h).data;
  const out=document.createElement('canvas');out.width=w;out.height=h;
  const ctx=out.getContext('2d')!,img=ctx.createImageData(w,h),d=img.data;
  const at=(x:number,y:number)=>src[((y<0?0:y>=h?h-1:y)*w+(x<0?0:x>=w?w-1:x))*4]!/255;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const dx=(at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1))-(at(x-1,y-1)+2*at(x-1,y)+at(x-1,y+1));
    const dy=(at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1))-(at(x-1,y-1)+2*at(x,y-1)+at(x+1,y-1));
    const nx=-dx*strength,ny=dy*strength,inv=1/Math.sqrt(nx*nx+ny*ny+1);
    const i=(y*w+x)*4;d[i]=(nx*inv*.5+.5)*255;d[i+1]=(ny*inv*.5+.5)*255;d[i+2]=(inv*.5+.5)*255;d[i+3]=255;
  }
  ctx.putImageData(img,0,0);
  const t=new THREE.CanvasTexture(out);t.anisotropy=8;return t;
}
export function canvas(size:number,draw:(c:CanvasRenderingContext2D)=>void,width=size){
  const el=document.createElement('canvas');el.width=width;el.height=size;draw(el.getContext('2d')!);return el;
}
export function colorTexture(el:HTMLCanvasElement){const t=new THREE.CanvasTexture(el);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;}
export function dataTexture(el:HTMLCanvasElement){const t=new THREE.CanvasTexture(el);t.anisotropy=8;return t;}
/** Deterministic pseudo-random generator so every visit renders the same object. */
export function seeded(seed:number){return ()=>{seed=seed*16807%2147483647;return seed/2147483647;};}
