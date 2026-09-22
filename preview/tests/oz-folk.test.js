import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ALIEN_SPECIES, alienSpeciesFor, applyAlienSpecies, GREY_SPECIES } from '../src/alien-species.js';
import { VISITOR_FORMS, formFor, visitorGreeting, createVisitorReactions } from '../src/visitor-persona.js';

test('alien anatomy templates remain deterministic', () => {
  const species=new Set(Array.from({length:24},(_,i)=>alienSpeciesFor(`local-${i}`).name));
  assert.equal(species.size,ALIEN_SPECIES.length);
  assert.equal(alienSpeciesFor('local-03'),alienSpeciesFor('local-03'));
});

test('alien anatomy follows the head without modifying source skin or sharing identity', () => {
  const model=new THREE.Group(),head=new THREE.Bone(),neck=new THREE.Bone();head.name='head';head.position.y=1.5;neck.name='neck_01';model.add(head,neck);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-0.1,1.5,0,0.1,1.5,0,0,1.7,0,-0.1,1.3,0,0.1,1.3,0,0,1.4,0],3));
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0],4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:24},(_,i)=>i%4===0?1:0),4));geometry.setIndex([0,1,2,3,4,5]);
  const original=new THREE.MeshStandardMaterial({color:'#c08060',name:'young_caucasian_male'}),skin=original.clone();
  const body=new THREE.SkinnedMesh(geometry,skin);body.bind(new THREE.Skeleton([head,neck]));model.add(body);model.updateMatrixWorld(true);
  const avatar={model,materials:new Map([[original,skin]])};
  applyAlienSpecies(avatar,'player-alien',GREY_SPECIES);
  assert.equal(geometry.index.count,6,'source geometry retains the human head');
  assert.notEqual(body.geometry,geometry);assert.equal(body.geometry.index.count,3,'instance replaces the original face rather than overlapping it');
  assert.equal(original.color.getHexString(),'c08060');
  const anatomy=head.children.find(child=>child.name==='Grey anatomy');assert.ok(anatomy);
  const before=anatomy.getWorldPosition(new THREE.Vector3());head.position.x+=2;model.updateMatrixWorld(true);
  assert.ok(Math.abs(anatomy.getWorldPosition(new THREE.Vector3()).x-before.x-2)<1e-6);
  for(const part of anatomy.children){assert.ok(part.geometry.attributes.position.array.every(Number.isFinite));assert.equal(part.userData.localId,'player-alien');}
});

test('playable forms are exactly Alien, Witch and Jevica with a rig and a reaction', () => {
  assert.deepEqual(VISITOR_FORMS.map(form => form.id), ['alien','witch','jevica']);
  for (const form of VISITOR_FORMS) {
    assert.ok(Number.isInteger(form.avatar) && form.avatar >= 0 && form.avatar < 6, form.id);
    assert.ok(['amazed', 'startled', 'enchanted'].includes(form.reaction), form.id);
    assert.match(visitorGreeting({ id: 'local-01', indoor: false }, form.id), /Welcome to the neighborhood\.$/);
  }
  assert.equal(formFor('dorothy'), null);
  assert.equal(visitorGreeting({ id: 'local-01' }, 'visitor'), null);
  const reactions = createVisitorReactions();
  const locals = [{ id: 'local-01', position: [0, 3, 0] }];
  const [reacting] = reactions.update(locals, { position: [0, 0, 0], ground: 0, roomId: null }, 'alien', 1000);
  assert.equal(reacting?.visitorReaction.action, 'startled');
});
