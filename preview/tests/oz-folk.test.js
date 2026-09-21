import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OZ_FOLK, ozFolkFor, applyOzFolk } from '../src/oz-folk.js';
import { VISITOR_FORMS, formFor, visitorGreeting, createVisitorReactions } from '../src/visitor-persona.js';

test('every resident is assigned one of the peoples of Oz, deterministically', () => {
  const ids = Array.from({ length: 24 }, (_, i) => `local-${String(i).padStart(2, '0')}`);
  const names = new Set(ids.map(id => ozFolkFor(id).name));
  for (const name of names) assert.ok(OZ_FOLK.some(folk => folk.name === name));
  assert.ok(names.size >= 4, `the district mixes the countries: ${[...names]}`);
  assert.equal(ozFolkFor('local-03'), ozFolkFor('local-03'));
});

test('a folk hat follows the head and only the suit is recoloured', () => {
  const model = new THREE.Group(), head = new THREE.Bone(); head.name = 'head'; head.position.y = 1.5; model.add(head);
  const skin = new THREE.MeshStandardMaterial({ color: '#c08060', name: 'young_caucasian_female' }), suit = new THREE.MeshStandardMaterial({ color: '#ffffff', name: 'female_casualsuit01' });
  const materials = new Map([[skin, skin.clone()], [suit, suit.clone()]]);
  const folk = applyOzFolk({ model, materials }, 'local-07');
  assert.equal(materials.get(skin).color.getHexString(), 'c08060');
  assert.equal(materials.get(suit).color.getHexString(), new THREE.Color(folk.color).getHexString());
  const hat = head.children.find(child => child.name === `${folk.name} hat`);
  assert.ok(hat, 'hat attached to the head bone');
  assert.ok(hat.children.length >= 2 && hat.children.every(mesh => mesh.geometry.attributes.position.array.every(Number.isFinite)));
  assert.ok(Math.abs(hat.getWorldPosition(new THREE.Vector3()).y - 1.5) < 1e-6, 'hat sits at the head');
});

test('playable forms are the Oz travellers, the witch and Jevica, each with a rig and a reaction', () => {
  assert.deepEqual(VISITOR_FORMS.map(form => form.id), ['dorothy', 'scarecrow', 'tinman', 'lion', 'witch', 'jevica']);
  for (const form of VISITOR_FORMS) {
    assert.ok(Number.isInteger(form.avatar) && form.avatar >= 0 && form.avatar < 6, form.id);
    assert.ok(['amazed', 'startled', 'enchanted'].includes(form.reaction), form.id);
    assert.match(visitorGreeting({ id: 'local-01', indoor: false }, form.id), /Welcome to the neighborhood\.$/);
  }
  assert.equal(formFor('alien'), null);
  assert.equal(visitorGreeting({ id: 'local-01' }, 'visitor'), null);
  const reactions = createVisitorReactions();
  const locals = [{ id: 'local-01', position: [0, 3, 0] }];
  const [reacting] = reactions.update(locals, { position: [0, 0, 0], ground: 0, roomId: null }, 'lion', 1000);
  assert.equal(reacting?.visitorReaction.action, 'startled');
});
