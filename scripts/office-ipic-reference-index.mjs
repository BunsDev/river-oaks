#!/usr/bin/env node
// Builds and validates the design-side packet for the office + IPIC round
// (#360, G0): docs/design/office-ipic/reference-index.json and
// asset-manifest.json. Every entry records where the bytes are (repo, an
// external folder on this machine, or nowhere found), their SHA-256 and size,
// provenance and approval state. The generator never copies external bytes
// into the repository; importing the kit is a separate, recorded decision.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PACKET = 'office-ipic';
export const SCHEMA_VERSION = 1;
export const KINDS = ['document', 'data', 'source', 'model', 'texture', 'reference-image', 'capture', 'script', 'receipt'];
export const LOCATIONS = ['repo', 'external', 'missing'];
export const AVAILABILITY = ['committed', 'local-only', 'unavailable'];
// The one axis convention every packet file states for Three.js: kit (x,d,h)
// becomes [x,h,-d]; the kit's own manifest spells it "x east / y up / z south".
export const THREE_AXES = 'x east / y up / z south';
export const KIT_TO_THREE = ([x, d, h]) => [x, h, -d];

const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const tilde = path => { const home = homedir(); return path.startsWith(home + '/') ? '~' + path.slice(home.length) : path; };
const untilde = path => path.startsWith('~/') ? join(homedir(), path.slice(2)) : path;
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
// Keeps the extension: plan.png and plan.svg are different references.
const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name === '.DS_Store') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path)); else out.push(path);
  }
  return out;
}

function externalEntry(path, fields) {
  const st = statSync(path);
  return { ...fields, location: 'external', availability: 'local-only', path: tilde(path), bytes: st.size, sha256: sha256(path), mtime: st.mtime.toISOString().replace(/\.\d{3}Z$/, 'Z') };
}

function repoEntry(root, path, fields) {
  const full = join(root, path);
  if (!existsSync(full)) return { ...fields, location: 'missing', availability: 'unavailable', path, searched: ['repository tree'] };
  return { ...fields, location: 'repo', availability: 'committed', path, bytes: statSync(full).size, sha256: sha256(full), blob: git(root, ['rev-parse', `HEAD:${path}`]) };
}

// Parses the kit's own checksums.sha256 ("<hex>  <relative path>") and checks
// every listed file in place. The result is recorded, so the index can say the
// kit it describes was intact when it was read.
export function verifyKitChecksums(kitDir) {
  const file = join(kitDir, 'checksums.sha256');
  if (!existsSync(file)) return { file: null, listed: 0, ok: 0, mismatched: [], missing: [] };
  const result = { file: tilde(file), listed: 0, ok: 0, mismatched: [], missing: [] };
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim()); if (!m) continue;
    result.listed++;
    const path = join(kitDir, m[2]);
    if (!existsSync(path)) result.missing.push(m[2]);
    else if (sha256(path) === m[1]) result.ok++; else result.mismatched.push(m[2]);
  }
  return result;
}

const KIT_KIND = path => /\.glb$/.test(path) ? 'model' : /materials\/.*\.png$/.test(path) ? 'texture' : /reference\/.*\.(png|svg)$/.test(path) ? 'reference-image' : /\.(mjs|js|py|html)$/.test(path) ? 'script' : /validation\/.*\.json$/.test(path) ? 'receipt' : /\.(json|csv|sha256)$/.test(path) ? 'data' : 'document';
const REVIEW_KIND = path => /\.png$/.test(path) ? 'capture' : /\.(mjs|html)$/.test(path) ? 'script' : /\.json$/.test(path) ? 'receipt' : 'document';

