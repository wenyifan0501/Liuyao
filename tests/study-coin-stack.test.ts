import {it,expect} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import {COIN_CONTACT_DAMPING,contactDecay,settledCoinValue} from '../apps/web/src/study/coinSettlement.js';
it('settles three overlapping thin coins under contact damping',async()=>{
  await RAPIER.init();
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  try{
    world.createCollider(RAPIER.ColliderDesc.cuboid(5,.15,5).setTranslation(0,-.17,0));
    const coins=Array.from({length:3},(_,i)=>{
      const b=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(i*.025,.015+i*.027,0).setLinearDamping(COIN_CONTACT_DAMPING.linear).setAngularDamping(COIN_CONTACT_DAMPING.angular));
      b.setAdditionalSolverIterations(8);b.setAngvel({x:.3,y:0,z:-.2},true);
      world.createCollider(RAPIER.ColliderDesc.cylinder(.01,.25).setContactSkin(.002).setRestitution(.08).setFriction(.75),b);return b;
    });
    let stable=0;
    for(let step=0;step<600;step++){
      world.step();
      const states=coins.map(b=>{
        const q=b.rotation(),v=b.linvel(),w=b.angvel(),up=1-2*(q.x*q.x+q.z*q.z),speed=Math.hypot(v.x,v.y,v.z)+Math.hypot(w.x,w.y,w.z);
        const decay=contactDecay(up,speed,1/60);
        if(!b.isSleeping() && decay<1){b.setLinvel({x:v.x*decay,y:v.y*decay,z:v.z*decay},false);b.setAngvel({x:w.x*decay,y:w.y*decay,z:w.z*decay},false);}
        return {up,speed};
      });
      stable=settledCoinValue(states)!==null?stable+1:0;
      if(stable>=34)break;
    }
    expect(stable).toBeGreaterThanOrEqual(34);
  }finally{world.free();}
});
