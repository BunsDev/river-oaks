import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLikenessFixture } from '../character-likeness-fixture.js';
import { inspectLikenessFixture } from '../character-likeness-validation.js';
import { createLikenessQuarantine, LIKENESS_CONSENT_POLICY } from '../character-likeness-quarantine.js';

function changed(edit) {
  const original = makeLikenessFixture();
  const length = original.readUInt32LE(12);
  const gltf = JSON.parse(original.subarray(20, 20 + length));
  const binary = Buffer.from(original.subarray(28 + length));
  edit(gltf, binary);
  const json = Buffer.from(JSON.stringify(gltf));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32);
  json.copy(padded);
  const bytes = Buffer.alloc(28 + padded.length + binary.length);
  original.copy(bytes, 0, 0, 20);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12);
  padded.copy(bytes, 20);
  bytes.writeUInt32LE(binary.length, 20 + padded.length);
  bytes.writeUInt32LE(0x004e4942, 24 + padded.length);
  binary.copy(bytes, 28 + padded.length);
  return bytes;
}
const options = { enabled: true, environment: { NODE_ENV: 'test' } };
const consent = { policy: LIKENESS_CONSENT_POLICY, adult: true, selfLikeness: true, processing: true, display: true };

test('synthetic geometry passes the reused skeleton and embedded texture audit', () => {
  const report = inspectLikenessFixture(makeLikenessFixture());
  assert.equal(report.triangles, 1);
  assert.equal(report.joints, 53);
  assert.equal(report.textures[0].width, 1);
  assert.equal(report.textures[0].height, 1);
  assert.equal(report.bounds.max[1], 1.5);
});

for (const [name, edit, reason] of [
  ['polygon budget', g => { g.accessors[3].count = 387; }, /polygon/],
  ['texture budget', (g,b) => { const v=g.bufferViews[g.images[0].bufferView]; b.writeUInt16LE(4097,v.byteOffset+26); }, /texture/],
  ['bone compatibility', g => { g.nodes[0].name='wrong'; }, /skeleton/],
  ['external buffer URL', g => { g.buffers[0].uri='https://invalid.example/asset'; }, /field|URL/],
  ['external image URL', g => { g.images[0].uri='file:\/\/private'; }, /field|URL/],
  ['script', g => { g.nodes[0].script='alert(1)'; }, /field/],
  ['shader', g => { g.materials[0].extensions={KHR_techniques_webgl:{}}; }, /field/],
  ['scene cycle', g => { g.nodes[1].children=[0]; }, /scene/],
  ['disconnected scene', g => { g.scenes[0].nodes=[]; }, /scene/],
  ['duplicate root', g => { g.scenes[0].nodes.push(0); }, /scene/],
  ['extra scene', g => { g.scenes.push({nodes:[0]}); }, /scene/],
  ['non-finite transform encoding', g => { g.nodes[0].scale=[0,1,1]; }, /transform/],
  ['morph', g => { g.meshes[0].primitives[0].targets=[{POSITION:0}]; }, /field/],
]) test(`rejects ${name} before fixture digest admission`, () => {
  assert.throws(() => inspectLikenessFixture(changed(edit)), reason);
});

test('size, malformed bytes and valid-but-unallowlisted geometry are refused', () => {
  assert.throws(() => inspectLikenessFixture(Buffer.alloc(65537)), /size/);
  assert.throws(() => inspectLikenessFixture(Buffer.from('not a GLB')), /GLB/);
  assert.throws(() => inspectLikenessFixture(changed(g => { g.nodes[0].translation=[0.1,0,0]; })), /allowlist/);
});

test('owner cannot publish before separate moderation; only signed allowlisted revision leaves', async () => {
  const { intake, reviewer } = createLikenessQuarantine(options);
  const record = await intake.submit('fixture-alice', makeLikenessFixture(), consent);
  assert.equal(record.state, 'quarantined');
  assert.equal('bytes' in record, false);
  assert.throws(() => intake.publish('fixture-alice', record.id), /not_approved/);
  reviewer.approve('fixture-alice', record.id);
  const revision = intake.publish('fixture-alice', record.id);
  assert.equal(revision.fixture, 'synthetic-human-v1');
  assert.ok(revision.signature.length > 40);
  assert.equal(intake.resolve('fixture-alice', revision).kind, 'fixture');
  assert.equal(intake.resolve('fixture-alice', {...revision, sha256:'0'.repeat(64)}).kind, 'fallback');
  assert.equal('ownerId' in revision, false);
});

test('caller mutation cannot replace quarantined bytes and rejected bytes never become records', async () => {
  const { intake, reviewer } = createLikenessQuarantine(options);
  const bytes=makeLikenessFixture();
  const pending=intake.submit('fixture-alice',bytes,consent);
  bytes.fill(0);
  const record=await pending;
  reviewer.approve('fixture-alice',record.id);
  assert.equal(intake.resolve('fixture-alice',intake.publish('fixture-alice',record.id)).kind,'fixture');
  await assert.rejects(intake.submit('fixture-alice',Buffer.alloc(40),consent), /GLB/);
});

test('synthetic GLB declares WebP without fallback and supplies bounded texture coordinates', () => {
  const bytes=makeLikenessFixture(),length=bytes.readUInt32LE(12);
  const gltf=JSON.parse(bytes.subarray(20,20+length));
  assert.deepEqual(gltf.extensionsUsed,['EXT_texture_webp']);
  assert.deepEqual(gltf.extensionsRequired,['EXT_texture_webp']);
  assert.deepEqual(gltf.textures,[{extensions:{EXT_texture_webp:{source:0}}}]);
  const primitive=gltf.meshes[0].primitives[0];
  const position=gltf.accessors[primitive.attributes.POSITION];
  assert.deepEqual(position.min,[0,0,0]);
  assert.deepEqual(position.max,[1,1.5,0]);
  const uv=gltf.accessors[primitive.attributes.TEXCOORD_0];
  assert.equal(uv.count,3);
  assert.equal(uv.type,'VEC2');
  const view=gltf.bufferViews[uv.bufferView],binary=bytes.subarray(28+length);
  assert.deepEqual(Array.from({length:6},(_,i)=>binary.readFloatLE(view.byteOffset+i*4)),[0,0,1,0,0,1]);
});

for(const [name,edit] of [
  ['undeclared WebP',g=>{delete g.extensionsRequired;}],
  ['unapproved extension',g=>{g.extensionsUsed.push('KHR_techniques_webgl');}],
  ['missing UVs',g=>{delete g.meshes[0].primitives[0].attributes.TEXCOORD_0;}],
])test(`fixture rejects ${name}`,()=>{
  assert.throws(()=>inspectLikenessFixture(changed(edit)),/extension|texture coordinates/);
});