// What the repository already holds for this round, with why it matters.
export const REPO_REFERENCES = [
  ['docs/offices.md', 'document', 'Current office behaviour: lobby, arrival, 9 x 7 m room, desk, authority'],
  ['docs/ipic-interior.md', 'document', 'IPIC photo-guided reconstruction: factual vs inferred, assets, review'],
  ['docs/superpowers/specs/2026-10-13-ipic-photo-interior-design.md', 'document', 'IPIC design spec (delivered in #343)'],
  ['docs/superpowers/plans/2026-10-13-ipic-photo-interior.md', 'document', 'IPIC implementation ledger'],
  ['docs/superpowers/plans/2026-10-11-luxe-interiors-office.md', 'document', 'Office art pass on the measured 9 x 7 m plan (Val approved 2026-10-11)'],
  ['docs/superpowers/plans/2026-10-11-workplace-room-envelope.md', 'document', 'How the avatar envelope was measured'],
  ['docs/superpowers/plans/2026-10-13-office-arrival-refinement.md', 'document', 'Arrival sequence and lobby evidence (#345)'],
  ['docs/level-design/workplace-coworking-fixture/avatar-envelope.json', 'data', 'Measured rest-pose bounds of all 22 shared appearances'],
  ['assets/ipic/references/manifest.json', 'data', 'SHA-256 index of the 44 user-supplied IPIC photographs'],
  ['docs/ipic-review/review.json', 'receipt', 'IPIC material review: five photo views, calls and triangles'],
  ['docs/ipic-review/visit.json', 'receipt', 'IPIC software visit: escalators, recliner, exit'],
  ['docs/ipic-review/blender.json', 'receipt', 'IPIC Blender export receipt'],
  ['docs/ipic-review/reception.png', 'capture', 'IPIC review view T1 candidate'],
  ['docs/ipic-review/mural.png', 'capture', 'IPIC review view'],
  ['docs/ipic-review/lounge.png', 'capture', 'IPIC review view T2 candidate'],
  ['docs/ipic-review/bar.png', 'capture', 'IPIC review view T2 candidate'],
  ['docs/ipic-review/auditorium.png', 'capture', 'IPIC review view T3 candidate'],
  ['preview/src/office-contract.js', 'source', 'OFFICE_ROOM, OFFICE_SPAWN, OFFICE_SPEED, officeFree, officeSegmentFree'],
  ['preview/src/workplace-room.js', 'source', 'planWorkplaceRoom 9 x 7 m, AVATAR_ENVELOPE, validateRoomPlan, findRoute'],
  ['preview/src/office-scene.js', 'source', 'Office scene on the shared renderer; first-person camera at [x, 1.68, -d]'],
  ['preview/src/office-arrival-model.js', 'source', 'ARRIVAL timings and lift dimensions, officeElevation 24.3 m'],
  ['preview/src/office-desk-contract.js', 'source', 'Private desk limits'],
  ['preview/src/workplace-contract.js', 'source', 'STATION_IDS station-1/station-2: logical companion capacity'],
  ['preview/src/ipic-plan.js', 'source', 'IPIC_FLIGHTS, IPIC_CAMERAS, ipicFloor, configureIpicRoom, ipicSeatSites'],
  ['preview/src/ipic-interior.js', 'source', 'buildIpicInterior: the executable IPIC geometry master'],
  ['preview/src/ipic-materials.js', 'source', 'IPIC finishes and photographic textures'],
  ['server/offices.js', 'source', 'Authoritative office command: grants, visits, speed budget, swept collision, checkpoint v6'],
  ['scripts/export-ipic.mjs', 'script', 'IPIC GLB export from the JS master'],
];

export const REPO_ASSETS = [
  ['preview/public/assets/ipic/ipic-interior.glb', 'model', 'IPIC metre-scale game mesh exported from the JS master', '+X across frontage, +Y up, -Z into venue'],
  ['assets/ipic/ipic-interior.blend', 'model', 'IPIC editable Blender handoff generated from the JS master', 'Blender Z up, +Y into venue'],
  ['preview/public/assets/characters/jevica.glb', 'model', 'Jevica playable appearance (MPFB/MakeHuman CC0 system assets)', 'glTF'],
  ['preview/public/assets/characters/speech/jevica.glb', 'model', 'Jevica speech-rig appearance', 'glTF'],
  ['preview/public/assets/characters/jevica-portrait.png', 'reference-image', 'Jevica portrait used by the UI', null],
  ['preview/public/assets/characters/jevica.sources.json', 'data', 'Jevica generator parameters, license and SHA-256', null],
];

