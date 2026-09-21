import * as THREE from 'three';
import { createRenderPipeline } from './render-pipeline.js';
import { localToScene, terrainHeight } from './geometry.js';
import { setupThemeControls } from './theme.js';
import { configureMaterials, physicalSurface, loadEnvironment } from './materials.js';
import { setupDistrictUI } from './district-ui.js';
import { setupSidebar } from './sidebar.js';
import { renderPixelRatio } from './viewport.js';
import { createWalkingControls } from './walking-ui.js';
import { createCommunityPanel } from './community-ui.js';
import { buildDistrictBuildings, buildDistrictDetail } from './district.js';
import { buildDistrictFantasy } from './district-fantasy.js';
import { buildLocals } from './locals.js';
import { buildStorePeople } from './store-people.js';
import { storeRoomsFor } from './store-rooms.js';
import { buildFoliage, buildObservedFoliage } from './foliage.js';
import { validateVegetation } from './vegetation.js';
import { createStorefrontReflections } from './reflections.js';
import { buildStreetFurniture } from './street-furniture.js';
import { atmosphereFor } from './atmosphere.js';
import { createWalkingEnvironment } from './walking.js';
import './style.css';
import './playground-theme.css';
import './district-theme.css';
import './immersive.css';

setupThemeControls();
setupSidebar();
const $ = (selector) => document.querySelector(selector);
const host = $('#canvas-host');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer, pipeline, world, worldGroup, buildingMesh, walking, community, localsGroup, storePeople, interiorsLayer;
let districtUI, environmentAssets = null, storefrontReflections = null;
let layers = {}, loading = false;
let lastRenderStats = 0;

const scene = new THREE.Scene();
// Street level only: the range reaches the fogged context ground while keeping
// depth precision for the 6 cm walking near plane.
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 6000);
const sun = new THREE.DirectionalLight('#fff2d8', 2.5);
const ambient = new THREE.HemisphereLight('#eef4eb', '#73806c', 2.3);
const clock = new THREE.Timer();
const sunOffset = new THREE.Vector3();
const shadowCenter = new THREE.Vector3();
const reflectionPosition = new THREE.Vector3();
// A small pool of warm point lights follows the visitor into the nearest boutiques.
const storeLights = Array.from({ length: 8 }, () => { const light = new THREE.PointLight('#ffd9ae', 0, 10, 2); light.castShadow = false; scene.add(light); return light; });
const walkerPosition = new THREE.Vector3();

function showError(message) {
  const panel = $('#loading');
  panel.hidden = false;
  panel.classList.add('error');
  panel.querySelector('h2').textContent = 'Preview unavailable';
  panel.querySelector('p').textContent = message;
  $('#connection').textContent = 'Local data unavailable';
}

function initializeRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  configureMaterials(renderer);
  pipeline = createRenderPipeline(renderer, scene, camera);
  const debugOcclusion = new URLSearchParams(location.search).get('ao');
  if (debugOcclusion === 'off') pipeline.setOcclusion(false);
  else if (debugOcclusion === 'only') pipeline.occlusion.output = 5;
  loadEnvironment(renderer, scene).then((assets) => { environmentAssets = assets; updateAtmosphere(); }).catch(() => { $('#connection').textContent = 'Sky lighting unavailable · base lighting active'; });
  host.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showError('The browser lost its graphics context. Reload this page to rebuild the scene.');
  });
  community = createCommunityPanel({ host: $('.panel-scroll'), reducedMotion,
    getVisitor: () => walking?.active ? walking.getPosition() : null,
    getWeather: () => ({storm:$('#weather').value === 'overcast',hour:Number($('#sun-hour').value),humidity:$('#weather').value==='haze'?0.9:0.72}),
    onFocus(local) {
    const position = walking.active ? walking.getPosition() : null;
    if (!position || Math.hypot(position[0]-local.position[0], position[1]-local.position[1]) > 4) {
      enterWalk([local.position[0], local.position[1]-2.5, local.position[2]], local.position);
    } else walking.lookAt(local.position);
  } });
  $('.panel-scroll').prepend($('#community-section'));
  walking = createWalkingControls({ camera, host, reducedMotion, onMeetNearby: () => community.meetNearby(), onTalk: id => community.selectLocal(id), getLocals: () => community.state?.locals, onEnter: enterStore, onLeave: leaveStore });
  districtUI = setupDistrictUI({ onArrive: arriveAtStore, onEnter: enterStore, onAtmosphere: updateAtmosphere, describeStore: describeInterior });
  sun.castShadow = true;
  const shadowResolution=Math.min(4096,renderer.capabilities.maxTextureSize);
  sun.shadow.mapSize.set(shadowResolution,shadowResolution);
  sun.shadow.bias = -0.00002;
  sun.shadow.normalBias = 0.018;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 12000;
  scene.add(ambient, sun, sun.target);
  new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    renderer.setPixelRatio(renderPixelRatio(width, height, window.devicePixelRatio));
    renderer.setSize(width, height);
    pipeline.resize(width, height, renderer.getPixelRatio());
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }).observe(host);
  updateAtmosphere();
  renderer.setAnimationLoop(render);
}

