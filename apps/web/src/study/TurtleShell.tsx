import * as THREE from 'three';
import {Model} from './models';

/** Outer extents of the bundled shell model, in desk units; the opening faces +Z. */
export const SHELL_EXTENT={x:.942,y:.97,z:1.48};
/** Points on the dome, used to project the shell's on-screen hit area. */
export function shellSurface(r:number,a:number){
  return new THREE.Vector3(Math.cos(a)*r*SHELL_EXTENT.x,SHELL_EXTENT.y*Math.sqrt(Math.max(0,1-r*r))*.92+.04,Math.sin(a)*r*SHELL_EXTENT.z);
}
const tune=(m:THREE.MeshStandardMaterial)=>{m.color.set('#c4ad92');m.roughness=Math.min(1,m.roughness*1.1);};
export function TurtleShell(){
  return <Model name="turtle_shell" tune={tune}/>;
}