// Files the handoff named that no search found; they stay listed so the gap is
// explicit instead of invented.
export const MISSING_SOURCES = [
  ['typesafe-place-coding-familiar-handoff.md', 'Coding familiar handoff C0-C5 named by #359'],
  ['typesafe-place-design-familiar-handoff.md', 'Design familiar handoff D0-D4 named by #359'],
];

export function buildPacket({ root, kitDir, scaleReviewDir, looseFiles = [], sourceRevision, now = new Date() }) {
  const entries = [];
  const add = e => { entries.push(e); return e; };
  const KIT_PROVENANCE = 'Standalone kit supplied 2026-10-13; README: reference images generated from Val’s approved office direction; geometry, materials, prompts and prototype source authored for the kit; Three.js MIT.';
  const KIT_APPROVAL = 'Direction approved per kit README; publication of these bytes in the public repository has no recorded approval.';
  const kit = kitDir && existsSync(kitDir) ? verifyKitChecksums(kitDir) : null;
  if (kitDir && existsSync(kitDir)) for (const path of walk(kitDir)) {
    const rel = relative(kitDir, path);
    add(externalEntry(path, { id: `kit-${slug(rel)}`, kind: KIT_KIND(rel), group: 'kit', relativePath: rel, provenance: KIT_PROVENANCE, approval: KIT_APPROVAL }));
  }
  if (scaleReviewDir && existsSync(scaleReviewDir)) for (const path of walk(scaleReviewDir)) {
    const rel = relative(scaleReviewDir, path);
    add(externalEntry(path, { id: `review-${slug(rel)}`, kind: REVIEW_KIND(rel), group: 'scale-review', relativePath: rel, provenance: 'Cody’s 2026-10-13/14 prototype scale review of the kit walkthrough (automated Chromium traversal, screenshots, plans).', approval: 'Review material; proposals are not approved layouts.' }));
  }
  for (const path of looseFiles) if (existsSync(path)) add(externalEntry(path, { id: `loose-${slug(basename(path))}`, kind: /\.png$/.test(path) ? 'reference-image' : /\.zip$/.test(path) ? 'data' : 'document', group: 'loose', provenance: 'Loose copy next to the kit in the same download folder.', approval: KIT_APPROVAL }));
  for (const [path, kind, use] of REPO_REFERENCES) add(repoEntry(root, path, { id: `repo-${slug(path.replace(/^(docs|preview\/src|server|scripts|assets)\//, ''))}`, kind, group: 'repo', use }));
  for (const [name, use] of MISSING_SOURCES) add({ id: `missing-${slug(name)}`, kind: 'document', group: 'handoff', location: 'missing', availability: 'unavailable', path: name, use, searched: ['git ls-files', 'grep -r across the repository', 'mdfind over the home folder'] });
  // Identical bytes in two places are linked, so a reviewer opens one file.
  const byHash = new Map();
  for (const e of entries) if (e.sha256) { if (byHash.has(e.sha256)) e.duplicateOf = byHash.get(e.sha256); else byHash.set(e.sha256, e.id); }
  const referenceIndex = {
    packet: PACKET, schemaVersion: SCHEMA_VERSION, sourceRevision, reconciledAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    threeAxes: THREE_AXES, kitToThree: '(x,d,h) -> [x,h,-d]',
    kitChecksums: kit, counts: countBy(entries, e => e.location), entries,
  };
  const assetManifest = buildAssetManifest({ root, kitDir, entries, sourceRevision, now });
  return { referenceIndex, assetManifest };
}

const countBy = (items, key) => items.reduce((acc, item) => { const k = key(item); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});

function readCatalog(kitDir) {
  const file = join(kitDir, 'asset-catalog.csv');
  if (!existsSync(file)) return new Map();
  const [, ...rows] = readFileSync(file, 'utf8').trim().split('\n');
  return new Map(rows.map(row => { const [id, dims, lod0, proxy] = row.split(','); return [id, { targetDimensions: dims, lod0Target: Number(lod0), proxy }]; }));
}