function geometryFromTriangles(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildGround(data) {
  const group = new THREE.Group();
  const [west, south, east, north] = data.bounds_m;
  const width = east - west, depth = north - south;
  const center = [(east + west) / 2, (north + south) / 2];
  const terrain = data.terrain;
  let surface;
  if (terrain) {
    const positions = [], indices = [], uvs = [];
    for (let row = 0; row < terrain.height; row += 1) {
      for (let column = 0; column < terrain.width; column += 1) {
        const x = terrain.grid_origin_m[0] + column * terrain.spacing_m[0];
        const y = terrain.grid_origin_m[1] + row * terrain.spacing_m[1];
        positions.push(x, terrain.heights_m[row * terrain.width + column], -y);
        uvs.push(x, -y);
        if (row < terrain.height - 1 && column < terrain.width - 1) {
          const a = row * terrain.width + column, b = a + 1, c = a + terrain.width, d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    surface = new THREE.Mesh(geometry, physicalSurface('pavement', { tileSize: 2, normalScale: new THREE.Vector2(0.4, 0.4), variation: 0.22 }));
    surface.position.y = 0.15;
  } else {
    surface = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), physicalSurface('pavement', { tileSize: 2, normalScale: new THREE.Vector2(0.4, 0.4), variation: 0.22 }));
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(center[0], 0, -center[1]);
  }
  surface.receiveShadow = true;
  group.add(surface);
  const minimum = terrain ? terrain.heights_m.reduce((low, value) => Math.min(low, value), Infinity) : 0;
  const base = new THREE.Mesh(new THREE.BoxGeometry(width, 35, depth), new THREE.MeshStandardMaterial({ color: '#635745', roughness: 1 }));
  base.position.set(center[0], minimum - 18, -center[1]);
  group.add(base);
  // Surrounding ground continues to the fogged horizon so the mapped block no
  // longer floats over the sky probe's lower hemisphere. It is context only.
  const context = new THREE.CircleGeometry(25000, 72); context.rotateX(-Math.PI / 2);
  const positions = context.getAttribute('position'), contextUv = new Float32Array(positions.count * 2);
  for (let i = 0; i < positions.count; i++) { contextUv[i * 2] = positions.getX(i) + center[0]; contextUv[i * 2 + 1] = positions.getZ(i) - center[1]; }
  context.setAttribute('uv', new THREE.BufferAttribute(contextUv, 2));
  const surroundings = new THREE.Mesh(context, physicalSurface('grass', { tileSize: 14, variation: 0.6, color: '#a3a888', roughness: 1 }));
  surroundings.position.set(center[0], minimum - 0.35, -center[1]); surroundings.receiveShadow = true;
  group.add(surroundings);
  return group;
}

function buildRoads(data) {
  const vertices = [];
  for (const road of data.roads) {
    for (let i = 1; i < road.points.length; i += 1) {
      const a = localToScene(road.points[i - 1]), b = localToScene(road.points[i]);
      const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
      if (!length) continue;
      const half = road.width_m / 2, ox = -dz / length * half, oz = dx / length * half;
      // Subdivide long source segments to follow observed terrain without moving the centerline.
      const steps = Math.max(1, Math.ceil(length / 16));
      const at = (fraction, side) => {
        const x = a[0] + dx * fraction + ox * side;
        const z = a[2] + dz * fraction + oz * side;
        const y = data.terrain ? terrainHeight(data.terrain, x, -z) : a[1] + (b[1] - a[1]) * fraction;
        return [x, y + 0.24, z];
      };
      for (let step = 0; step < steps; step += 1) {
        const p = at(step / steps, 1), q = at(step / steps, -1), r = at((step + 1) / steps, 1), s = at((step + 1) / steps, -1);
        vertices.push(...p, ...r, ...q, ...q, ...r, ...s);
      }
    }
  }
  const geometry = geometryFromTriangles(vertices);
  const uvs = [];
  for (let index = 0; index < vertices.length; index += 3) uvs.push(vertices[index], vertices[index + 2]);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(geometry, physicalSurface('asphalt', { tileSize: 7, normalScale: new THREE.Vector2(0.22, 0.22), color: '#b4b8bd', roughness: 0.82, side: THREE.DoubleSide, variation: 0.3 }));
  mesh.receiveShadow = true;
  return mesh;
}

function populateWorld(data) {
  walking?.exit();
  storefrontReflections?.dispose(); storefrontReflections = null;
  if (worldGroup) {
    scene.remove(worldGroup);
    worldGroup.remove(buildingMesh);
    buildingMesh?.userData.dispose?.();
    worldGroup.remove(localsGroup);
    localsGroup?.userData.dispose?.();
    worldGroup.remove(interiorsLayer);
    storePeople?.userData.dispose?.(); storePeople = null; interiorsLayer = null;
    worldGroup.traverse((item) => {
      item.userData.texture?.dispose();
      item.geometry?.dispose();
      if (Array.isArray(item.material)) item.material.forEach((material) => material.dispose());
      else item.material?.dispose();
      if (item.isInstancedMesh) item.dispose();
    });
  }
  world = data;
  worldGroup = new THREE.Group();
  buildingMesh = buildDistrictBuildings(data);
  community.setWorld(data);
  localsGroup = buildLocals(data, community.state.locals);
  storePeople = buildStorePeople(buildingMesh.userData.rooms ?? [], { reducedMotion });
  interiorsLayer = new THREE.Group(); interiorsLayer.name = 'Boutique interiors layer';
  interiorsLayer.add(buildingMesh.userData.interiors, storePeople);
  layers = { ground: buildGround(data), roads: buildRoads(data), buildings: buildingMesh, interiors: interiorsLayer, trees: data.vegetation ? buildObservedFoliage(data) : buildFoliage(data.trees) };
  Object.values(layers).forEach((layer) => worldGroup.add(layer));
  worldGroup.add(localsGroup);
  worldGroup.add(buildDistrictDetail(data));
  worldGroup.add(buildStreetFurniture(data, createWalkingEnvironment(data).isFree));
  buildingMesh.add(buildDistrictFantasy(data));
  document.querySelectorAll('[data-layer]').forEach((input) => { layers[input.dataset.layer].visible = input.checked; });
  scene.add(worldGroup);
  storefrontReflections = createStorefrontReflections({
    renderer, scene, materials: buildingMesh.userData.reflectionMaterials,
    excluded: [...buildingMesh.userData.reflectionExclusions, localsGroup, storePeople,
      ...scene.children.filter(child => child !== worldGroup && !child.isLight)],
  });
  updateAtmosphere();
  document.body.classList.add('district');
  $('#district-source').hidden = false;
  $('#district-directory').hidden = false;
  $('#building-layer-label').textContent = 'Boutiques & architecture';
  districtUI.setStores(data.stores, 'Dior');
  $('#view-scale').textContent = 'Street level · meet the locals';
  $('#connection').textContent = 'River Oaks District · ready to explore';
  $('#stores-count').textContent = data.stores.length;
  $('#terrain-state').textContent = 'Mapped district terrain';
  $('#canopy-state').textContent = data.vegetation ? '2018 LiDAR canopy' : 'District trees';
  $('#canopy-source').hidden = !data.vegetation;
  if (data.vegetation) $('#canopy-source').textContent = 'Tree placement follows 2018 LiDAR. Foliage is interpreted; the independent historical canopy comparison does not pass.';
  const limitations = $('#limitations');
  limitations.replaceChildren(...(data.limitations ?? []).map((text) => { const item = document.createElement('li'); item.textContent = text; return item; }));
}

function enterWalk(position, lookAt, pitch = 0) {
  if (!world || !walking) return;
  walking.enter(world, position, lookAt, pitch);
}

function enterStore(store) {
  const room = storeRoomsFor(world).find(item => item.storeId === store.id);
  if (!room) return arriveAtStore(store);
  const [east, north] = room.toWorld(0, 2.4), [lookEast, lookNorth] = room.toWorld(room.center, room.depth - 1);
  districtUI.select(store.id);
  enterWalk([east, north, room.floor], [lookEast, lookNorth], 0.02);
}

function leaveStore(store) {
  // Step out onto the threshold, facing the door you just came through.
  const [x, north, base] = store.facade, [nx, ny] = store.outward;
  enterWalk([x + nx * 2.6, north + ny * 2.6, base], [x, north], 0.05);
}

function describeInterior(store) {
  const room = world ? storeRoomsFor(world).find(item => item.storeId === store.id) : null;
  if (!room) return 'Exterior viewing destination.';
  const { label, staff, guests, mannequins, highlights } = room.summary;
  const people = [`${staff} associate${staff === 1 ? '' : 's'}`, `${guests} guest${guests === 1 ? '' : 's'}`, mannequins ? `${mannequins} mannequin${mannequins === 1 ? '' : 's'}` : null].filter(Boolean).join(', ');
  return `${label} · ${Math.round(room.width)} × ${Math.round(room.depth)} m walk-in floor · ${people} · ${highlights.join(', ')}. Imagined interior, not a photographed store.`;
}

function arriveAtStore(store) {
  const position = [...store.visit];
  position[0] += store.outward[0] * 4;
  position[1] += store.outward[1] * 4;
  enterWalk(position, store.facade, 0.22);
}

function updateAtmosphere() {
  const hour = Number($('#sun-hour').value), weather = $('#weather').value;
  $('#sun-time').textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
  const atmosphere = atmosphereFor(hour, weather);
  sunOffset.set(Math.cos(atmosphere.angle) * 4500, Math.max(300, Math.sin(atmosphere.angle) * 5500), 1900);
  sun.position.copy(sun.target.position).add(sunOffset);
  sun.intensity = atmosphere.sunIntensity;
  sun.color.copy(atmosphere.sunColor);
  ambient.intensity = atmosphere.ambientIntensity;
  scene.background = environmentAssets && weather !== 'overcast' ? environmentAssets.hdr : atmosphere.horizon;
  scene.backgroundIntensity = atmosphere.backgroundIntensity;
  scene.environmentIntensity = atmosphere.environmentIntensity;
  // FogExp2 squares density × depth: 0.00055 leaves the street clear and fades the horizon.
  scene.fog = new THREE.FogExp2(atmosphere.horizon, atmosphere.fogDensity);
  if (renderer) renderer.toneMappingExposure = atmosphere.exposure;
  if (layers.roads?.material) {
    layers.roads.material.roughness = weather === 'overcast' ? 0.38 : 1;
  }
  storefrontReflections?.invalidate();
  districtUI?.syncAtmosphere();
}

async function jsonResponse(path) {
  const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload.detail === 'string' ? payload.detail : `${path} returned HTTP ${response.status}`);
  }
  return response.json();
}

