// Review harness for the #506 campus contract: draws the measured massing, the
// per-level support surfaces and the named cameras straight from the shared module.
// Scene axes: x = u (east), y = z (up), z = -v (north into the screen), as the renderer maps local frames.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GARDEN_CAMPUS_LAYOUT as LAYOUT, campusLevels, validateGardenCampus } from '../../../shared/garden-campus-layout.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();scene.background = new THREE.Color('#f4f2ec');
scene.add(new THREE.HemisphereLight('#ffffff', '#b8b0a0', 2.2));
const sun = new THREE.DirectionalLight('#fff4e2', 1.6);sun.position.set(80, 140, 60);scene.add(sun);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
const at = ([u, v, z = 0]) => new THREE.Vector3(u, z, -v);

const material = (color, opacity = 1) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
const box = ([u0, v0, u1, v1], z0, z1, mat, parent) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(u1 - u0, Math.max(z1 - z0, 0.02), v1 - v0), mat);
  mesh.position.set((u0 + u1) / 2, (z0 + z1) / 2, -(v0 + v1) / 2);parent.add(mesh);return mesh;
};
const colors = { public: '#f2a65a', 'private-suite': '#e9dcc4', service: '#b9b2a5', terrace: '#8fbf73', roof: '#8fbf73', obstacle: '#3d3830' };

// Static site: parcel, paths, ground program, context masses and the IPIC wall.
const site = new THREE.Group();scene.add(site);
const shape = new THREE.Shape(LAYOUT.parcel.polygon.map(([u, v]) => new THREE.Vector2(u, v)));
const parcel = new THREE.Mesh(new THREE.ShapeGeometry(shape), material('#e3e8dc'));parcel.rotation.x = -Math.PI / 2;parcel.position.y = -0.01;site.add(parcel);
for (const path of LAYOUT.paths) box(path.rect, 0, 0.03, material('#d9cfb9'), site);
for (const item of LAYOUT.groundBuildings) box(item.rect, 0, Math.max(item.height, 0.05), item.kind === 'pool' ? material('#8fb8cc') : item.kind === 'pergola' ? material('#b49a74', 0.35) : material('#bcd1a4'), site);
const wall = LAYOUT.context.ipic.wall;
box([-0.3, wall.from[1], 0, wall.to[1]], 0, LAYOUT.context.ipic.height, material('#9a3b3b', 0.55), site);
const officeTop = LAYOUT.context.office.nominalRoofAltitude - LAYOUT.frame.baseAltitude;
box([-52.98, -55.73, 27.14, -15.65], 0, officeTop, material('#a9a49a', 0.25), site);
box([-35.78, 82.54, -0.3, 181.22], 0, LAYOUT.context.ipic.height, material('#a9a49a', 0.25), site);
for (const entry of LAYOUT.entries) { const marker = new THREE.Mesh(new THREE.SphereGeometry(0.8), material('#c96f4a'));marker.position.copy(at([...entry.position, 0.8]));site.add(marker); }

// Massing: every floor plate, cores, decks and caps, drawn from the contract.
const massing = new THREE.Group();scene.add(massing);
const tierShade = ['#d9d3c7', '#c8c0b2', '#b7ae9e'];
for (const tower of LAYOUT.towers) {
  for (const level of tower.levels) box(level.rect, level.z0, level.z1 - 0.25, material(tierShade[level.tier - 1], 0.55), massing);
  box(tower.core.rect, 0, tower.roof.headhouse.z1, material('#3d3830'), massing);
  box(tower.roof.rect, tower.roof.z, tower.silhouette.parapetTop, material('#8fbf73', 0.35), massing);
  // The declared silhouette cap: everything on the roof stays below this outline.
  const [cu0, cv0, cu1, cv1] = tower.tiers[0].rect;
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[cu0, cv0], [cu1, cv0], [cu1, cv1], [cu0, cv1]].map(([u, v]) => at([u, v, tower.silhouette.capZ]))), new THREE.LineBasicMaterial({ color: '#5c7048' }));
  massing.add(outline);
}
for (const bridge of LAYOUT.bridges) {
  box(bridge.rect, bridge.underside, bridge.deckZ, material('#e3a46b'), massing);
  for (const side of [[bridge.rect[0], bridge.clear[0]], [bridge.clear[2], bridge.rect[2]]]) box([side[0], bridge.guardSpan[0], side[1], bridge.guardSpan[1]], bridge.deckZ, bridge.deckZ + bridge.guard, material('#9a5a2c', 0.4), massing);
}

