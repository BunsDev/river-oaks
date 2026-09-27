import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createUnicornGait } from './unicorn-gait.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { batchCostumeAttachments } from './costume-batching.js';

let cached;
export function loadUnicornAsset(){return cached??=new GLTFLoader().loadAsync('/assets/unicorns/horse.glb').catch(error=>{cached=null;throw error;});}

// The source is Lyndon Daniels / ChadM's CC0 horse. Two independent skeletons share
// immutable geometry; all local additions and materials belong to this team.
export function createUnicornTeam({scene,coach,groundAt,asset}) {
  const object=new THREE.Group();object.name='Pearl and Blossom · unicorn team';scene.add(object);
  const owned=new Set(),horses=[],point=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),reins=[];
  const material=(color,options={})=>{const m=new THREE.MeshPhysicalMaterial({color,roughness:.43,...options});owned.add(m);return m;};
  const coat=new THREE.MeshPhysicalMaterial(),mane=new THREE.MeshPhysicalMaterial();owned.add(coat);owned.add(mane);
  const sourceMaterials=new Map();asset.scene.traverse(o=>{if(o.isMesh)sourceMaterials.set(o.material.name,o.material);});
  for(const [m,name,color]of [[coat,'Material','#e3ddd2'],[mane,'Material.003','#d6adbd']]){
    THREE.MeshStandardMaterial.prototype.copy.call(m,sourceMaterials.get(name));m.color.set(color);m.roughness=.64;m.sheen=.45;m.sheenColor.set('#eee1d9');
    m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
float coatLuma=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));
diffuseColor.rgb=diffuse*mix(.10,1.0,pow(clamp(coatLuma,0.0,1.0),.68));
#endif`);};m.customProgramCacheKey=()=> 'pearl-unicorn-coat-v1';
  }
  const eyes=material('#21140e',{roughness:.13,clearcoat:1});
  const gold=material('#d4b777',{metalness:.88,roughness:.26});
  const leather=material('#895061',{roughness:.8});
  function mesh(parent,geometry,m,position=[0,0,0]){owned.add(geometry);const o=new THREE.Mesh(geometry,m);o.position.fromArray(position);o.castShadow=o.receiveShadow=true;parent.add(o);return o;}
  function tube(parent,points,r,m){return mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),32,r,6,false),m);}
  function attach(rig,bone,group){rig.add(group);rig.updateMatrixWorld(true);rig.getObjectByName(bone).attach(group);}
  for(const [i,side]of [-1,1].entries()) {
    const holder=new THREE.Group(),rig=clone(asset.scene);holder.name=i?'Blossom':'Pearl';holder.add(rig);object.add(holder);
    // 2.18 m to the ears, ~2.9 m nose to tail. Native +Z faces the coach's -X.
    rig.rotation.y=-Math.PI/2;
    const skins=[];
    rig.traverse(o=>{if(o.isSkinnedMesh){if(o.material.name==='Material')o.material=coat;else if(o.material.name==='Material.003')o.material=mane;else if(o.material.name==='Eye_brown')o.material=eyes;o.castShadow=o.receiveShadow=true;o.frustumCulled=false;skins.push(o);}});
    // Add ornaments in source coordinates before binding them to animated bones.
    const head=new THREE.Group(),chest=new THREE.Group();
    const horn=mesh(head,new THREE.ConeGeometry(.061,.59,24),gold,[0,2.34,1.55]);horn.rotation.x=.25;horn.name='Spiral golden horn';
    const spiral=Array.from({length:97},(_,n)=>{const t=n/96,a=t*Math.PI*12,r=.062*(1-t);return [Math.cos(a)*r,2.055+t*.573,1.477+t*.146+Math.sin(a)*r];});
    tube(head,spiral,.008,gold);
    for(const s of [-1,1]) {
      tube(head,[[s*.14,2.08,1.38],[s*.19,1.88,1.60],[s*.14,1.60,1.79]],.018,leather);
      const ring=mesh(head,new THREE.TorusGeometry(.041,.01,6,16),gold,[s*.16,1.61,1.79]);ring.rotation.y=Math.PI/2;
      tube(chest,[[s*.20,1.48,.68],[s*.30,1.22,.78],[s*.26,.89,.76],[0,.84,.77]],.029,leather);
      tube(chest,[[s*.20,1.48,.68],[s*.30,1.22,.78],[s*.26,.89,.76]],.008,gold);
    }
    tube(head,[[-.14,1.61,1.79],[0,1.56,1.91],[.14,1.61,1.79]],.018,leather);
    const jewel=mesh(chest,new THREE.OctahedronGeometry(.07),gold,[0,.88,.80]);jewel.scale.z=.45;
    rig.rotation.y=0;attach(rig,'Head',head);attach(rig,'Neck',chest);
    batchCostumeAttachments([{group:head},{group:chest}],owned);
    const bit=new THREE.Object3D();bit.position.set(side*.16,1.61,1.79);rig.add(bit);rig.updateMatrixWorld(true);rig.getObjectByName('Head').attach(bit);
    const gait=createUnicornGait(rig,{groundAt,phaseOffset:i*.13});rig.rotation.y=-Math.PI/2;
    const horse={holder,rig,skins,gait,side,bit};horses.push(horse);
    // Reins use a fixed vertex buffer, updated from the actual hand and bit.
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(25*3),3));owned.add(geometry);
    const lineMaterial=new THREE.LineBasicMaterial({color:'#56333e'});owned.add(lineMaterial);
    const line=new THREE.Line(geometry,lineMaterial);line.frustumCulled=false;object.add(line);reins.push(line);
  }
  const shafts=new THREE.Group();coach.add(shafts);
  for(const side of [-1,1])tube(shafts,[[-2.85,.78,side*.72],[-3.8,.88,side*.73],[-6.4,1.02,side*.44]],.027,gold);
  batchCostumeAttachments([{group:shafts}],owned);
  let disposed=false;
  return {
    object,horses,
    reset(){for(const h of horses){h.previousPosition=null;h.travel=0;h.heading=null;h.gait.reset();}},
    update(now,delta,speed,distance,driver) {
      object.visible=coach.visible;if(!object.visible)return;
      coach.updateWorldMatrix(true,false);
      for(const [i,h]of horses.entries()) {
        coach.localToWorld(point.set(-5.7,0,h.side*.76));h.holder.position.copy(point);
        h.holder.position.y=groundAt(h.holder.position.x,h.holder.position.z);
        const current=h.holder.position.clone(),travel=h.previousPosition?Math.hypot(current.x-h.previousPosition.x,current.z-h.previousPosition.z):0;
        if(travel>2){h.travel=0;h.heading=null;h.gait.reset();}else h.travel=(h.travel??0)+travel;
        if(h.heading===null||h.heading===undefined)h.heading=coach.rotation.y;
        if(travel>.00001&&travel<2){
          const sign=Math.sign(speed)||1,desired=Math.atan2((current.z-h.previousPosition.z)*sign,-(current.x-h.previousPosition.x)*sign);
          const difference=Math.atan2(Math.sin(desired-h.heading),Math.cos(desired-h.heading));
          h.heading+=difference*(1-Math.exp(-8*delta));
        }
        h.holder.quaternion.setFromAxisAngle(up,h.heading);h.holder.updateMatrixWorld(true);
        h.previousPosition=current;
        h.gait.update(delta,Math.sign(speed)*(delta>0?travel/delta:0),h.travel??0);
        const start=new THREE.Vector3(),end=h.bit.getWorldPosition(new THREE.Vector3());
        const hand=driver?.getObjectByName(i?'hand_l':'hand_r');
        if(hand)hand.getWorldPosition(start);else coach.localToWorld(start.set(-2.28,1.65,i?-.22:.22));
        const positions=reins[i].geometry.attributes.position;
        for(let n=0;n<positions.count;n++){const t=n/(positions.count-1);point.lerpVectors(start,end,t);point.y-=Math.sin(t*Math.PI)*.15;object.worldToLocal(point);positions.setXYZ(n,point.x,point.y,point.z);}positions.needsUpdate=true;
      }
    },
    inspect(){return horses.map(h=>({name:h.holder.name,position:h.holder.position.toArray(),walkWeight:h.gait.weight,hooves:h.gait.inspect(),horn:true,triangles:(()=>{let n=0;h.rig.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return n;})()}));},
    dispose(){if(disposed)return;disposed=true;for(const h of horses){for(const s of new Set(h.skins.map(s=>s.skeleton)))s.dispose();}for(const resource of owned)resource.dispose();shafts.removeFromParent();object.removeFromParent();},
  };
}
