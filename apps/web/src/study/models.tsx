import {Suspense,useEffect,useMemo,type ReactNode} from 'react';
import {useLoader,useThree,type ThreeElements} from '@react-three/fiber';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

/** Bundled, optimised GLB props (meshopt + WebP). AI models: scripts/models; Blender models: scripts/blender. */
export type ModelName='turtle_shell'|'teacup_saucer'|'inkstone'|'brush_rest'|'seal'|'books'|'plum_branch'|'jiaobei'|'qiuqian_tube'|'desk_lamp'|'desk';
const url=(name:ModelName)=>`${import.meta.env.BASE_URL}models/${name}.glb`;
const withMeshopt=(loader:GLTFLoader)=>{loader.setMeshoptDecoder(MeshoptDecoder);};

/** Adjust a cloned material at runtime; set `userData.noShadow` to stop that mesh casting shadows. */
export type Tune=(material:THREE.MeshStandardMaterial,mesh:THREE.Mesh)=>void;
export function useModel(name:ModelName,shadows=true,tune?:Tune){
  const gltf=useLoader(GLTFLoader,url(name),withMeshopt);
  const object=useMemo(()=>{
    const scene=gltf.scene.clone(true);
    scene.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;mesh.castShadow=shadows;mesh.receiveShadow=true;
      if(tune){const m=(mesh.material as THREE.MeshStandardMaterial).clone();tune(m,mesh);mesh.material=m;if(m.userData.noShadow)mesh.castShadow=false;}});
    return scene;
  },[gltf,shadows]);
  useEffect(()=>()=>{if(tune)object.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.isMesh)(mesh.material as THREE.Material).dispose();});},[object]);
  return object;
}
export function Model({name,shadows=true,tune,...props}:{name:ModelName;shadows?:boolean;tune?:Tune}&Omit<ThreeElements['group'],'children'>){
  const object=useModel(name,shadows,tune);
  return <group {...props}><primitive object={object}/></group>;
}
/** A named node of a multi-object GLB (e.g. tube and lot slip of qiuqian_tube); shared, clone before reuse. */
export function useModelNode(name:ModelName,node:string){
  const gltf=useLoader(GLTFLoader,url(name),withMeshopt);
  return useMemo(()=>{
    const found=gltf.scene.getObjectByName(node);
    if(!found)throw new Error(`${name}.glb has no node ${node}`);
    return found;
  },[gltf,node]);
}
/** The single mesh under a node; for meshes instanced many times (one material, one primitive). */
export function useModelMesh(name:ModelName,node:string){
  const root=useModelNode(name,node);
  return useMemo(()=>{
    let found:THREE.Mesh|undefined;
    root.traverse(o=>{if(!found&&(o as THREE.Mesh).isMesh)found=o as THREE.Mesh;});
    if(!found)throw new Error(`${name}.glb node ${node} has no mesh`);
    return found;
  },[root]);
}
export const preloadModels=(names:ModelName[])=>names.forEach(n=>useLoader.preload(GLTFLoader,url(n),withMeshopt));
/** A model that never blocks the rest of the desk while it streams in. */
export function Lazy({children}:{children:ReactNode}){return <Suspense fallback={null}>{children}</Suspense>;}

/** Soft studio reflections so lacquer, glaze and brass read as real materials. */
export function SceneEnvironment({intensity=.32}:{intensity?:number}){
  const {gl,scene}=useThree();
  useEffect(()=>{
    const pmrem=new THREE.PMREMGenerator(gl),room=new RoomEnvironment();
    const target=pmrem.fromScene(room,.04);
    scene.environment=target.texture;scene.environmentIntensity=intensity;
    return ()=>{scene.environment=null;target.dispose();pmrem.dispose();room.dispose();};
  },[gl,scene,intensity]);
  return null;
}