async function loadWorld() {
  if (loading) return;
  loading = true;
  $('#reload').disabled = true;
  $('#loading').hidden = false;
  $('#loading').classList.remove('error');
  $('#loading h2').textContent = 'Building the view';
  $('#loading p').textContent = 'Opening the boutiques and gardens…';
  try {
    const [data, vegetation] = await Promise.all([jsonResponse('/data/district.json'), jsonResponse('/data/district-vegetation.json')]);
    if (data.schema_version !== 1 || data.scene !== 'district' || !Array.isArray(data.bounds_m) || !['roads', 'stores', 'buildings', 'trees'].every(key => Array.isArray(data[key]))) throw new Error('The district data does not match the supported schema.');
    data.vegetation = validateVegetation(data, vegetation);
    populateWorld(data);
    $('#verification-state').textContent = 'A real district, reimagined';
    $('#verification-detail').textContent = `${data.stores.length} real store names on mapped streets, with imagined architecture, pink glass lanterns, and fictional encounters. This is an artistic interpretation.`;
    $('#verification-dot').className = 'status-dot pass';
    $('#loading').hidden = true;
    enterWalk(data.walkSpawn, data.walkLookAt);
  } catch (error) {
    showError(`${error.message}. Use reload to try loading the district again.`);
  } finally {
    loading = false;
    $('#reload').disabled = false;
  }
}


