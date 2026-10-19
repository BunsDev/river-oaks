// Measures the Garden Office pilot forms (#416) from the real Studio renderer and
// prints their catalog records; `--write` refreshes docs/design/garden-office/asset-manifest.json.
// preview/tests/studio-garden-office.test.js fails when the records and the code disagree.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { buildSpaceWorld } from '../preview/src/studio/space-document.js';
import { createSpaceScene } from '../preview/src/studio/space-scene.js';
import { disposeStudioScene } from '../preview/src/studio/scene.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const furnitureFile = 'preview/src/studio/space-furniture.js';
const sceneFile = 'preview/src/studio/space-scene.js';
const manifestPath = 'docs/design/garden-office/asset-manifest.json';
export const FORMS = [
  { id: 'studio-desk-workstation', kind: 'desk', nominal: { width: 1.8, depth: .8, height: .76 }, finish: 'oak',
    resize: 'Any v1 width, depth and height. Top up to 25 mm, legs up to 40 mm square and rails keep metric sections (reduced only to fit small dimensions); a back modesty panel appears when the legs exceed 0.45 m.',
    materialSlots: { top: 'object finish', frame: 'charcoal' }, approach: 'Seated side is the local +z edge; the office places each chair 1 m south of its desk.' },
  { id: 'studio-chair-side', kind: 'chair', nominal: { width: .6, depth: .65, height: .85 }, finish: 'charcoal',
    resize: 'Any v1 size. Seat height is min(0.47 m, 55% of height); legs keep a 17 mm top radius; the back leans up to 8° (reduced for narrow footprints) and stays inside the footprint; no back below 8 cm.',
    materialSlots: { upholstery: 'object finish', timber: 'oak, or walnut when the finish is walnut' }, approach: 'Sitter enters from the local +z edge; the back is the local -z edge.' },
  { id: 'studio-pendant-linear', kind: 'pendant', nominal: { width: 2.4, depth: .22, height: .3 }, finish: 'brass',
    resize: 'Used when the long side is at least twice the short side: an 80 mm body along the long side on two cables; otherwise the round variant.',
    materialSlots: { body: 'object finish', cables: 'charcoal', diffuser: 'shared emissive lamp' }, approach: 'Overhead; does not block walking.' },
  { id: 'studio-pendant-round', kind: 'pendant', nominal: { width: .45, depth: .45, height: .35 }, finish: 'brass',
    resize: 'Used below a 2:1 footprint: an open shade sized by the short side, at most 0.35 m tall, on one cord.',
    materialSlots: { shade: 'object finish', cord: 'charcoal', diffuser: 'shared emissive lamp' }, approach: 'Overhead; does not block walking.' },
  { id: 'studio-plant-potted', kind: 'plant', nominal: { width: .55, depth: .55, height: 1.25 }, finish: 'terracotta',
    resize: 'Any v1 size. Round within the shorter side; the pot is 32% of the height (at most 0.42 m); 30–50 leaves per cluster keep the canopy full on tall plants; works from a 0.3 m table vase up.',
    materialSlots: { pot: 'object finish', soil: 'walnut', stems: 'walnut', foliage: 'shared double-sided leaf green' }, approach: 'Blocks walking like other furniture when standing on the floor.' },
  { id: 'studio-glazing-framed', kind: 'glazing', file: sceneFile, nominal: { width: 4.2, depth: .1, height: 3.1 }, finish: 'charcoal',
    resize: 'Any valid v1 size; 55 mm maximum stiles/rails, mullions at at most 1.6 m intervals. Floor-standing glazing at least 2 m high has an 80 mm base shoe.',
    materialSlots: { frame: 'object finish', pane: 'shared thin storefront glass' }, approach: 'Solid partition. Use the authored door gaps; glazing is not a portal.' },
  { id: 'studio-floor-concrete', kind: 'floor', file: sceneFile, nominal: { width: 16, depth: 12, height: .025 }, finish: 'concrete',
    resize: 'Any valid v1 size; slab ends at elevation, control joints every 4 m.',
    materialSlots: { surface: 'polished concrete #96938b, roughness 0.5', joints: '#7f7c74, opacity 0.35' }, approach: 'Walk surface at the room datum; does not obstruct routes.' },
  { id: 'studio-wall-plaster', kind: 'wall', file: sceneFile, nominal: { width: 16.2, depth: .18, height: 3.1 }, finish: 'plaster',
    resize: 'Any valid v1 size; skirting at most 90 mm high.',
    materialSlots: { wall: 'plaster #e5dfd2, roughness 0.92', skirting: 'white' }, approach: 'Solid wall; entrances are gaps between separate wall elements.' },
  { id: 'studio-art-abstract-pink', kind: 'art', file: sceneFile, nominal: { width: 1.3, depth: .05, height: .9 }, finish: 'sage',
    resize: 'Existing v1 proportional scaling; frame and abstract detail proportions follow width, depth and height.',
    materialSlots: { canvas: 'fabric', frame: 'walnut', field: 'object finish', circle: 'TypeSafe Place pink #F486A1, roughness 0.88', horizon: 'sage' },
    approach: 'Nonblocking wall decoration; the shared art detail uses this accent in every template.',
    permission: 'Existing repository-authored abstract art geometry, with the #416 TypeSafe Place accent revision; no third-party asset source.' },
];

