import {createHash} from 'node:crypto';
import {readFile, readdir, realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';

// Audited authored modules reached by the five Node bakes through avatars.js.
// Generated morph data is checked as output, never used as a bake recipe.
// Review this list and the external package audit when adding imports.
const avatarInputs = [
  'preview/src/arm-contact.js',
  'preview/src/avatar-skeletons.js',
  'preview/src/avatar-stance.js',
  'preview/src/avatars.js',
  'preview/src/bicycle-crank.js',
  'preview/src/bicycle-rider.js',
  'preview/src/bodice-fitting.js',
  'preview/src/boot-fitting.js',
  'preview/src/character-bodice-fit.js',
  'preview/src/coat-back.js',
  'preview/src/coat-tail-geometry.js',
  'preview/src/coat-tail-skinning.js',
  'preview/src/conversation-body.js',
  'preview/src/conversation-gaze.js',
  'preview/src/conversation-motion.js',
  'preview/src/costume-batching.js',
  'preview/src/drape-geometry.js',
  'preview/src/driving-hands.js',
  'preview/src/eye-tracking.js',
  'preview/src/facial-motion.js',
  'preview/src/foot-placement.js',
  'preview/src/foot-roll.js',
  'preview/src/gltf-image-decoder.js',
  'preview/src/handshake-contact.js',
  'preview/src/head-fit.js',
  'preview/src/jevica-accounts.js',
  'preview/src/limb-fit.js',
  'preview/src/packed-morph-data.js',
  'preview/src/reference-archetypes.js',
  'preview/src/resident-face.js',
  'preview/src/resident-gestures.js',
  'preview/src/resident-hairstyle.js',
  'preview/src/resident-style.js',
  'preview/src/romance-look.js',
  'preview/src/shared-appearances.js',
  'preview/src/shoe-skinning.js',
  'preview/src/silvan-drape-geometry.js',
  'preview/src/silvan-trousers.js',
  'preview/src/skirt-geometry.js',
  'preview/src/skirt-seat-morph.js',
  'preview/src/skirt-skinning.js',
  'preview/src/sock-fitting.js',
  'preview/src/sole-support.js',
  'preview/src/speech-avatar.js',
  'preview/src/speech-track.js',
  'preview/src/upper-body-gait.js',
  'preview/src/vehicle-config.js',
  'preview/src/vesper-skirt-geometry.js'
];

const bakeInputs = {
  'coat-tail': [
    'preview/public/assets/characters/man-casual.glb',
    'preview/public/assets/characters/sources.json',
    'preview/tests/helpers/character-rig.js',
    'preview/tests/helpers/garment-edges.js',
    'preview/tests/helpers/skirt-contact.js',
    'scripts/bake-coat-tails.mjs',
    'scripts/lib/coat-tail-fit.mjs',
    'scripts/lib/drape-seat-fit.mjs'
  ],
  'lyra-drape': [
    'preview/public/assets/characters/jevica.glb',
    'preview/public/assets/characters/jevica.sources.json',
    'preview/tests/helpers/character-rig.js',
    'preview/tests/helpers/skirt-contact.js',
    'scripts/bake-lyra-drapes.mjs',
    'scripts/lib/drape-seat-fit.mjs'
  ],
  'silvan-drape': [
    'preview/public/assets/characters/jevica.glb',
    'preview/public/assets/characters/jevica.sources.json',
    'preview/public/assets/characters/man-casual.glb',
    'preview/public/assets/characters/sources.json',
    'preview/tests/helpers/character-rig.js',
    'preview/tests/helpers/skirt-contact.js',
    'scripts/bake-silvan-drapes.mjs',
    'scripts/lib/drape-seat-fit.mjs',
    'scripts/lib/skirt-detail-fit.mjs'
  ],
  'skirt-seat': [
    'preview/public/assets/characters/jevica.glb',
    'preview/public/assets/characters/jevica.sources.json',
    'preview/tests/helpers/character-rig.js',
    'scripts/bake-skirt-seat-morph.mjs',
    'scripts/lib/skirt-seat-fit.mjs'
  ],
  'vesper-skirt': [
    'preview/public/assets/characters/jevica.glb',
    'preview/public/assets/characters/jevica.sources.json',
    'preview/tests/helpers/character-rig.js',
    'scripts/bake-vesper-skirt.mjs',
    'scripts/lib/skirt-detail-fit.mjs',
    'scripts/lib/skirt-seat-fit.mjs'
  ]
};

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function requireRoot(root) {
  if (!(root instanceof URL) || root.protocol !== 'file:' || !root.pathname.endsWith('/') || root.search || root.hash) {
    throw new TypeError('Bake root must be a file directory URL ending in a slash.');
  }
}

export function bakeInputPaths(bake) {
  if (!Object.hasOwn(bakeInputs, bake)) throw new Error(`Unknown garment bake: ${bake}`);
  return [...new Set([...avatarInputs, ...bakeInputs[bake], 'scripts/lib/bake-provenance.mjs'])].sort();
}

export async function collectBakeToolchain({root}) {
  requireRoot(root);
  const declaration = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  // Resolve only this checkout's install. Never fall back to the helper/test host.
  // The package root may be pnpm's symlink; links inside it are not audited inputs.
  const directory = await realpath(new URL('node_modules/three', root));
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (manifest.name !== 'three' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version)
      || declaration.dependencies?.three !== manifest.version) {
    throw new Error('Three.js installed version must match the exact declared dependency; run pnpm install --frozen-lockfile.');
  }
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    if (manifest[field] !== undefined && (!isRecord(manifest[field]) || Object.keys(manifest[field]).length)) {
      throw new Error(`Three.js ${field} changed; audit new bake dependencies before regenerating.`);
    }
  }
  // Check Node's ancestor lookup directories from each audited importer seam.
  // Inspect the filesystem instead of require.resolve's process-global cache,
  // so a nested installation introduced after an earlier check is still caught.
  for (const importer of ['scripts/', 'scripts/lib/', 'preview/src/', 'preview/tests/helpers/']) {
    for (let parent = new URL(importer, root); parent.href !== root.href; parent = new URL('../', parent)) {
      let nested;
      try { nested = await realpath(new URL('node_modules/three', parent)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (nested && nested !== directory) throw new Error(`Three.js resolution is shadowed in ${importer}; use the audited checkout dependency.`);
    }
  }
  const files = [];
  async function visit(relative = '') {
    const entries = await readdir(join(directory, relative), {withFileTypes: true});
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      // These are install/OS metadata, not published package implementation.
      if ((!relative && entry.name === 'node_modules') || entry.name === '.DS_Store') continue;
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Unaudited symlink in Three.js package: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push([path, hash(await readFile(join(directory, path)))]);
      else throw new Error(`Unsupported Three.js package entry: ${path}`);
    }
  }
  await visit();
  return {three: {version: manifest.version, sha256: hash(JSON.stringify(files)), files: files.length}};
}

