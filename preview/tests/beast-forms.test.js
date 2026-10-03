import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { instantiateAvatar } from '../src/avatars.js';
import { createRomanceLook } from '../src/romance-look.js';
import { createBeastGait } from '../src/beast-gait.js';
import { createTailMotion } from '../src/tail-motion.js';
import { CHARACTERS, FORMS, LEGACY_APPEARANCES, SHARED_APPEARANCES, appearanceFor, isBeastAppearance, sharedAppearance, sharedCharacter } from '../src/shared-appearances.js';

test('every playable character offers a humanoid and a beast form in each of their styles',()=>{
  for(const character of CHARACTERS){
    assert.ok(character.name&&character.title&&character.species&&character.variants.length,character.id);
    for(const variant of character.variants){
      const looks=SHARED_APPEARANCES.filter(appearance=>appearance.character===character.id&&appearance.variant===variant.id);
      assert.deepEqual(looks.map(appearance=>appearance.form).sort(),['beast','human'],`${character.id} · ${variant.id}`);
      for(const form of FORMS){
        const appearance=appearanceFor(character.id,{variant:variant.id,form});
        assert.equal(appearance.form,form);assert.equal(appearance.variant,variant.id);
        assert.equal(isBeastAppearance(appearance.id),form==='beast');
        assert.match(appearance.role,form==='beast'?/· beast$/:/· humanoid$/);
      }
    }
  }
  assert.equal(SHARED_APPEARANCES.length,CHARACTERS.reduce((total,character)=>total+character.variants.length*FORMS.length,0));
  for(const appearance of SHARED_APPEARANCES){
    assert.ok(sharedCharacter(appearance.character)?.variants.some(variant=>variant.id===appearance.variant),appearance.id);
    assert.equal(appearance.kind==='human',appearance.form==='human',appearance.id);
  }
});

test('IDs saved before forms existed keep meaning the same look',()=>{
  const kept={jevica:['jevica','human'],'woman-casual':['sable','beast'],'man-casual':['rowan','beast'],'woman-tailored':['vesper','human'],
    'man-tailored':['aurel','human'],'midnight-host-wolf':['aurel','beast'],'woman-daywear':['lyra','beast'],'man-workwear':['kai','human'],
    'kai-explorer':['kai','human'],'kai-noir':['kai','human'],'forest-aristocrat':['silvan','human'],'forest-aristocrat-feminine':['silvan','human']};
  for(const [id,[character,form]] of Object.entries(kept)){
    const appearance=sharedAppearance(id);
    assert.deepEqual([appearance.id,appearance.character,appearance.form],[id,character,form]);
  }
});

test('the wolf-eared midnight host is retired and resolves to his wolf form',()=>{
  assert.equal(SHARED_APPEARANCES.some(appearance=>appearance.id==='midnight-host-hybrid'||appearance.variant==='hybrid'||appearance.kind==='wolf-hybrid'),false);
  assert.deepEqual(LEGACY_APPEARANCES,{'midnight-host-hybrid':'midnight-host-wolf'});
  assert.equal(sharedAppearance('midnight-host-hybrid').id,'midnight-host-wolf');
  assert.equal(isBeastAppearance('midnight-host-hybrid'),true);
  assert.deepEqual(SHARED_APPEARANCES.filter(appearance=>appearance.character==='aurel').map(appearance=>appearance.form),['human','beast']);
  for(const id of ['unknown','',null,undefined,'constructor','__proto__'])assert.equal(sharedAppearance(id),null,String(id));
});

test('switching person keeps the chosen form, and the style where the new person has it',()=>{
  assert.equal(appearanceFor('kai',{variant:'noir',form:'beast'}).id,'kai-noir-beast');
  assert.equal(appearanceFor('silvan',{variant:'noir',form:'beast'}).id,'forest-aristocrat-beast','an unknown style falls back to the first');
  assert.equal(appearanceFor('silvan',{variant:'feminine',form:'beast'}).id,'forest-aristocrat-feminine-beast');
  assert.equal(appearanceFor('sable',{form:'human'}).id,'sable-human');
  assert.equal(appearanceFor('rowan',{form:'flying'}).form,'human');
  assert.equal(appearanceFor('nobody'),null);
});