function updateStoreLights() {
  const positions = interiorsLayer?.visible ? buildingMesh?.userData.interiors?.userData.lightPositions ?? [] : [];
  const picked = [];
  for (const item of positions) { const d2 = item.position.distanceToSquared(camera.position); if (d2 < 32 * 32) picked.push([d2, item]); }
  picked.sort((left, right) => left[0] - right[0]);
  storeLights.forEach((light, index) => {
    const hit = picked[index];
    if (hit) { light.position.copy(hit[1].position); light.intensity = 10; } else light.intensity = 0;
  });
}

function followSunShadow() {
  if (!world) return;
  const target = camera.position;
  const height = camera.position.y - terrainHeight(world.terrain, camera.position.x, -camera.position.z);
  const span = Math.max(36, Math.min(80, height * 0.6));
  const snap = span * 2 / sun.shadow.mapSize.x;
  shadowCenter.set(Math.round(target.x / snap) * snap, target.y, Math.round(target.z / snap) * snap);
  sun.target.position.copy(shadowCenter);
  sun.position.copy(shadowCenter).add(sunOffset);
  const distance=sunOffset.length(), depth=Math.max(160,span*2);
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near:Math.max(1,distance-depth),far:distance+depth });
  sun.shadow.camera.updateProjectionMatrix();
}