export function buildAssetManifest({ root, kitDir, entries, sourceRevision, now = new Date() }) {
  const byId = new Map(entries.map(e => [e.id, e]));
  const assets = [];
  if (kitDir && existsSync(join(kitDir, 'asset-manifest.json'))) {
    const kit = JSON.parse(readFileSync(join(kitDir, 'asset-manifest.json'), 'utf8'));
    const catalog = readCatalog(kitDir);
    for (const a of kit.assets) {
      const ref = byId.get(`kit-${slug(a.file)}`);
      const budget = catalog.get(a.name);
      assets.push({ id: `kit-model-${a.name}`, kind: 'model', source: 'kit', reference: ref?.id ?? null, file: a.file, bytes: a.bytes, sha256: ref?.sha256 ?? null,
        triangles: a.triangles, meshNodes: a.meshNodes, bounds: a.bounds, axes: kit.gltfAxes, stage: a.stage,
        targetDimensions: budget?.targetDimensions ?? null, lod0Target: budget?.lod0Target ?? null, availability: ref ? 'local-only' : 'unavailable' });
    }
    for (const e of entries) if (e.group === 'kit' && e.kind === 'texture') assets.push({ id: `kit-texture-${slug(e.relativePath)}`, kind: 'texture', source: 'kit', reference: e.id, file: e.relativePath, bytes: e.bytes, sha256: e.sha256, colorSpace: /basecolor/.test(e.relativePath) ? 'sRGB' : 'linear', availability: 'local-only', note: 'Starter 512 px study, not bound to any GLB' });
    for (const e of entries) if (e.group === 'kit' && e.kind === 'reference-image') assets.push({ id: `kit-ref-${slug(e.relativePath)}`, kind: 'reference-image', source: 'kit', reference: e.id, file: e.relativePath, bytes: e.bytes, sha256: e.sha256, availability: 'local-only', note: /dimensioned/.test(e.relativePath) ? 'Generated from layout.json' : 'Generated mood or isolated-object reference; art direction only' });
  }
  for (const [path, kind, note, axes] of REPO_ASSETS) {
    const e = repoEntry(root, path, {});
    assets.push({ id: `repo-${slug(basename(path))}${path.includes('/speech/') ? '-speech' : ''}`, kind, source: 'repo', reference: null, file: path, bytes: e.bytes ?? null, sha256: e.sha256 ?? null, blob: e.blob ?? null, axes, availability: e.availability, note });
  }
  const photos = join(root, 'assets/ipic/references/manifest.json');
  if (existsSync(photos)) {
    const m = JSON.parse(readFileSync(photos, 'utf8'));
    assets.push({ id: 'repo-ipic-reference-photographs', kind: 'reference-image', source: 'repo', reference: 'repo-ipic-references-manifest-json', file: 'assets/ipic/references/', count: m.images.length, bytes: m.images.reduce((n, i) => n + i.bytes, 0), sha256: null, availability: 'committed', note: m.license });
  }
  return { packet: PACKET, schemaVersion: SCHEMA_VERSION, sourceRevision, reconciledAt: now.toISOString().replace(/\.\d{3}Z$/, 'Z'), threeAxes: THREE_AXES, counts: countBy(assets, a => `${a.source}:${a.kind}`), assets };
}

