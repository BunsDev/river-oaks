import * as THREE from 'three';

const CELL=16,UP=new THREE.Vector3(0,1,0);
const visible=(mesh,ignoreSelf=false)=>{for(let p=ignoreSelf?mesh.parent:mesh;p;p=p.parent)if(!p.visible)return false;return true;};
const random=seed=>{const n=Math.sin(seed*127.1+311.7)*43758.5453;return n-Math.floor(n);};

function segmentBox(a,b,min,max) {
  let enter=0,exit=1;
  for(const axis of ['x','y','z']) {
    const d=b[axis]-a[axis];
    if(Math.abs(d)<1e-9){if(a[axis]<min[axis]||a[axis]>max[axis])return null;continue;}
    const p=(min[axis]-a[axis])/d,q=(max[axis]-a[axis])/d;
    enter=Math.max(enter,Math.min(p,q));exit=Math.min(exit,Math.max(p,q));
    if(enter>exit)return null;
  }
  return enter;
}

export function createBreakableGlass({restoreSeconds=20,maxShards=192,reducedMotion=false,groundAt=()=>0,onChange=()=>{}}={}) {
  const capacity=Math.max(1,Math.floor(maxShards));
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));
  const alpha=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1).setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('glassShardAlpha',alpha);
  const material=new THREE.MeshPhysicalMaterial({color:'#c5e8e2',metalness:.12,roughness:.14,clearcoat:1,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide});
  material.forceSinglePass=true;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float glassShardAlpha;\nvarying float vGlassShardAlpha;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGlassShardAlpha=glassShardAlpha;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vGlassShardAlpha;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vGlassShardAlpha;');
  };
  material.customProgramCacheKey=()=> 'river-oaks-glass-shards-v1';
  const object=new THREE.InstancedMesh(geometry,material,capacity);object.name='Window glass debris';object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  object.count=0;object.visible=false;object.frustumCulled=false;object.castShadow=false;object.userData.aoExclude=true;
  const slots=Array.from({length:capacity},()=>({alive:false,position:new THREE.Vector3(),velocity:new THREE.Vector3(),rotation:new THREE.Quaternion(),spin:new THREE.Vector3(),shape:new THREE.Matrix4(),normal:new THREE.Vector3(),age:0,lifetime:0,settled:false}));
  const panes=[],grid=new Map(),dynamic=[],broken=new Map();
  const matrix=new THREE.Matrix4(),zero=new THREE.Matrix4().makeScale(0,0,0),unit=new THREE.Vector3(1,1,1),rotation=new THREE.Quaternion(),sample=new THREE.Vector3();
  let time=0,cursor=0,active=0,totalBreaks=0,lastCandidateCount=0;
  const refresh=pane=>{
    pane.mesh.updateWorldMatrix(true,false);pane.world.copy(pane.mesh.matrixWorld).multiply(pane.original);
    pane.inverse.copy(pane.world).invert();pane.normal.setFromMatrixColumn(pane.world,2).normalize();
    pane.scale.setFromMatrixScale(pane.world);pane.bounds.copy(pane.localBounds).applyMatrix4(pane.world);
  };
  const setPane=(pane,intact)=>{
    if(pane.index===null)pane.mesh.visible=intact?pane.originalVisible:false;
    else {pane.mesh.setMatrixAt(pane.index,intact?pane.original:zero);pane.mesh.instanceMatrix.addUpdateRange(pane.index*16,16);pane.mesh.instanceMatrix.needsUpdate=true;}
  };
  const clear=()=>{
    for(const pane of broken.values())setPane(pane,true);
    panes.length=dynamic.length=0;grid.clear();broken.clear();slots.forEach(s=>s.alive=false);active=object.count=0;object.visible=false;time=cursor=totalBreaks=0;
  };
  const candidates=(from,to,radius)=>{
    const found=new Set(dynamic),margin=radius+.8;
    for(let x=Math.floor((Math.min(from[0],to[0])-margin)/CELL);x<=Math.floor((Math.max(from[0],to[0])+margin)/CELL);x++)
      for(let z=Math.floor((Math.min(from[2],to[2])-margin)/CELL);z<=Math.floor((Math.max(from[2],to[2])+margin)/CELL);z++)
        for(const pane of grid.get(`${x}:${z}`)??[])found.add(pane);
    lastCandidateCount=found.size;return found;
  };
  const spawn=(pane,velocity)=>{
    const {min,max}=pane.localBounds,columns=reducedMotion?1:4,rows=reducedMotion?1:4,points=[];
    for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++) {
      const jitterX=x>0&&x<columns?(random(pane.id*53+x+y*7)-.5)*.35:0;
      const jitterY=y>0&&y<rows?(random(pane.id*97+x*11+y)-.5)*.35:0;
      points.push(new THREE.Vector3(THREE.MathUtils.lerp(min.x,max.x,(x+jitterX)/columns),THREE.MathUtils.lerp(min.y,max.y,(y+jitterY)/rows),0).applyMatrix4(pane.world));
    }
    let fragment=0;
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)for(const corners of [[0,1,columns+1],[1,columns+2,columns+1]]) {
      const a=points[y*(columns+1)+x+corners[0]],b=points[y*(columns+1)+x+corners[1]],c=points[y*(columns+1)+x+corners[2]];
      const slot=slots[cursor++%capacity],seed=pane.id*211+fragment++ +totalBreaks*37;
      if(!slot.alive)active++;slot.alive=true;slot.age=0;slot.lifetime=reducedMotion?.35:3.2+random(seed)*.4;slot.settled=false;
      slot.position.copy(a).add(b).add(c).divideScalar(3);slot.rotation.identity();slot.normal.copy(pane.normal);
      slot.shape.makeBasis(b.clone().sub(a),c.clone().sub(a),pane.normal).setPosition(a.clone().sub(slot.position));
      slot.velocity.fromArray(velocity).multiplyScalar(.2).add(new THREE.Vector3((random(seed+1)-.5)*2,.3+random(seed+2)*1.2,(random(seed+3)-.5)*2));
      slot.spin.set((random(seed+4)-.5)*5,(random(seed+5)-.5)*5,(random(seed+6)-.5)*5);
    }
  };
  const trace=(from,to,{velocity=[0,0,0],mass=18,radius=.28,height=1}={})=>{
    if(![...from,...to,...velocity,mass,radius,height].every(Number.isFinite)||radius<0||height<=0)return {hit:null,opening:false};
    let nearest=null,opening=false,blocked=false;
    for(const pane of candidates(from,to,radius)) {
      if(!visible(pane.mesh,broken.has(pane.id)&&pane.index===null))continue;
      if(pane.moving)refresh(pane);
      const a=new THREE.Vector3(from[0],from[1]+height/2,from[2]).applyMatrix4(pane.inverse);
      const b=new THREE.Vector3(to[0],to[1]+height/2,to[2]).applyMatrix4(pane.inverse),{min,max}=pane.localBounds;
      const rx=radius/pane.scale.x,ry=height/2/pane.scale.y,rz=radius/pane.scale.z;
      if(b.x>=min.x+rx&&b.x<=max.x-rx&&b.y>=min.y+ry&&b.y<=max.y-ry&&Math.abs(b.z)<(.8+radius)/pane.scale.z)opening=true;
      if(broken.has(pane.id))continue;
      const normalSpeed=Math.abs(velocity[0]*pane.normal.x+velocity[1]*pane.normal.y+velocity[2]*pane.normal.z);
      if(Math.abs(b.z)>Math.abs(a.z)&&a.z*b.z>=0)continue;
      const t=segmentBox(a,b,new THREE.Vector3(min.x-rx,min.y-ry,min.z-rz),new THREE.Vector3(max.x+rx,max.y+ry,max.z+rz));
      if(t===null)continue;
      if(.5*mass*normalSpeed**2<20){blocked=true;continue;}
      if(!nearest||t<nearest.t)nearest={pane,t,a,b};
    }
    if(!nearest)return {hit:null,opening,blocked};
    const {pane,t,a,b}=nearest;pane.restoreAt=time+restoreSeconds;broken.set(pane.id,pane);totalBreaks++;
    setPane(pane,false);spawn(pane,velocity);
    const point=a.lerp(b,t);point.x=THREE.MathUtils.clamp(point.x,pane.localBounds.min.x,pane.localBounds.max.x);point.y=THREE.MathUtils.clamp(point.y,pane.localBounds.min.y,pane.localBounds.max.y);point.z=0;point.applyMatrix4(pane.world);
    const hit={id:pane.id,position:point.toArray(),restoreSeconds};onChange(hit);return {hit,opening,blocked};
  };
  return {
    object,
    reset:clear,
    setWorld(root) {
      clear();root.updateWorldMatrix(true,true);
      root.traverse(mesh=>{
        if(!mesh.isMesh||!mesh.userData.breakableGlass)return;
        mesh.geometry.computeBoundingBox();
        for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++) {
          const original=new THREE.Matrix4();if(mesh.isInstancedMesh)mesh.getMatrixAt(i,original);
          const pane={id:panes.length,mesh,index:mesh.isInstancedMesh?i:null,original,originalVisible:mesh.visible,moving:Boolean(mesh.userData.breakableGlassDynamic),localBounds:mesh.geometry.boundingBox.clone(),world:new THREE.Matrix4(),inverse:new THREE.Matrix4(),normal:new THREE.Vector3(),scale:new THREE.Vector3(),bounds:new THREE.Box3()};
          refresh(pane);panes.push(pane);
          if(pane.moving){dynamic.push(pane);continue;}
          for(let x=Math.floor(pane.bounds.min.x/CELL);x<=Math.floor(pane.bounds.max.x/CELL);x++)for(let z=Math.floor(pane.bounds.min.z/CELL);z<=Math.floor(pane.bounds.max.z/CELL);z++) {
            const key=`${x}:${z}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(pane);
          }
        }
      });
    },
    trace,
    sweep(from,to,projectile){return trace(from,to,projectile).hit;},
    update(delta) {
      if(!Number.isFinite(delta)||delta<0)return;time+=delta;let restored=false;
      for(const [id,pane]of broken)if(time>=pane.restoreAt){setPane(pane,true);broken.delete(id);restored=true;}
      if(restored)onChange(null);
      if(!active){object.visible=false;return;}
      let count=0;const dt=Math.min(delta,.05);
      for(const slot of slots) {
        if(!slot.alive)continue;slot.age+=delta;
        if(slot.age>=slot.lifetime){slot.alive=false;active--;continue;}
        if(!reducedMotion&&!slot.settled) {
          slot.velocity.y-=9.81*dt;slot.position.addScaledVector(slot.velocity,dt);
          rotation.setFromEuler(new THREE.Euler(slot.spin.x*dt,slot.spin.y*dt,slot.spin.z*dt));slot.rotation.multiply(rotation);
          const floor=groundAt(slot.position.x,slot.position.z);
          matrix.compose(slot.position,slot.rotation,unit).multiply(slot.shape);
          let clearance=Infinity;
          for(const [x,y]of [[0,0],[1,0],[0,1]]) {
            sample.set(x,y,0).applyMatrix4(matrix);
            clearance=Math.min(clearance,sample.y-groundAt(sample.x,sample.z));
          }
          if(clearance<.02) {
            slot.rotation.setFromUnitVectors(slot.normal,UP);slot.settled=true;
            matrix.compose(slot.position,slot.rotation,unit).multiply(slot.shape);
            let support=floor;for(const [x,y]of [[0,0],[1,0],[0,1]]){sample.set(x,y,0).applyMatrix4(matrix);support=Math.max(support,groundAt(sample.x,sample.z));}
            slot.position.y=support+.015;
          }
        }
        matrix.compose(slot.position,slot.rotation,unit).multiply(slot.shape);object.setMatrixAt(count,matrix);
        alpha.setX(count,Math.min(1,(slot.lifetime-slot.age)/(reducedMotion?.35:.7)));count++;
      }
      object.count=count;object.visible=count>0;object.instanceMatrix.needsUpdate=true;alpha.needsUpdate=true;
    },
    inspect(details=false) {return {registered:panes.length,broken:broken.size,shards:active,triangles:active,capacity,totalBreaks,lastCandidateCount,restoreSeconds,panes:details?panes.map(p=>({id:p.id,center:p.bounds.getCenter(new THREE.Vector3()).toArray(),normal:p.normal.toArray(),size:p.bounds.getSize(new THREE.Vector3()).toArray(),broken:broken.has(p.id),restoreIn:broken.has(p.id)?Math.max(0,p.restoreAt-time):0})):undefined};},
    dispose() {clear();object.removeFromParent();object.dispose();geometry.dispose();material.dispose();},
  };
}
