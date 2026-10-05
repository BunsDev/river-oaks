// Bake EZ Tree once; gameplay loads GLBs through the existing instanced LODs.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = `${root}preview/public/assets/landscape/`;
const raw = `${root}data/raw/landscape/ez-tree/`;
await mkdir(raw, { recursive: true });
const vite = await createServer({ configFile: false, root, cacheDir: `${root}.runtime/ez-tree-vite`, server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/bake-tree.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Tree asset bake</title>' }));
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/bake-tree.html`);
  const baked = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { Tree } = await import('/node_modules/@dgreenheck/ez-tree/build/ez-tree.es.js');
    const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
    const tree = new Tree(); tree.loadPreset('Oak Large');
    tree.options.seed = 23399;
    tree.options.leaves.size = 3.2; tree.options.leaves.count = 16;
    tree.generate();
    // Export ordinary PBR materials. The library's runtime wind shader is not
    // part of these static, instanced assets.
    for (const mesh of [tree.branchesMesh, tree.leavesMesh]) {
      const original = mesh.material;
      for (const texture of [original.map, original.normalMap, original.aoMap, original.roughnessMap].filter(Boolean)) {
        if (!texture.image?.complete) await new Promise((resolve, reject) => {
          texture.image.addEventListener('load', resolve, { once: true });
          texture.image.addEventListener('error', reject, { once: true });
        });
      }
      mesh.material = new THREE.MeshStandardMaterial({ name: original.name, color: original.color,
        map: original.map, normalMap: original.normalMap, aoMap: original.aoMap,
        roughnessMap: original.roughnessMap, roughness: 0.9, side: original.side,
        alphaTest: original.alphaTest });
    }
    const buffer = await new GLTFExporter().parseAsync(tree, { binary: true, maxTextureSize: 512 });
    const encoded = await new Promise(resolve => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(new Blob([buffer]));
    });
    return { encoded, options: tree.options };
  });
  await writeFile(`${raw}oak.glb`, Buffer.from(baked.encoded, 'base64'));
  await writeFile(`${raw}options.json`, JSON.stringify(baked.options, null, 2));
  const run = (...args) => execFileSync('npx', ['--yes', '@gltf-transform/cli@4.3.0', ...args], { cwd: root, stdio: 'inherit' });
  run('weld', `${raw}oak.glb`, `${raw}oak-welded.glb`);
  run('webp', `${raw}oak-welded.glb`, `${output}ez-oak-high.glb`, '--quality', '88');
  // Keep the exact same skeleton at all distances. Lower levels omit embedded
  // maps and resolve the high level's materials by name in landscape-models.
  const high = await readFile(`${output}ez-oak-high.glb`);
  const json = JSON.parse(high.subarray(20, 20 + high.readUInt32LE(12)).toString());
  const binStart = 20 + high.readUInt32LE(12);
  await writeFile(`${raw}oak.bin`, high.subarray(binStart + 8, binStart + 8 + high.readUInt32LE(binStart)));
  json.buffers[0].uri = 'oak.bin';
  for (const material of json.materials) {
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    delete material.normalTexture; delete material.occlusionTexture;
  }
  delete json.images; delete json.textures; delete json.samplers;
  json.extensionsUsed = json.extensionsUsed?.filter(name => name !== 'EXT_texture_webp');
  json.extensionsRequired = json.extensionsRequired?.filter(name => name !== 'EXT_texture_webp');
  await writeFile(`${raw}oak-bare.gltf`, JSON.stringify(json));
  for (const [level, ratio, error] of [['mid', '0.45', '0.01'], ['low', '0.15', '0.025']]) {
    run('simplify', `${raw}oak-bare.gltf`, `${output}ez-oak-${level}.glb`, '--ratio', ratio, '--error', error);
  }
  const derivatives = [];
  for (const level of ['high', 'mid', 'low']) {
    const bytes = await readFile(`${output}ez-oak-${level}.glb`);
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
    const triangles = gltf.meshes.flatMap(mesh => mesh.primitives).reduce((sum, primitive) => sum + gltf.accessors[primitive.indices].count / 3, 0);
    derivatives.push({ path: `/assets/landscape/ez-oak-${level}.glb`, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, triangles });
  }
  await writeFile(`${output}ez-tree-LICENSE.txt`, await readFile(`${root}node_modules/@dgreenheck/ez-tree/LICENSE`));
  await writeFile(`${output}ez-tree-manifest.json`, JSON.stringify({
    generator: '@dgreenheck/ez-tree', version: '1.1.0', license: 'MIT',
    source: 'https://github.com/dgreenheck/ez-tree', preset: 'Oak Large', seed: 23399,
    options: baked.options, processing: 'GLTFExporter; 512px maps; glTF Transform 4.3.0 weld, WebP quality 88, geometry-only simplified LODs', derivatives,
  }, null, 2) + '\n');
  console.log(JSON.stringify(derivatives, null, 2));
} finally { await browser?.close(); await vite.close(); }
