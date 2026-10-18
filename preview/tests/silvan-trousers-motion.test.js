import test from 'node:test';
import assert from 'node:assert/strict';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadCharacterRig} from './helpers/character-rig.js';
import {loadResidentAvatar} from '../src/avatars.js';
import {bodyCoverageFixture} from './helpers/body-coverage.js';
import {garmentEdgeFixture} from './helpers/garment-edges.js';
import {SILVAN_DRAPES} from '../src/silvan-drape-geometry.js';
import {characterWardrobeMatrix} from '../audit/character-wardrobe-matrix.js';

test('Silvan running retains cuff coverage and separates the drape from trousers',async t=>{
  const source=await loadCharacterRig('jevica'),load=GLTFLoader.prototype.loadAsync,win=globalThis.window,doc=globalThis.document;
  GLTFLoader.prototype.loadAsync=async()=>({scene:source.scene});globalThis.window={matchMedia:()=>({matches:false})};globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})};
  t.after(()=>{GLTFLoader.prototype.loadAsync=load;globalThis.window=win;globalThis.document=doc;});
  const avatar=await loadResidentAvatar(4,'remote-studio','jevica',{folk:false,appearanceId:'forest-aristocrat-feminine',faceRecipe:{}}),model=avatar.rig.model;
  t.after(()=>avatar.dispose());
  const pants=model.getObjectByName('Forest aristocrat linen trousers'),body=model.getObjectByName('Jevica'),boots=['l','r'].map(side=>model.getObjectByName(`Forest aristocrat boot shaft ${side}`));
  assert(pants?.isSkinnedMesh&&boots.every(boot=>boot?.isMesh));
  // Match the browser fixture's initial idle update before sampling rest bands.
  avatar.update(0,'continue',false,{speed:0,distance:0,vehicle:'jevica'},()=>0);
  const coverage=bodyCoverageFixture(model,body,[pants,...boots],{bottom:-.43,top:-.31}),panels=SILVAN_DRAPES.map(p=>model.getObjectByName(p.name));
  const layers=garmentEdgeFixture(model,pants,panels),skin=garmentEdgeFixture(model,body,panels);
  const row=characterWardrobeMatrix().find(r=>r.appearanceId==='forest-aristocrat-feminine'&&r.pose==='run');
  try{
    for(let frame=0;frame<=163;frame++){
      const time=frame*1000/60,distance=time/1000*row.speed;avatar.object.position.z=distance;
      avatar.update(time,'continue',false,{speed:row.speed,distance,riding:false,gestureTime:time/1000},()=>0);
      if(![144,163].includes(frame))continue;
      avatar.object.position.z=0;
      const result=coverage.sample(),edges=[...layers.sample(),...skin.sample()];
      t.diagnostic(JSON.stringify({frame,tested:result.tested,uncovered:result.uncovered,edges}));
      assert(result.tested>6000);assert.equal(result.uncovered,0,JSON.stringify(result));
      assert(edges.every(edge=>edge.testedEdges>0&&edge.crossings===0),JSON.stringify(edges));
      avatar.object.position.z=distance;
    }
  }finally{layers.dispose();skin.dispose();}
});