function render(now) {
  clock.update();
  const delta = Math.min(clock.getDelta(), 0.08);
  community?.update(delta, now);
  if (localsGroup && community?.state) localsGroup.userData.update(community.state, camera, now, community.speakingId);
  layers.trees?.userData.update?.(camera.position);
  if (storePeople && interiorsLayer?.visible) storePeople.userData.update(camera, now);
  if (buildingMesh?.userData.updateDoors) {
    const visitor = walking?.active ? walking.getPosition() : null;
    if (visitor) walkerPosition.set(visitor[0], visitor[2], -visitor[1]);
    buildingMesh.userData.updateDoors([visitor ? walkerPosition : null, ...(community?.state?.locals ?? []).slice(0, 0)], delta);
  }
  updateStoreLights();
  walking?.update(delta, now);
  followSunShadow();
  if (storefrontReflections && environmentAssets) {
    const ground = terrainHeight(world.terrain, camera.position.x, -camera.position.z);
    if (camera.position.y - ground < 18) reflectionPosition.set(camera.position.x, ground + 2.5, camera.position.z);
    else {
      const stop = world.stores.find(store => store.name === 'Dior').visit;
      reflectionPosition.set(stop[0], terrainHeight(world.terrain, stop[0], stop[1]) + 2.5, -stop[1]);
    }
    storefrontReflections.update(now, reflectionPosition);
  }
  renderer.info.reset();
  pipeline.render(delta);
  if (now-lastRenderStats>1000) {
    host.dataset.renderStats=JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});
    host.dataset.reflections = JSON.stringify(storefrontReflections?.stats ?? null);
    host.dataset.pipeline = JSON.stringify(pipeline.stats);
    lastRenderStats=now;
  }
}

document.querySelectorAll('[data-layer]').forEach((input) => input.addEventListener('change', () => {
  if (layers[input.dataset.layer]) layers[input.dataset.layer].visible = input.checked;
  storefrontReflections?.invalidate();
  districtUI?.syncAtmosphere();
}));
$('#sun-hour').addEventListener('input', updateAtmosphere);
$('#weather').addEventListener('change', updateAtmosphere);
document.addEventListener('appearancechange', updateAtmosphere);
$('#reload').addEventListener('click', loadWorld);
let pointerStart;
host.addEventListener('pointerdown', (event) => { pointerStart = [event.clientX, event.clientY]; });
host.addEventListener('pointerup', (event) => {
  if (!localsGroup?.visible || !pointerStart || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5) return;
  const rect = host.getBoundingClientRect();
  const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const person = raycaster.intersectObject(localsGroup, true)[0];
  if (person?.object.userData.localId && (!walking.active || person.distance < 5)) { community.selectLocal(person.object.userData.localId); return; }

});

try {
  initializeRenderer();
  loadWorld();
} catch (error) {
  showError(`WebGL could not initialize: ${error.message}`);
}
