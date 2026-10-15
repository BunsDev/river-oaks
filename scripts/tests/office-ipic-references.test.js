import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildPacket, validateReferenceIndex, validateAssetManifest, verifyKitChecksums, readPacket, KIT_TO_THREE, THREE_AXES, REPO_REFERENCES, REPO_ASSETS } from '../office-ipic-reference-index.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const SHA = '0123456789abcdef0123456789abcdef01234567';
const hex = text => createHash('sha256').update(text).digest('hex');

// A scratch repository plus a scratch kit: the generator and the validators are
// exercised on bytes the test controls, then on the committed packet.
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'office-ipic-'));
  const repo = join(dir, 'repo'), kit = join(dir, 'kit'), review = join(dir, 'review');
  mkdirSync(repo); execFileSync('git', ['init', '-q', repo]);
  for (const [path] of [...REPO_REFERENCES, ...REPO_ASSETS]) { mkdirSync(join(repo, path, '..'), { recursive: true }); writeFileSync(join(repo, path), `fixture ${path}\n`); }
  writeFileSync(join(repo, 'assets/ipic/references/manifest.json'), JSON.stringify({ images: [{ file: 'a.jpg', bytes: 10 }, { file: 'b.jpg', bytes: 20 }], license: 'fixture' }));
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '-A']);
  execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'fixture']);
  const head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  for (const d of ['models', 'materials', 'reference', 'validation']) mkdirSync(join(kit, d), { recursive: true });
  const files = { 'README.md': '# kit\n', 'layout.json': '{"version":1}', 'models/desk.glb': 'glb-desk', 'models/chair.glb': 'glb-chair', 'materials/stone-basecolor.png': 'png1', 'materials/stone-orm.png': 'png2', 'reference/plan.png': 'plan-png', 'reference/plan.svg': 'plan-svg', 'validation/spatial-validation.json': '{"result":"pass"}' };
  for (const [rel, body] of Object.entries(files)) writeFileSync(join(kit, rel), body);
  writeFileSync(join(kit, 'checksums.sha256'), Object.entries(files).map(([rel, body]) => `${hex(body)}  ${rel}`).join('\n') + '\n');
  writeFileSync(join(kit, 'asset-manifest.json'), JSON.stringify({ gltfAxes: THREE_AXES, assets: [
    { name: 'desk', file: 'models/desk.glb', bytes: 8, triangles: 200, meshNodes: 2, bounds: [[-2, 0, -1], [2, 0.8, 1]], stage: 'blockout' },
    { name: 'chair', file: 'models/chair.glb', bytes: 9, triangles: 9000, meshNodes: 3, bounds: [[-0.4, 0, -0.4], [0.4, 1.2, 0.4]], stage: 'blockout' }] }));
  writeFileSync(join(kit, 'asset-catalog.csv'), 'id,target_dimensions,lod0_triangle_target,proxy_file\ndesk,4 x 1.6 x 0.76 m,12000,models/desk.glb\nchair,0.8 x 0.8 x 1.2 m,8000,models/chair.glb\n');
  mkdirSync(review); writeFileSync(join(review, 'assessment.md'), 'review\n'); writeFileSync(join(review, '01-arrival.png'), 'capture');
  const loose = join(dir, 'README copy.md'); writeFileSync(loose, '# kit\n');
  return { dir, repo, kit, review, head, loose, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('the kit axis mapping is the single (x,d,h) -> [x,h,-d] conversion', () => {
  assert.deepEqual(KIT_TO_THREE([1, 2, 3]), [1, 3, -2]);
  assert.deepEqual(KIT_TO_THREE([-12, 18, 3.8]), [-12, 3.8, -18]);
  assert.equal(THREE_AXES, 'x east / y up / z south');
});

test('a scratch kit and repository build a packet that validates, links duplicates and flags the over-budget proxy', t => {
  const s = scratch(); t.after(s.cleanup);
  const { referenceIndex, assetManifest } = buildPacket({ root: s.repo, kitDir: s.kit, scaleReviewDir: s.review, looseFiles: [s.loose], sourceRevision: s.head, now: new Date('2026-10-14T20:00:00Z') });
  assert.equal(referenceIndex.kitChecksums.ok, 9); assert.equal(referenceIndex.kitChecksums.listed, 9);
  assert.equal(referenceIndex.counts.missing, 2, 'the two handoff briefs stay listed as missing');
  assert.equal(referenceIndex.counts.repo, REPO_REFERENCES.length);
  const dup = referenceIndex.entries.find(e => e.id === 'loose-readme-copy-md');
  assert.equal(dup.duplicateOf, 'kit-readme-md', 'identical bytes point at the first copy');
  const plan = referenceIndex.entries.filter(e => /^kit-reference-plan/.test(e.id)).map(e => e.id).sort();
  assert.deepEqual(plan, ['kit-reference-plan-png', 'kit-reference-plan-svg'], 'png and svg of the same plan keep distinct ids');
  const a = validateReferenceIndex(referenceIndex, { root: s.repo });
  assert.deepEqual(a.problems, []); assert.deepEqual(a.drift, []);
  const b = validateAssetManifest(assetManifest, { root: s.repo, referenceIndex });
  assert.deepEqual(b.problems, ['kit-model-chair: 9000 triangles exceed the LOD0 target 8000']);
  const desk = assetManifest.assets.find(x => x.id === 'kit-model-desk');
  assert.equal(desk.reference, 'kit-models-desk-glb'); assert.equal(desk.sha256, hex('glb-desk')); assert.equal(desk.lod0Target, 12000);
  const photos = assetManifest.assets.find(x => x.id === 'repo-ipic-reference-photographs');
  assert.equal(photos.count, 2); assert.equal(photos.bytes, 30);
});

test('a tampered kit file is reported by the recorded checksum verification', t => {
  const s = scratch(); t.after(s.cleanup);
  writeFileSync(join(s.kit, 'models/desk.glb'), 'glb-desk-edited');
  const kit = verifyKitChecksums(s.kit);
  assert.equal(kit.ok, 8); assert.deepEqual(kit.mismatched, ['models/desk.glb']);
  const { referenceIndex } = buildPacket({ root: s.repo, kitDir: s.kit, sourceRevision: s.head });
  assert.deepEqual(validateReferenceIndex(referenceIndex, { root: s.repo }).problems, ['kit checksums: 8/9 ok, 1 mismatched, 0 missing']);
});

test('the validators reject duplicate ids, bad revisions, wrong axes, unlisted repo files and dangling references', t => {
  const s = scratch(); t.after(s.cleanup);
  const { referenceIndex, assetManifest } = buildPacket({ root: s.repo, kitDir: s.kit, sourceRevision: s.head });
  const broken = structuredClone(referenceIndex);
  broken.sourceRevision = 'abc'; broken.threeAxes = 'z up';
  broken.entries.push({ ...broken.entries[0] });
  broken.entries.push({ id: 'repo-ghost-md', kind: 'document', group: 'repo', location: 'repo', availability: 'committed', path: 'docs/ghost.md', bytes: 1, sha256: hex('x'), blob: SHA });
  broken.entries.push({ id: 'missing-brief', kind: 'document', location: 'missing', availability: 'committed', path: 'brief.md' });
  const { problems } = validateReferenceIndex(broken, { root: s.repo });
  for (const expected of ['sourceRevision is not a full SHA', 'threeAxes disagrees with the agreed convention', `${broken.entries[0].id}: duplicate id`, 'repo-ghost-md: docs/ghost.md is not in the repository', 'missing-brief: missing entry must be unavailable and say where it was searched']) assert.ok(problems.includes(expected), `${expected} in ${problems.join(' | ')}`);
  const manifest = structuredClone(assetManifest);
  manifest.assets[0].axes = 'z up'; manifest.assets[0].reference = 'kit-nowhere'; manifest.assets[0].bounds = [[0, 0, 0], [-1, 1, 1]];
  manifest.sourceRevision = SHA;
  const m = validateAssetManifest(manifest, { root: s.repo, referenceIndex });
  for (const expected of ['sourceRevision differs from reference-index', `${manifest.assets[0].id}: kit model axes "z up" are not ${THREE_AXES}`, `${manifest.assets[0].id}: reference kit-nowhere not in reference-index`, `${manifest.assets[0].id}: bounds min above max`]) assert.ok(m.problems.includes(expected), `${expected} in ${m.problems.join(' | ')}`);
});

test('a changed repository file is drift, not a broken packet', t => {
  const s = scratch(); t.after(s.cleanup);
  const { referenceIndex } = buildPacket({ root: s.repo, kitDir: s.kit, sourceRevision: s.head });
  writeFileSync(join(s.repo, 'docs/offices.md'), 'edited later\n');
  const { problems, drift } = validateReferenceIndex(referenceIndex, { root: s.repo });
  assert.deepEqual(problems, []);
  assert.deepEqual(drift, [`repo-offices-md: docs/offices.md changed since ${s.head.slice(0, 7)}`]);
});

test('the committed office-ipic packet validates against this repository', () => {
  const { referenceIndex, assetManifest } = readPacket(join(ROOT, 'docs/design/office-ipic'));
  const a = validateReferenceIndex(referenceIndex, { root: ROOT });
  const b = validateAssetManifest(assetManifest, { root: ROOT, referenceIndex });
  assert.deepEqual([...a.problems, ...b.problems], []);
  assert.ok(referenceIndex.entries.length >= 140, `${referenceIndex.entries.length} references`);
  assert.equal(referenceIndex.kitChecksums.ok, 71, 'the supplied kit verified 71/71 when indexed');
  assert.equal(referenceIndex.entries.filter(e => e.location === 'missing').length, 2, 'both handoff briefs are recorded as not found');
  assert.ok(referenceIndex.entries.every(e => e.location !== 'external' || /^~\//.test(e.path)), 'external paths are home-relative');
  assert.equal(assetManifest.assets.filter(a => a.source === 'kit' && a.kind === 'model').length, 22);
  for (const line of [...a.drift, ...b.drift]) console.log(`drift: ${line}`);
});
