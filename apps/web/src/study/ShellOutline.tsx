import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** Draw an alpha-blended screen-space rim after tone mapping, using a visible-surface mask. */
export function ShellOutline({ target, active }: { target: RefObject<THREE.Group | null>; active: boolean }) {
  const { gl, scene, camera, size, viewport } = useThree();
  const resources = useRef<ReturnType<typeof createOutline> | null>(null);
  const strength = useRef(0);
  useEffect(() => {
    const r = createOutline(); resources.current = r;
    return () => { resources.current = null; r.buffer.dispose(); r.black.dispose(); r.white.dispose(); r.material.dispose(); r.quad.dispose(); };
  }, []);
  useEffect(() => {
    const r=resources.current; if (!r) return;
    r.buffer.setSize(Math.ceil(size.width*viewport.dpr),Math.ceil(size.height*viewport.dpr));
    r.material.uniforms.texel.value.set(1/r.buffer.width,1/r.buffer.height);
    r.material.uniforms.pixelRatio.value=viewport.dpr;
  }, [size.width,size.height,viewport.dpr]);
  useFrame((_,dt) => {
    strength.current = matchMedia('(prefers-reduced-motion: reduce)').matches ? Number(active) : THREE.MathUtils.damp(strength.current,Number(active),14,Math.min(dt,.05));
    gl.render(scene,camera);
    const r=resources.current; if (!r || !target.current || strength.current<.005) return;
    // Share geometry, but copy live world matrices so lift/rotation stay perfectly aligned.
    let count=0;
    target.current.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      let proxy=r.proxies[count];
      if (!proxy) { proxy=new THREE.Mesh(object.geometry,r.white); proxy.matrixAutoUpdate=false; r.proxies.push(proxy); r.mask.add(proxy); }
      proxy.geometry=object.geometry; proxy.matrix.copy(object.matrixWorld); proxy.visible=object.visible; count++;
    });
    r.proxies.slice(count).forEach(proxy => { proxy.visible=false; });
    const oldTarget=gl.getRenderTarget(), background=scene.background, override=scene.overrideMaterial;
    const oldAutoClear=gl.autoClear, oldShadow=gl.shadowMap.autoUpdate;
    const clearColor=gl.getClearColor(new THREE.Color()), clearAlpha=gl.getClearAlpha();
    try {
      gl.shadowMap.autoUpdate=false;
      gl.setRenderTarget(r.buffer); gl.setClearColor(0x000000,0); gl.clear(); gl.autoClear=false;
      // Actual scene depth preserves occlusion without comparing packed depth textures.
      scene.background=null; scene.overrideMaterial=r.black; gl.render(scene,camera);
      gl.render(r.mask,camera);
      gl.setRenderTarget(oldTarget);
      r.material.uniforms.amount.value=strength.current;
      r.quad.render(gl);
    } finally {
      scene.background=background; scene.overrideMaterial=override;
      gl.autoClear=oldAutoClear; gl.shadowMap.autoUpdate=oldShadow;
      gl.setClearColor(clearColor,clearAlpha); gl.setRenderTarget(oldTarget);
    }
  },1);
  return null;
}

function createOutline() {
  const buffer=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
  const black=new THREE.MeshBasicMaterial({color:0x000000,side:THREE.DoubleSide,toneMapped:false});
  const white=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,toneMapped:false,depthWrite:false,depthFunc:THREE.LessEqualDepth});
  const mask=new THREE.Scene(), proxies:THREE.Mesh[]=[];
  const material=new THREE.ShaderMaterial({
    uniforms:{mask:{value:buffer.texture},texel:{value:new THREE.Vector2()},pixelRatio:{value:1},amount:{value:0}},
    vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`
      uniform sampler2D mask; uniform vec2 texel; uniform float pixelRatio; uniform float amount; varying vec2 vUv;
      void main(){
        float center=texture2D(mask,vUv).r, rim=0.;
        vec3 haze=vec3(0.);
        for(int i=0;i<24;i++){
          float a=float(i)*6.2831853/24.;
          vec2 d=vec2(cos(a),sin(a))*texel*pixelRatio;
          rim=max(rim,texture2D(mask,vUv+d*1.6).r);
        }
        // Gaussian-distributed samples reproduce CSS's 10 / 30 / 65px shadow falloffs.
        for(int i=0;i<48;i++){
          float a=float(i)*2.39996323;
          float radius=sqrt(-2.*log((float(i)+.5)/48.));
          vec2 d=vec2(cos(a),sin(a))*radius*texel*pixelRatio;
          haze.x+=texture2D(mask,vUv+d*5.).r;
          haze.y+=texture2D(mask,vUv+d*15.).r;
          haze.z+=texture2D(mask,vUv+d*32.5).r;
        }
        haze=haze/48.*vec3(.8,.6,.4);
        // Same outer-to-inner layers and source-over blending as the letter shadows.
        vec3 rgb=vec3(231.,182.,100.)/255.*haze.z;
        float alpha=haze.z;
        rgb=vec3(239.,196.,120.)/255.*haze.y+rgb*(1.-haze.y);
        alpha=haze.y+alpha*(1.-haze.y);
        rgb=vec3(255.,229.,169.)/255.*haze.x+rgb*(1.-haze.x);
        alpha=haze.x+alpha*(1.-haze.x);
        rgb=vec3(255.,237.,187.)/255.*rim+rgb*(1.-rim);
        alpha=rim+alpha*(1.-rim);
        gl_FragColor=vec4(rgb/max(alpha,.0001),(1.-center)*alpha*amount);
      }`,
    transparent:true,depthTest:false,depthWrite:false,toneMapped:false,
  });
  return {buffer,black,white,mask,proxies,material,quad:new FullScreenQuad(material)};
}