// Validation is behavioural: it reads the files the packet points at. It
// returns hard problems (the packet is wrong) separately from drift (the
// repository moved on since the packet was reconciled), so a later edit to a
// referenced document is reported, not treated as a broken packet.
export function validateReferenceIndex(index, { root }) {
  const problems = [], drift = [];
  if (index?.packet !== PACKET) problems.push('packet name');
  if (index?.schemaVersion !== SCHEMA_VERSION) problems.push(`unknown schemaVersion ${index?.schemaVersion}`);
  if (!/^[0-9a-f]{40}$/.test(index?.sourceRevision ?? '')) problems.push('sourceRevision is not a full SHA');
  if (index?.threeAxes !== THREE_AXES) problems.push('threeAxes disagrees with the agreed convention');
  if (index?.kitToThree !== '(x,d,h) -> [x,h,-d]') problems.push('kitToThree mapping changed');
  if (!Array.isArray(index?.entries)) { problems.push('entries missing'); return { problems, drift }; }
  const ids = new Set(), hashes = new Map();
  for (const e of index.entries) {
    const tag = e.id ?? '(no id)';
    if (!/^[a-z0-9][a-z0-9-]*$/.test(e.id ?? '')) problems.push(`${tag}: invalid id`);
    if (ids.has(e.id)) problems.push(`${tag}: duplicate id`); ids.add(e.id);
    if (!KINDS.includes(e.kind)) problems.push(`${tag}: unknown kind ${e.kind}`);
    if (!LOCATIONS.includes(e.location)) problems.push(`${tag}: unknown location ${e.location}`);
    if (!AVAILABILITY.includes(e.availability)) problems.push(`${tag}: unknown availability ${e.availability}`);
    if (typeof e.path !== 'string' || !e.path) problems.push(`${tag}: path missing`);
    if (e.location === 'missing') { if (e.availability !== 'unavailable' || !Array.isArray(e.searched) || !e.searched.length) problems.push(`${tag}: missing entry must be unavailable and say where it was searched`); continue; }
    if (!/^[0-9a-f]{64}$/.test(e.sha256 ?? '')) problems.push(`${tag}: sha256 missing`);
    if (!Number.isInteger(e.bytes) || e.bytes < 0) problems.push(`${tag}: bytes missing`);
    if (e.location === 'external') {
      if (e.availability !== 'local-only') problems.push(`${tag}: external bytes are local-only`);
      if (!/^(~|\/)/.test(e.path)) problems.push(`${tag}: external path must be absolute or ~-relative`);
      if (!e.provenance || !e.approval) problems.push(`${tag}: external entry needs provenance and approval`);
    }
    if (e.location === 'repo') {
      if (e.availability !== 'committed') problems.push(`${tag}: repo entry must be committed`);
      if (/^(\/|~|\.\.)/.test(e.path)) problems.push(`${tag}: repo path must be relative to the repository`);
      const full = join(root, e.path);
      if (!existsSync(full)) problems.push(`${tag}: ${e.path} is not in the repository`);
      else if (e.sha256 && sha256(full) !== e.sha256) drift.push(`${tag}: ${e.path} changed since ${index.sourceRevision.slice(0, 7)}`);
      if (!/^[0-9a-f]{40}$/.test(e.blob ?? '')) problems.push(`${tag}: blob id missing`);
    }
    if (e.sha256) { if (hashes.has(e.sha256) && e.duplicateOf !== hashes.get(e.sha256)) problems.push(`${tag}: same bytes as ${hashes.get(e.sha256)} without duplicateOf`); else if (!hashes.has(e.sha256)) hashes.set(e.sha256, e.id); }
    if (e.duplicateOf && !ids.has(e.duplicateOf) && !index.entries.some(o => o.id === e.duplicateOf)) problems.push(`${tag}: duplicateOf ${e.duplicateOf} does not exist`);
  }
  const kit = index.kitChecksums;
  if (kit && (kit.ok !== kit.listed || kit.mismatched.length || kit.missing.length)) problems.push(`kit checksums: ${kit.ok}/${kit.listed} ok, ${kit.mismatched.length} mismatched, ${kit.missing.length} missing`);
  return { problems, drift };
}