export async function collectBakeProvenance({root, bake}) {
  requireRoot(root);
  const inputs = {};
  for (const path of bakeInputPaths(bake)) inputs[path] = hash(await readFile(new URL(path, root)));
  return {inputs, toolchain: await collectBakeToolchain({root})};
}

export async function verifyBakeProvenance({root, bake, receipt}) {
  const paths = bakeInputPaths(bake);
  if (!isRecord(receipt) || receipt.version !== 2 || !isRecord(receipt.inputs)
      || !isRecord(receipt.toolchain) || !isDigest(receipt.outputSha256)) {
    throw new Error('Unsupported or malformed garment receipt schema; regenerate version 2 with the bake command.');
  }
  // The receipt cannot decide which inputs to validate or read arbitrary paths.
  if (!isDeepStrictEqual(Object.keys(receipt.inputs).sort(), paths)
      || Object.values(receipt.inputs).some(value => !isDigest(value))) {
    throw new Error('Garment receipt input set is incomplete or malformed; review inputs and rebake.');
  }
  const current = await collectBakeProvenance({root, bake});
  for (const path of paths) {
    if (current.inputs[path] !== receipt.inputs[path]) throw new Error(`Bake input changed: ${path}; review and rebake.`);
  }
  if (!isDeepStrictEqual(receipt.toolchain, current.toolchain)) {
    throw new Error('Bake toolchain changed: three; review package implementation and rebake.');
  }
  const output = `preview/src/${bake}-morph-data.js`;
  if (hash(await readFile(new URL(output, root))) !== receipt.outputSha256) {
    throw new Error(`Bake output changed: ${output}; reproduce with the bake command.`);
  }
}
