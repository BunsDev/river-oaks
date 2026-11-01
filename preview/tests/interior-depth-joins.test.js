import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {buildStoreInteriors} from '../src/store-interiors.js';
import {buildIpicInterior} from '../src/ipic-interior.js';
import {planStoreRooms} from '../src/store-rooms.js';
import {findDepthFights} from '../src/depth-layer-audit.js';

const world=JSON.parse(readFileSync(new URL('../public/data/district.json',import.meta.url)));
const context=()=>new Proxy({}, {get:(t,k)=>k==='createImageData'?(w,h)=>({data:new Uint8ClampedArray(w*h*4)}):k==='measureText'?()=>({width:1}):k==='createLinearGradient'?()=>({addColorStop(){}}):t[k]??(()=>{}),set:(t,k,v)=>(t[k]=v,true)});
const canvasFixture=t=>{
  const previousDocument=globalThis.document,previousIdle=globalThis.requestIdleCallback;
  globalThis.document={createElement:()=>({width:1,height:1,getContext:context})};globalThis.requestIdleCallback=()=>0;
  t.after(()=>{globalThis.document=previousDocument;globalThis.requestIdleCallback=previousIdle;});
};

test('boutique mirrors keep a clear reflective face in front of their brass backing on either wall', t=>{
  canvasFixture(t);
  const template=planStoreRooms(world).find(r=>r.theme==='fashion');
  for(const side of [-1,1]) {
    const fixture={kind:'mirror',a:side*2,d:4,side};
    const room={...template,facade:[0,0],outward:[0,-1],floor:0,lights:[],fixtures:[fixture],toWorld:(a,d)=>[a,d]};
    const before=JSON.stringify(room.obstacles),root=buildStoreInteriors([room]);
    try {
      const fights=findDepthFights(root).filter(f=>/interior-mirror/.test(f.a+f.b)&&/interior-brass/.test(f.a+f.b));
      assert.equal(fights.length,0,`${side}: no brass face competes with the mirror`);
      root.updateMatrixWorld(true);
      const ray=new THREE.Raycaster(new THREE.Vector3(fixture.a-side,1.2,-fixture.d),new THREE.Vector3(side,0,0),0,2);
      const first=ray.intersectObject(root,true).find(hit=>!hit.object.material.transparent);
      assert.equal(first?.object.material.name,'interior-mirror','the centre still reflects instead of showing brass');
      assert.equal(JSON.stringify(room.obstacles),before,'rendering changes do not move collision');
    } finally {root.userData.dispose();}
  }
});

test('the fitting table mirror is visible in front of its brass border', t=>{
  canvasFixture(t);
  const template=planStoreRooms(world).find(r=>r.theme==='fashion'), fixture={kind:'desk',style:'fitting',a:0,d:4,w:1.2,l:.9};
  const room={...template,facade:[0,0],outward:[0,-1],floor:0,lights:[],fixtures:[fixture],toWorld:(a,d)=>[a,d]};
  const root=buildStoreInteriors([room]);root.updateMatrixWorld(true);
  try {
    const ray=new THREE.Raycaster(new THREE.Vector3(0,1.2,-4),new THREE.Vector3(0,0,-1),0,2);
    const first=ray.intersectObject(root,true).find(hit=>!hit.object.material.transparent);
    assert.equal(first?.object.material.name,'interior-mirror','backing cannot occlude the reflective centre');
    const rear=new THREE.Raycaster(new THREE.Vector3(0,1.2,-4.8),new THREE.Vector3(0,0,1),0,2);
    const back=rear.intersectObject(root,true).find(hit=>!hit.object.material.transparent);
    assert.equal(back?.object.material.name,'interior-brass','the freestanding mirror retains its opaque rear cover');
  } finally {root.userData.dispose();}
});

test('IPIC reception timber and plaster do not share exposed end planes', ()=>{
  const room=planStoreRooms(world).find(r=>r.name==='IPIC Theaters');
  const root=buildIpicInterior(room,{textures:false,local:true});
  try {
    const reception=root.getObjectByName('Reception');
    const fights=findDepthFights(reception).filter(f=>/ipic-warm-plaster/.test(f.a+f.b)&&/ipic-weathered-timber/.test(f.a+f.b));
    assert.equal(fights.length,0,'wall/coffer join cannot flash between plaster and timber while entering');
  } finally {root.userData.dispose();}
});