test('humanoid forms keep the human head; beast forms of the same style replace it and grow a tail',async()=>{
  for(const character of CHARACTERS)for(const variant of character.variants)for(const form of FORMS){
    const appearance=appearanceFor(character.id,{variant:variant.id,form});
    // Jevica's humanoid form is her authored costume, applied without a romance look.
    if(appearance.id==='jevica')continue;
    const source=await loadCharacterRig(appearance.rig??appearance.id),avatar=instantiateAvatar(source,{targetHeight:source.height,id:'player'});
    const root=new THREE.Group();root.add(avatar.model);
    const skins=[];avatar.model.traverse(mesh=>{if(mesh.isSkinnedMesh&&/^(young|middleage|old)_/.test(mesh.material?.name??''))skins.push([mesh,mesh.geometry]);});
    const look=createRomanceLook(avatar,root,appearance);
    try{
      const tail=root.getObjectByName(`${appearance.kind} tail`),face=avatar.model.getObjectByName(`${appearance.kind} face`);
      if(form==='beast'){
        assert.equal(look.beast,true,appearance.id);
        assert.ok(tail&&face?.parent?.isBone,`${appearance.id} has a sculpted head and a tail`);
        assert.ok(skins.some(([mesh,geometry])=>mesh.geometry!==geometry),`${appearance.id} trims the human head`);
      }else{
        assert.equal(look.beast,false,appearance.id);
        const tails=[];root.traverse(item=>{if(/ tail$/.test(item.name))tails.push(item.name);});
        assert.deepEqual(tails,[],`${appearance.id} has no tail`);
        assert.ok(skins.every(([mesh,geometry])=>mesh.geometry===geometry),`${appearance.id} keeps the human head`);
      }
    }finally{look.dispose();avatar.dispose();}
    assert.ok(skins.every(([mesh,geometry])=>mesh.geometry===geometry),`${appearance.id} restores the rig on dispose`);
  }
});

const settle=(gait,frames,options)=>{let pose;for(let i=0;i<frames;i++)pose=gait.prepare(1/60,options);return pose;};
const restPose=avatar=>{for(const bone of avatar.bones)bone.quaternion.copy(avatar.rest.get(bone));avatar.model.updateMatrixWorld(true);};

test('beast movement crouches, leans and lopes only while asked, and eases in and out',async()=>{
  const source=await loadCharacterRig('man-casual'),avatar=instantiateAvatar(source,{targetHeight:1.8,id:'player'});
  try{
    const gait=createBeastGait(avatar),head=avatar.model.getObjectByName('head'),chest=avatar.model.getObjectByName('spine_03');
    assert.deepEqual(gait.prepare(1/60,{active:false,speed:3.2}),{drop:0,stride:1},'off by default');
    restPose(avatar);const restHead=head.getWorldPosition(new THREE.Vector3());
    gait.apply();avatar.model.updateMatrixWorld(true);
    assert.ok(head.getWorldPosition(new THREE.Vector3()).distanceTo(restHead)<1e-9,'no posture without beast movement');
    const first=gait.prepare(1/60,{active:true,speed:0});
    assert.ok(first.drop>0&&gait.weight<.2,'the crouch eases in rather than snapping');
    const standing=settle(gait,60,{active:true,speed:0});
    assert.ok(gait.weight>.99);
    assert.ok(standing.drop>avatar.hipHeight*.04&&standing.drop<avatar.hipHeight*.09,`a low crouch: ${standing.drop}`);
    assert.equal(standing.stride,1,'standing keeps the ordinary stride');
    const prowl=settle(gait,90,{active:true,speed:1.4});
    assert.ok(prowl.drop>standing.drop,'the prowl sinks lower than standing');
    const lope=settle(gait,120,{active:true,speed:3.2});
    assert.ok(lope.stride>1.3&&lope.stride<=1.36,`the lope lengthens the stride: ${lope.stride}`);
    const airborne=settle(gait,60,{active:true,speed:3.2,legs:[{swing:{progress:.5,settling:false}}]});
    assert.ok(airborne.drop<lope.drop-.02,'the body rises through a swing');
    restPose(avatar);const chestRest=chest.getWorldQuaternion(new THREE.Quaternion()),headRest=head.getWorldQuaternion(new THREE.Quaternion());
    gait.apply();avatar.model.updateMatrixWorld(true);
    const leaned=head.getWorldPosition(new THREE.Vector3());
    assert.ok(leaned.z>restHead.z+.05&&leaned.y<restHead.y,'the chest carries the head forward and down');
    assert.ok(head.getWorldQuaternion(new THREE.Quaternion()).angleTo(headRest)<chest.getWorldQuaternion(new THREE.Quaternion()).angleTo(chestRest)*.6,'the neck keeps the gaze nearer level than the chest');
    const released=settle(gait,150,{active:false,speed:0});
    assert.equal(gait.weight,0);assert.deepEqual(released,{drop:0,stride:1});
  }finally{avatar.dispose();}
});

test('a beast tail lifts with speed and swings against a turn; reduced motion rests it',()=>{
  const run=(motion,until=2000)=>{const tail=createTailMotion();let pose;for(let now=0;now<=until;now+=16)pose=tail.pose(now,{motion});return pose;};
  const idle=run(null),straight=run({beast:true,speed:1,turn:0}),turning=run({beast:true,speed:1,turn:2}),lope=run({beast:true,speed:3.2,turn:0});
  const sway=Math.sin(2000*.0011+.8)*.08;
  assert.ok(Math.abs(idle.yaw-Math.sin(2000*.0015)*.16)<1e-12,'an idle tail keeps the original sway');
  assert.ok(Math.abs(idle.pitch-sway)<1e-12);
  assert.ok(lope.pitch-sway>.45,'a lope streams the tail out behind');
  assert.ok(straight.pitch-sway>.2&&straight.pitch<lope.pitch);
  assert.ok(turning.yaw<straight.yaw-.2,'the tail swings against the turn');
  assert.deepEqual(createTailMotion().pose(100,{reducedMotion:true,motion:{beast:true,speed:3}}),{yaw:0,pitch:0});
});