export function validateAssetManifest(manifest, { root, referenceIndex }) {
  const problems = [], drift = [];
  if (manifest?.packet !== PACKET) problems.push('packet name');
  if (manifest?.schemaVersion !== SCHEMA_VERSION) problems.push(`unknown schemaVersion ${manifest?.schemaVersion}`);
  if (manifest?.sourceRevision !== referenceIndex?.sourceRevision) problems.push('sourceRevision differs from reference-index');
  if (manifest?.threeAxes !== THREE_AXES) problems.push('threeAxes disagrees with the agreed convention');
  if (!Array.isArray(manifest?.assets)) { problems.push('assets missing'); return { problems, drift }; }
  const refs = new Map((referenceIndex?.entries ?? []).map(e => [e.id, e])), ids = new Set();
  for (const a of manifest.assets) {
    const tag = a.id ?? '(no id)';
    if (ids.has(a.id)) problems.push(`${tag}: duplicate id`); ids.add(a.id);
    if (!['model', 'texture', 'reference-image', 'data'].includes(a.kind)) problems.push(`${tag}: unknown kind ${a.kind}`);
    if (!['kit', 'repo'].includes(a.source)) problems.push(`${tag}: unknown source ${a.source}`);
    if (!AVAILABILITY.includes(a.availability)) problems.push(`${tag}: unknown availability`);
    if (a.reference) { const r = refs.get(a.reference); if (!r) problems.push(`${tag}: reference ${a.reference} not in reference-index`); else if (r.sha256 && a.sha256 && r.sha256 !== a.sha256) problems.push(`${tag}: sha256 disagrees with ${a.reference}`); }
    if (a.kind === 'model' && a.source === 'kit') {
      if (a.axes !== THREE_AXES) problems.push(`${tag}: kit model axes "${a.axes}" are not ${THREE_AXES}`);
      if (!Array.isArray(a.bounds) || a.bounds.length !== 2 || !a.bounds.every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) problems.push(`${tag}: bounds must be [[x,y,z],[x,y,z]]`);
      else if (a.bounds[0].some((v, i) => v > a.bounds[1][i])) problems.push(`${tag}: bounds min above max`);
      if (!Number.isInteger(a.triangles) || a.triangles <= 0) problems.push(`${tag}: triangles missing`);
      if (Number.isInteger(a.lod0Target) && a.triangles > a.lod0Target) problems.push(`${tag}: ${a.triangles} triangles exceed the LOD0 target ${a.lod0Target}`);
    }
    if (a.source === 'repo' && a.file && !a.count) {
      const full = join(root, a.file);
      if (!existsSync(full)) problems.push(`${tag}: ${a.file} is not in the repository`);
      else if (a.sha256 && sha256(full) !== a.sha256) drift.push(`${tag}: ${a.file} changed since ${manifest.sourceRevision.slice(0, 7)}`);
    }
  }
  return { problems, drift };
}

export function readPacket(dir) {
  const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  return { referenceIndex: read('reference-index.json'), assetManifest: read('asset-manifest.json') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), values = {}, flags = new Set();
  for (let i = 0; i < args.length; i++) {
    if (['--write', '--check'].includes(args[i])) { flags.add(args[i]); continue; }
    if (!['--repo', '--kit', '--scale-review', '--loose', '--out', '--revision'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: office-ipic-reference-index [--check] [--write --kit <dir> --scale-review <dir> [--loose <file>]... [--revision <sha>]] [--repo <root>] [--out <dir>]');
    if (args[i] === '--loose') (values.loose ??= []).push(untilde(args[i + 1])); else values[args[i]] = args[i + 1];
    i++;
  }
  const root = resolve(values['--repo'] ?? process.cwd()), out = resolve(root, values['--out'] ?? 'docs/design/office-ipic');
  if (flags.has('--write')) {
    const sourceRevision = values['--revision'] ?? git(root, ['rev-parse', 'HEAD']);
    const packet = buildPacket({ root, kitDir: values['--kit'] && untilde(values['--kit']), scaleReviewDir: values['--scale-review'] && untilde(values['--scale-review']), looseFiles: values.loose ?? [], sourceRevision });
    writeFileSync(join(out, 'reference-index.json'), JSON.stringify(packet.referenceIndex, null, 2) + '\n');
    writeFileSync(join(out, 'asset-manifest.json'), JSON.stringify(packet.assetManifest, null, 2) + '\n');
    process.stdout.write(`wrote ${packet.referenceIndex.entries.length} references and ${packet.assetManifest.assets.length} assets at ${sourceRevision.slice(0, 7)}\n`);
  }
  const { referenceIndex, assetManifest } = readPacket(out);
  const a = validateReferenceIndex(referenceIndex, { root }), b = validateAssetManifest(assetManifest, { root, referenceIndex });
  const problems = [...a.problems, ...b.problems], drift = [...a.drift, ...b.drift];
  for (const line of drift) process.stdout.write(`drift: ${line}\n`);
  for (const line of problems) process.stderr.write(`problem: ${line}\n`);
  process.stdout.write(`${referenceIndex.entries.length} references, ${assetManifest.assets.length} assets, ${problems.length} problems, ${drift.length} drifted\n`);
  process.exit(problems.length ? 1 : 0);
}
