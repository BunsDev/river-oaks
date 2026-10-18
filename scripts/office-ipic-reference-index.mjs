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
import { OFFICE_LAYOUT_PENTHOUSE, officeLayout } from '../preview/src/office-layouts.js';

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

// #362's asset package (assets/office-penthouse/): Jevica's penthouse furnishings, original art
// exported from their JS master by scripts/export-office-penthouse.mjs. The entries keep this
// manifest's fields (id, kind, source, file, bytes, sha256, triangles, meshNodes, bounds, axes,
// stage, targetDimensions, lod0Target, availability, note) and add the package's own: version,
// programme, status, pivot, lods, materials, textures, collision, anchors, placements, the plan
// they were built against (layout, layoutVersion, planDigest), provenance, license and owner.
export const PENTHOUSE_PACKAGE = 'assets/office-penthouse';
// Provisional per-asset LOD0 cap: the kit's largest per-asset target, not an accepted hardware limit.
export const PENTHOUSE_LOD0_TARGET = 12000;
const PENTHOUSE_PROVENANCE = 'Original procedural geometry and seeded-noise surfaces authored in preview/src/office-penthouse-furnishings.js for #362. No kit art or kit bytes: the desk footprints are the kit\u2019s measured colliders as numbers only (R19, Val, 2026-10-15). No generated or purchased imagery.';
// The plan numbers the art stands on: floors, desk and furniture footprints, chairs, seats and the
// stations whose displays it draws. A change to any of them makes the package stale until it is
// re-exported; other plan edits (routes, views, portals) do not.
export function penthousePlanDigest(layout = officeLayout(OFFICE_LAYOUT_PENTHOUSE)) {
  const plan = {
    levels: layout.levels.map(({ id, floorElevation, clearHeight, bounds, obstacles, chairs }) => ({ id, floorElevation, clearHeight, bounds, chairs, obstacles: obstacles.filter(o => o.kind === 'desk' || o.kind === 'furniture') })),
    seats: layout.seats, stations: layout.anchors.filter(anchor => anchor.monitors).map(({ id, seat, monitors }) => ({ id, seat, monitors })),
  };
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}
const round = v => Math.round(v * 1e4) / 1e4;
export async function penthousePackageAssets({ root }) {
  const { PENTHOUSE_ASSETS, PENTHOUSE_FINISHES, PENTHOUSE_FURNISHINGS_VERSION, PENTHOUSE_SURFACE_SIZE, penthouseAssetParts, penthousePlacements } = await import('../preview/src/office-penthouse-furnishings.js');
  const dir = join(root, PENTHOUSE_PACKAGE), read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const receipt = read('export.json'), blender = existsSync(join(dir, 'blender.json')) ? read('blender.json') : null;
  const camera = JSON.parse(readFileSync(join(root, 'docs/design/office-ipic/camera-manifest.json'), 'utf8'));
  const layout = officeLayout(OFFICE_LAYOUT_PENTHOUSE), placements = penthousePlacements(layout), planDigest = penthousePlanDigest(layout);
  const exported = new Map(receipt.exports.map(e => [e.file, e]));
  const shared = { source: 'repo', reference: null, axes: THREE_AXES, availability: 'committed', package: 'office-penthouse', version: PENTHOUSE_FURNISHINGS_VERSION,
    layout: OFFICE_LAYOUT_PENTHOUSE, layoutVersion: camera.layoutVersion, planDigest, provenance: PENTHOUSE_PROVENANCE, license: 'Original work for this repository; no separate license file (the repository has none)', owner: 'design: river-oaks-1b (#362); integration: preview/src/office-penthouse-graybox.js' };
  const file = path => { const e = exported.get(path); if (!e) throw new Error(`${path} is not in export.json`); return { file: path, bytes: e.bytes, sha256: e.sha256, reimport: e.reimport ?? null }; };
  const assets = [];
  for (const asset of PENTHOUSE_ASSETS) {
    const lods = [0, 1].map(level => { const parts = penthouseAssetParts(asset.id, level); const triangles = parts.reduce((n, p) => n + p.geometry.attributes.position.count / 3, 0); return { parts, triangles }; });
    const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const part of lods[0].parts) { const b = part.geometry.boundingBox; ['x', 'y', 'z'].forEach((k, i) => { box.min[i] = Math.min(box.min[i], b.min[k]); box.max[i] = Math.max(box.max[i], b.max[k]); }); }
    const finishes = [...new Set(lods[0].parts.map(p => p.finish))].sort(), where = placements.filter(p => p.asset === asset.id);
    for (const lod of lods) for (const part of lod.parts) part.geometry.dispose();
    assets.push({ id: `repo-penthouse-${asset.id}`, kind: 'model', ...file(`${PENTHOUSE_PACKAGE}/models/${asset.id}.glb`), ...shared,
      triangles: lods[0].triangles, meshNodes: lods[0].parts.length, bounds: [box.min.map(round), box.max.map(round)], stage: 'asset-package',
      targetDimensions: `${asset.size.join(' \u00d7 ')} m (x \u00d7 d \u00d7 h)`, lod0Target: PENTHOUSE_LOD0_TARGET,
      note: asset.label, programme: asset.programme, status: 'proposed: original art awaiting design review',
      pivot: asset.id === 'pendant' ? 'drum centre' : ['arrival-cladding', 'back-panelling', 'library-panel'].includes(asset.id) ? 'wall face at floor level, front +d' : 'centre of the floor footprint at floor contact; front +d (seating) or toward -d (displays)',
      lods: lods.map((lod, level) => ({ level, node: `LOD${level}`, triangles: lod.triangles })),
      materials: finishes, textures: finishes.filter(f => PENTHOUSE_FINISHES[f].surface).map(f => ({ id: `repo-penthouse-texture-${PENTHOUSE_FINISHES[f].surface}`, colorSpace: 'sRGB', size: [PENTHOUSE_SURFACE_SIZE, PENTHOUSE_SURFACE_SIZE], tileMetres: PENTHOUSE_FINISHES[f].tile })),
      collision: { proxy: `COL_${asset.id}`, plan: where.filter(p => /^(obstacle|chair):/.test(p.zone)).map(p => p.zone) },
      anchors: asset.anchors, seatHeight: asset.seatHeight, placements: where.map(p => p.id) });
  }
  const scene = file(`${PENTHOUSE_PACKAGE}/office-penthouse.glb`);
  assets.push({ id: 'repo-penthouse-office-penthouse-glb', kind: 'model', ...scene, ...shared, triangles: scene.reimport?.triangles ?? null, meshNodes: scene.reimport?.meshes ?? null,
    bounds: scene.reimport?.bounds?.map(v => v.map(round)) ?? null, stage: 'asset-package', targetDimensions: '38 \u00d7 20 \u00d7 7.6 m (main floor, terrace, mezzanine)', lod0Target: null,
    note: 'The placed office: shell and every furnishing as its own named node, COL_<id> collision proxies on the plan footprints, SEAT and SCREEN anchors, the lamps as punctual lights', status: 'proposed: original art awaiting design review', pivot: 'office origin: the entrance centre at floor level' });
  if (blender) {
    const path = `${PENTHOUSE_PACKAGE}/office-penthouse.blend`, full = join(root, path);
    if (existsSync(full)) assets.push({ id: 'repo-penthouse-office-penthouse-blend', kind: 'model', file: path, bytes: statSync(full).size, sha256: sha256(full), ...shared, axes: 'Blender Z up; +Y = d (into the office)',
      triangles: blender.triangles, meshNodes: blender.meshes, bounds: null, stage: 'editable-source', targetDimensions: null, lod0Target: null,
      note: `Editable Blender project imported from the placed GLB (${blender.blender}); collections per visibility group, COL_ proxies wire-only, review cameras O1-O4`, status: 'proposed: original art awaiting design review', pivot: 'office origin' });
  }
  for (const name of ['travertine', 'rose-stone', 'wood']) assets.push({ id: `repo-penthouse-texture-${name}`, kind: 'texture', ...file(`${PENTHOUSE_PACKAGE}/textures/${name}.jpg`), ...shared, axes: null,
    colorSpace: 'sRGB', size: [PENTHOUSE_SURFACE_SIZE, PENTHOUSE_SURFACE_SIZE], note: `Shared ${name} surface: seeded tileable noise, JPEG, embedded in the GLBs` });
  const materials = join(root, PENTHOUSE_PACKAGE, 'materials.json');
  assets.push({ id: 'repo-penthouse-materials', kind: 'data', file: `${PENTHOUSE_PACKAGE}/materials.json`, bytes: statSync(materials).size, sha256: sha256(materials), ...shared, axes: null, note: 'One material per finish with its PBR parameters, tint rule and surface' });
  return assets;
}
// Replaces the manifest's penthouse package entries, leaving the packet's own entries untouched.
export function withPenthousePackage(manifest, assets) {
  const kept = manifest.assets.filter(a => a.package !== 'office-penthouse'), all = [...kept, ...assets];
  return { ...manifest, counts: countBy(all, a => `${a.source}:${a.kind}`), assets: all };
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
      // The penthouse package is exported and recorded together, so a mismatch is a stale record.
      else if (a.sha256 && sha256(full) !== a.sha256) (a.package === 'office-penthouse' ? problems : drift).push(`${tag}: ${a.file} ${a.package === 'office-penthouse' ? 'differs from its recorded hash; re-export and rerun --write-penthouse' : `changed since ${manifest.sourceRevision.slice(0, 7)}`}`);
    }
    if (a.package === 'office-penthouse') {
      if (a.layout !== OFFICE_LAYOUT_PENTHOUSE || a.planDigest !== penthousePlanDigest()) problems.push(`${tag}: built for another plan; re-export the package`);
      if (a.kind === 'model' && a.stage === 'asset-package' && a.lods) {
        if (!Number.isInteger(a.triangles) || a.triangles > a.lod0Target) problems.push(`${tag}: ${a.triangles} triangles exceed the LOD0 target ${a.lod0Target}`);
        if (a.lods.length !== 2 || a.lods[1].triangles > a.lods[0].triangles) problems.push(`${tag}: LOD1 must not exceed LOD0`);
        if (!a.collision?.proxy?.startsWith('COL_')) problems.push(`${tag}: no collision proxy`);
      }
      if (a.reimport?.missingTextures?.length) problems.push(`${tag}: textures missing on reimport`);
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
    if (['--write', '--check', '--write-penthouse'].includes(args[i])) { flags.add(args[i]); continue; }
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
  if (flags.has('--write-penthouse')) {
    const assets = await penthousePackageAssets({ root }), current = readPacket(out).assetManifest;
    writeFileSync(join(out, 'asset-manifest.json'), JSON.stringify(withPenthousePackage(current, assets), null, 2) + '\n');
    process.stdout.write(`wrote ${assets.length} penthouse package entries\n`);
  }
  const { referenceIndex, assetManifest } = readPacket(out);
  const a = validateReferenceIndex(referenceIndex, { root }), b = validateAssetManifest(assetManifest, { root, referenceIndex });
  const problems = [...a.problems, ...b.problems], drift = [...a.drift, ...b.drift];
  for (const line of drift) process.stdout.write(`drift: ${line}\n`);
  for (const line of problems) process.stderr.write(`problem: ${line}\n`);
  process.stdout.write(`${referenceIndex.entries.length} references, ${assetManifest.assets.length} assets, ${problems.length} problems, ${drift.length} drifted\n`);
  process.exit(problems.length ? 1 : 0);
}
