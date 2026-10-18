import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { characterDefinitionFor, validateCharacterDefinition, migrateCharacterAppearance, characterAppearanceFor } from '../src/character-definition.js';
import { SHARED_APPEARANCES, JEVICA_OWNER_USER_IDS, canUseAppearance } from '../src/shared-appearances.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { instantiateAvatar } from '../src/avatars.js';
import { createRomanceLook } from '../src/romance-look.js';

test('every permitted authored ID round trips without changing identity or permissions', () => {
  for (const ownerId of ['fixture-owner',...JEVICA_OWNER_USER_IDS]) for (const look of SHARED_APPEARANCES) {
    if (!canUseAppearance(ownerId,look.id)) { assert.throws(() => characterDefinitionFor(ownerId,look.id)); continue; }
    const definition = characterDefinitionFor(ownerId,look.id,{revision:3});
    assert.deepEqual(validateCharacterDefinition(JSON.parse(JSON.stringify(definition)),{ownerId}),{ok:true,definition});
    assert.equal(characterAppearanceFor(definition,ownerId),look);
  }
});

test('malformed, foreign, future and privilege-bearing definitions fail closed', () => {
  const base = characterDefinitionFor('fixture-owner','sable-human');
  for (const change of [{ownerId:'other'},{schemaVersion:99},{revision:-1},{revision:1.5},{revision:Number.MAX_SAFE_INTEGER+1},{appearanceId:'jevica'},{rig:'jevica-beast'},{form:'beast'},{parameters:{height:200}},{palette:'#fff'},{hair:'file:///tmp/x'},{outfit:'unlicensed'},{attachments:['wings']},{assets:[{url:'https://example.com/a.glb'}]},{provenance:{kind:'generated'}},{canFly:true}]) {
    assert.equal(validateCharacterDefinition({...base,...change},{ownerId:'fixture-owner'}).ok,false,JSON.stringify(change));
  }
  for (const value of [null,[],{},Object.create(base)]) assert.equal(validateCharacterDefinition(value,{ownerId:'fixture-owner'}).ok,false);
  assert.equal(validateCharacterDefinition(base).ok,false);
  assert.equal(characterAppearanceFor(base,'other'),null);
  const result=validateCharacterDefinition(base,{ownerId:'fixture-owner'});result.definition.parameters.bad=true;
  assert.deepEqual(base.parameters,{},'validation returns independent owned state');
});

test('every playable rig is pinned to its shipped bytes, and an unpinned rig cannot form a definition', async () => {
  const { CHARACTER_ASSETS, characterAssetFor } = await import('../src/character-assets.js');
  for (const look of SHARED_APPEARANCES) assert.ok(Object.hasOwn(CHARACTER_ASSETS, look.rig ?? look.id), `${look.id}: rig ${look.rig ?? look.id} has no pin`);
  // woman-casual.glb ships in the repository but no look uses it as a rig, so it has no pin.
  assert.throws(() => characterAssetFor('woman-casual'), /Unpinned character rig/);
  assert.deepEqual(characterAssetFor('jevica'), CHARACTER_ASSETS.jevica);
  assert.notEqual(characterAssetFor('jevica'), CHARACTER_ASSETS.jevica, 'callers get their own copy');
  for (const id of ['__proto__', 'constructor', '', undefined]) assert.throws(() => characterAssetFor(id), /Unpinned character rig/);
});

test('legacy read migration preserves aliases and uses permission-safe defaults', () => {
  assert.equal(migrateCharacterAppearance('fixture-owner','midnight-host-hybrid').appearanceId,'man-tailored');
  for (const id of ['jevica','unknown','__proto__',undefined]) assert.equal(migrateCharacterAppearance('fixture-owner',id).appearanceId,'sable-human');
  assert.equal(migrateCharacterAppearance(JEVICA_OWNER_USER_IDS[0],'jevica').appearanceId,'jevica');
  assert.throws(() => migrateCharacterAppearance('', 'sable-human'));
});

for (const id of ['sable-human']) test(`definition loads the actual ${id} rig and authored form`, async () => {
  const definition=characterDefinitionFor('fixture-owner',id),look=characterAppearanceFor(definition,'fixture-owner');
  const source=await loadCharacterRig(definition.rig),avatar=instantiateAvatar(source,{targetHeight:source.height,id:'player'});
  const root=new THREE.Group();root.add(avatar.model);
  const outfit=createRomanceLook(avatar,root,look);
  try {
    root.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3());
    assert.ok(size.toArray().every(Number.isFinite));assert.ok(size.y>1 && size.y<3);
    assert.equal(definition.form,'human');
    assert.equal(Boolean(root.getObjectByName('fox tail')),false);
    assert.ok(avatar.bones.length>0);
  } finally { outfit.dispose();avatar.dispose(); }
});

test('pinned rig hashes match shipped bytes and definitions do not share mutable asset data', async () => {
  const { readFile }=await import('node:fs/promises'),{createHash}=await import('node:crypto');
  const {CHARACTER_ASSETS}=await import('../src/character-assets.js');
  for (const asset of Object.values(CHARACTER_ASSETS)) {
    const bytes=await readFile(new URL(`../public/assets/characters/${asset.id}.glb`,import.meta.url));
    assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  }
  const first=characterDefinitionFor('fixture-owner','sable-human');first.assets[0].sha256='bad';
  assert.equal(validateCharacterDefinition(first,{ownerId:'fixture-owner'}).ok,false);
  assert.notEqual(characterDefinitionFor('fixture-owner','sable-human').assets[0].sha256,'bad');
});