// `|| 0` turns -0 into 0, which is what JSON stores.
const round = value => Math.round(value * 1000) / 1000 || 0;
export async function measureForms() {
  const files = [furnitureFile, sceneFile, 'preview/src/studio/space-document.js', 'preview/src/materials.js', 'preview/src/storefront-materials.js'];
  const sources = await Promise.all(files.map(async file => ({ file, sha256: createHash('sha256').update(await readFile(`${root}${file}`)).digest('hex') })));
  return FORMS.map(form => {
    const item = { id: form.id, kind: form.kind, label: form.id, east: 0, north: 0, yaw: 0, elevation: 0, finish: form.finish, ...form.nominal };
    const scene = createSpaceScene({ schema_version: 1, document_type: 'studio-space', name: 'Catalog', lighting: 'daylight', bounds_m: [-32,-32,32,32], spawn: [0,-5], objects: [item] });
    scene.group.updateMatrixWorld(true);
    const box = new THREE.Box3(), point = new THREE.Vector3();
    let meshNodes = 0, triangles = 0;
    scene.items.get(form.id).traverse(child => {
      if (!child.isMesh) return;
      meshNodes++;
      const geometry = child.geometry, positions = geometry.attributes.position;
      triangles += (geometry.index ? geometry.index.count : positions.count) / 3;
      for (let index = 0; index < positions.count; index++) box.expandByPoint(point.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld));
    });
    const geometries = new Set(), materials = new Set();let lineSets = 0;
    scene.items.get(form.id).traverse(child => {
      if (child.geometry) geometries.add(child.geometry);
      for (const material of [].concat(child.material ?? [])) materials.add(material);
      if (child.isLineSegments) lineSets++;
    });
    const buffers = new Set();
    for (const geometry of geometries) for (const attribute of [...Object.values(geometry.attributes), geometry.index].filter(Boolean)) buffers.add(attribute.array);
    const geometryBytes = [...buffers].reduce((sum, array) => sum + array.byteLength, 0);
    disposeStudioScene(scene.group);
    const { nominal, finish, file = furnitureFile, ...record } = form;
    const sha256 = sources.find(source => source.file === file).sha256;
    return { ...record, version: file === furnitureFile ? 2 : 1, source: 'procedural', file, sha256, sources: sources.filter(source => file === furnitureFile || source.file !== furnitureFile), export: null, units: 'metres', nominal, finishUsedForMeasure: finish,
      bounds: [box.min.toArray().map(round), box.max.toArray().map(round)],
      axes: 'object frame at yaw 0: x east / y up / z south; pivot at the footprint centre and base elevation (floor surfaces extend below their pivot)',
      collision: {
        rule: ['floor','pendant','art'].includes(form.kind) ? 'Nonblocking v1 kind at every elevation.' : 'v1 footprint rectangle (width × depth); blocks walking when elevation < 1.8 m and the top is above 0.25 m.',
        footprintsAtNominal: buildSpaceWorld({ bounds_m: [-32,-32,32,32], spawn: [0,-5], objects: [item] }).collisionPolygons,
      },
      cost: { meshNodes, triangles, lineSets, geometries: geometries.size, geometryBytes, materials: materials.size, texturesAtNominal: 0,
        textures: form.kind === 'floor' ? 'No authored texture maps at the measured finish. Optional limestone/terracotta finishes reuse existing shared PBR textures; no transfer-byte measurement is claimed.' : 'No authored texture maps for this form; viewport reflections are shared and measured separately at runtime.' },
      stage: 'procedural-pilot', availability: 'repository',
      permission: form.permission ?? 'Original geometry authored in this repository for #416; no third-party source.' };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const assets = await measureForms();
  const manifest = { packet: 'garden-office', schemaVersion: 1, issue: 416, threeAxes: 'x east / y up / z south', assets };
  if (process.argv.includes('--write')) {
    await writeFile(`${root}${manifestPath}`, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Wrote ${manifestPath} (${assets.length} records).`);
  } else console.log(JSON.stringify(manifest, null, 2));
}
