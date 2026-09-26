import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCharacterRig} from './helpers/character-rig.js';
import {instantiateAvatar} from '../src/avatars.js';
import {createCuffProbe,sockVertices} from '../e2e/fixtures/cuff-clearance.js';

test('casual socks fit beneath their trouser cuffs without changing leather, soles or cached assets',async()=>{
  const source=await loadCharacterRig('woman-casual'),before=new Map();
  source.scene.traverse(m=>{if(m.isSkinnedMesh)before.set(m.geometry,m.geometry.attributes.position.array.slice());});
  const avatar=instantiateAvatar(source,{targetHeight:1.66});
  const measure=createCuffProbe(avatar.model),result=measure();
  assert.equal(result.uncovered,0);assert.ok(result.checked>=100);
  assert.ok(result.worst<-.001,`Socks protrude ${result.worst}m through the cuffs`);
  let shoe,original;avatar.model.traverse(m=>{if(m.material?.name==='shoes02')shoe=m;});source.scene.traverse(m=>{if(m.material?.name==='shoes02')original=m;});
  const socks=new Set(sockVertices(shoe));
  for(const attribute of ['position','normal'])for(let i=0;i<shoe.geometry.attributes[attribute].count;i++)if(!socks.has(i))for(let j=0;j<3;j++)assert.equal(shoe.geometry.attributes[attribute].getComponent(i,j),original.geometry.attributes[attribute].getComponent(i,j),'Leather and sole positions and shading stay untouched');
  for(const [geometry,positions]of before)assert.deepEqual(geometry.attributes.position.array,positions,'Cached assets are untouched');
  assert.notEqual(shoe.geometry,original.geometry);
  avatar.dispose();
});

test('fitted cuffs retain clearance through ankle bends and avatar transforms',async()=>{
  const source=await loadCharacterRig('woman-casual');
  for(const height of [1.5,1.9]) {
    const avatar=instantiateAvatar(source,{targetHeight:height}),probe=createCuffProbe(avatar.model);
    avatar.model.position.set(20,4,-10);avatar.model.rotation.y=.8;
    for(const angle of [-.5,0,.5]) {
      for(const side of ['l','r'])for(const [joint,multiplier]of [['calf',1],['foot',-1]]) {
        const bone=avatar.model.getObjectByName(`${joint}_${side}`);
        bone.quaternion.copy(avatar.rest.get(bone)).multiply(new bone.quaternion.constructor().setFromAxisAngle(avatar.axes.get(bone).x,angle*multiplier));
      }
      const result=probe();assert.equal(result.uncovered,0);assert.ok(result.worst<-.001,`${height}m / ${angle}rad: ${result.worst}m`);
    }
    const weights=avatar.model.getObjectByName('woman-casualshoes02').geometry.attributes.skinWeight;
    for(let i=0;i<weights.count;i++)assert.ok(Math.abs([0,1,2,3].reduce((sum,j)=>sum+weights.getComponent(i,j),0)-1)<1e-6);
    avatar.dispose();
  }
});