// Level view: the support surfaces one campus level publishes, coloured by access.
const levelGroup = new THREE.Group();scene.add(levelGroup);
const levels = campusLevels();
let shown = null;
function showLevel(index) {
  shown = index;levelGroup.clear();
  massing.visible = index === null;
  for (const button of document.querySelectorAll('#levels button')) button.setAttribute('aria-pressed', String(button.dataset.level === String(index)));
  if (index === null) return;
  const level = levels[index];
  for (const tower of LAYOUT.towers) for (const floor of tower.levels) if (floor.z0 < level.z) box(floor.rect, floor.z0, floor.z1 - 0.25, material('#d9d3c7', 0.18), levelGroup);
  for (const surface of level.surfaces) {
    if (surface.polygon) continue;
    const color = surface.kind === 'terrace' || surface.kind === 'roof' ? colors.terrace : colors[surface.access] ?? '#cccccc';
    box(surface.rect, level.z, level.z + 0.12, material(color), levelGroup);
  }
  // Heights are indicative: guards 1.25 m, #511's planters and seats 0.45 m, tables 0.75 m, a tree's trunk to its 3.2 m crown.
  const heights = { guard: 1.25, planter: 0.45, seat: 0.45, table: 0.75, tree: 3.2 };
  for (const obstacle of level.obstacles) box(obstacle.rect, level.z, level.z + (heights[obstacle.kind] ?? 3), material(obstacle.kind === 'tree' || obstacle.kind === 'planter' ? '#5c7048' : colors.obstacle), levelGroup);
  for (const portal of level.portals) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.2, 12), material(portal.kind === 'lift' ? '#2f5d8e' : '#6b4f8e'));p.position.copy(at([...portal.position, level.z + 1.1]));levelGroup.add(p); }
  for (const opening of level.openings) { const o = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 0.6), material(opening.kind === 'suite-door' ? '#7d6a4a' : '#c0392b'));o.position.copy(at([...opening.position, level.z + 1.1]));levelGroup.add(o); }
}

// Panel: versions, live validation, level and camera buttons.
const result = validateGardenCampus(LAYOUT);
document.querySelector('#meta').innerHTML = `${LAYOUT.id}<br>layout ${LAYOUT.versions.layout}, floors ${LAYOUT.versions.floors}, support ${LAYOUT.versions.support}, units ${LAYOUT.versions.units}<br>source ${LAYOUT.source.buildingId} @ ${LAYOUT.source.commit.slice(0, 12)}`;
document.querySelector('#validation').innerHTML = result.ok ? `<span class="ok">No findings</span> · ${LAYOUT.towers.map(t => `${t.id} ${t.levels.length}F`).join(' / ')} · ${LAYOUT.bridges.map(b => `${b.id} ${b.span} m`).join(', ')}`
  : `<span class="bad">${result.findings.length} findings</span><div id="finding">${result.findings.map(f => `${f.rule} ${f.id}: ${f.message}`).join('\n')}</div>`;
const levelButtons = document.querySelector('#levels');
const add = (parent, text, onClick, data = {}) => { const b = document.createElement('button');b.textContent = text;Object.assign(b.dataset, data);b.addEventListener('click', onClick);parent.append(b);return b; };
add(levelButtons, 'Massing', () => showLevel(null), { level: 'null' });
levels.forEach((level, i) => add(levelButtons, `l${i} z${level.z}`, () => showLevel(i), { level: String(i) }));
const cameraButtons = document.querySelector('#cameras');
const view = item => { camera.fov = item.fov;camera.updateProjectionMatrix();camera.position.copy(at(item.position));controls.target.copy(at(item.target));controls.update(); };
for (const item of LAYOUT.cameras) add(cameraButtons, item.id, () => view(item)).title = item.name;
view(LAYOUT.cameras[0]);showLevel(null);
window.campusFixture = { layout: LAYOUT, levels, result, showLevel, view };

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop(() => { controls.update();renderer.render(scene, camera); });
document.body.dataset.ready = 'true';
