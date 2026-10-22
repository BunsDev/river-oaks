import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseGlb} from '../../scripts/add-facial-targets.mjs';
import {characterAssetFor} from '../src/character-assets.js';

for (const id of ['man-realistic-casual','woman-realistic-tailored']) test(`${id} is pinned with fitted human face surfaces and expressive targets`, async () => {
  const pin=characterAssetFor(id);
  const bytes=await readFile(new URL(`../public/assets/characters/${id}.glb`,import.meta.url));
  assert.equal(bytes.length,pin.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256);
  const {json}=parseGlb(bytes);
  const names=json.meshes.map(mesh=>mesh.name).join(' ');
  assert.equal(names.includes('low-poly'),false,'only the fitted high-poly eye mesh is exported');
  for (const surface of ['high-poly','eyebrow001','eyelashes01']) assert.ok(names.includes(surface),`missing ${surface}`);
  for(const mesh of json.meshes) assert.ok((mesh.weights??[]).every(value=>value===0), `${mesh.name}: exported expression weights must be neutral`);
  const morphs=new Set(json.meshes.flatMap(mesh=>mesh.extras?.targetNames??[]));
  for (const target of ['eyeBlinkLeft','eyeBlinkRight','mouthSmileLeft','mouthSmileRight','browInnerUp','viseme_aa']) assert.ok(morphs.has(target),`missing ${target}`);
  assert.ok(json.skins.some(skin=>skin.joints.length===53),'shared game-engine rig');
  const receipt=JSON.parse(await readFile(new URL(`../public${pin.receipt}`,import.meta.url)));
  assert.equal(receipt.license,'CC0-1.0');
  assert.equal(receipt.files.find(file=>file.id===id)?.sha256,pin.sha256);
});

test('fixture receipt identifies transitive eye assets and executable generators',async()=>{
 const receipt=JSON.parse(await readFile(new URL('../public/assets/characters/realistic-humans.sources.json',import.meta.url)));
 for(const file of ['assets/eyes/materials/brown.mhmat','assets/eyes/materials/brown_eye.png'])assert.match(receipt.inputs[file],/^[a-f0-9]{64}$/);
 for(const file of ['build_realistic_humans.py','build_characters.py','build_facial_candidates.py','character_build_inputs.py']){
  const bytes=await readFile(new URL(`../../scripts/${file}`,import.meta.url));
  assert.equal(receipt.generatorInputs[`scripts/${file}`],createHash('sha256').update(bytes).digest('hex'));
 }
 assert.match(receipt.blenderBinarySha256,/^[a-f0-9]{64}$/);
 assert.ok(Object.keys(receipt.toolInputs).some(file=>file.endsWith('humanservice.py')));
});
