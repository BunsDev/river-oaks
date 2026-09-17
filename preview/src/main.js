import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { localToScene, parcelSegments, routeSegments, sampleRoute, terrainHeight } from './geometry.js';
import { canopyGeometry } from './canopy.js';
import { setupThemeControls } from './theme.js';
import { createHoverMoped } from './hover-moped.js';
import { buildBuildings } from './buildings.js';
import { createEconomyPanel } from './economy-ui.js';
import { configureMaterials, physicalSurface, loadEnvironment } from './materials.js';
import { setupSidebar } from './sidebar.js';
import { renderPixelRatio } from './viewport.js';
import { createWalkingControls } from './walking-ui.js';
import { createCommunityPanel } from './community-ui.js';
import { buildDistrictBuildings, buildDistrictDetail } from './district.js';
import { buildLocals } from './locals.js';
import { buildFoliage } from './foliage.js';
import './style.css';
import './playground-theme.css';

setupThemeControls();
setupSidebar();
const $ = (selector) => document.querySelector(selector);
const host = $('#canvas-host');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const styleNames = { tudor_revival: 'Tudor revival', georgian_colonial: 'Georgian colonial', french_eclectic: 'French eclectic', modern_estate: 'Modern estate' };
let renderer, controls, world, worldGroup, buildingMesh, markerMesh, moped, economy, walking, community, localsGroup;
let savedCamera = null, environmentAssets = null;
let layers = {}, markers = [], animationTime = 0, moving = !reducedMotion, cameraTransition = null, loading = false;
let overviewTarget = new THREE.Vector3(), closeupTarget = new THREE.Vector3(), extent = 4000;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 25000);
const sun = new THREE.DirectionalLight('#fff2d8', 2.5);
const ambient = new THREE.HemisphereLight('#eef4eb', '#73806c', 2.3);
const object = new THREE.Object3D();
const clock = new THREE.Timer();
const markerColor = new THREE.Color();
const sunOffset = new THREE.Vector3();
const shadowCenter = new THREE.Vector3();

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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  configureMaterials(renderer);
  loadEnvironment(renderer, scene).then((assets) => { environmentAssets = assets; updateAtmosphere(); }).catch(() => { $('#connection').textContent = 'Sky lighting unavailable · base lighting active'; });
  host.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showError('The browser lost its graphics context. Reload this page to rebuild the scene.');
  });
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.08;
  controls.minDistance = 12;
  controls.maxDistance = 12000;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.listenToKeyEvents(host);
  controls.addEventListener('start', () => { cameraTransition = null; });
  moped = createHoverMoped({ camera, scene, host, reducedMotion, onExit: exitRide });
  let stormActive = false;
  economy = createEconomyPanel({ onWeather(storm) {
    if (storm) $('#weather').value = 'overcast';
    else if (stormActive) $('#weather').value = 'clear';
    stormActive = storm;
    updateAtmosphere();
  } });
  community = createCommunityPanel({ host: $('.panel-scroll'), getEconomy: () => economy.enabled ? economy.state : null, onFocus(local) {
    if (moped.active) exitRide();
    const position = walking.active ? walking.getPosition() : null;
    if (!position || Math.hypot(position[0]-local.position[0], position[1]-local.position[1]) > 6) {
      enterWalk([local.position[0], local.position[1]-2.5, local.position[2]], local.position);
    } else walking.lookAt(local.position);
  } });
  $('.scene-section').after($('#community-section'));
  walking = createWalkingControls({ camera, host, reducedMotion, onExit: exitWalk, onTalk: id => community.selectLocal(id), getLocals: () => community.state?.locals });
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.06;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 12000;
  scene.add(ambient, sun, sun.target);
  new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    renderer.setPixelRatio(renderPixelRatio(width, height, window.devicePixelRatio));
    renderer.setSize(width, height);
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
    surface = new THREE.Mesh(geometry, physicalSurface(data.scene === 'district' ? 'pavement' : 'grass', { tileSize: data.scene === 'district' ? 2 : 3, normalScale: new THREE.Vector2(0.4, 0.4) }));
    if (data.scene === 'district') surface.position.y = 0.15;
  } else {
    surface = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), physicalSurface('grass', { tileSize: 3, normalScale: new THREE.Vector2(0.4, 0.4) }));
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(center[0], 0, -center[1]);
  }
  surface.receiveShadow = true;
  group.add(surface);
  const minimum = terrain ? terrain.heights_m.reduce((low, value) => Math.min(low, value), Infinity) : 0;
  const base = new THREE.Mesh(new THREE.BoxGeometry(width, 35, depth), new THREE.MeshStandardMaterial({ color: '#635745', roughness: 1 }));
  base.position.set(center[0], minimum - 18, -center[1]);
  group.add(base);
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
        return [x, y + (data.scene === 'district' ? 0.24 : 0.16), z];
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
  const mesh = new THREE.Mesh(geometry, physicalSurface('asphalt', { tileSize: 3, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  return mesh;
}

function buildParcels(data) {
  const vertices = [];
  for (const parcel of data.parcels) {
    for (const [a, b] of parcelSegments(parcel)) {
      for (const point of [a, b]) vertices.push(point[0], terrainHeight(data.terrain, point[0], point[1]) + 0.23, -point[1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#74876a', transparent: true, opacity: 0.53 }));
}

function buildTrees(data) {
  if (data.scene === 'district') return buildFoliage(data.trees);
  const group = new THREE.Group();
  if (!data.trees.length) return group;
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#657f58', roughness: 1 }), data.trees.length);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), new THREE.MeshStandardMaterial({ color: '#8f8770', roughness: 1 }), data.trees.length);
  data.trees.forEach((tree, index) => {
    const [x, y, z] = localToScene(tree.position);
    const radius = tree.crown_radius_m, height = tree.height_m;
    object.position.set(x, y + height / 2, z);
    object.scale.set(Math.max(0.2, radius * 0.06), height, Math.max(0.2, radius * 0.06));
    object.rotation.set(0, 0, 0);
    object.updateMatrix();
    trunks.setMatrixAt(index, object.matrix);
    object.position.set(x, y + height * 0.7, z);
    object.scale.set(radius, height * 0.3, radius);
    object.updateMatrix();
    crowns.setMatrixAt(index, object.matrix);
  });
  crowns.castShadow = true;
  crowns.receiveShadow = true;
  group.add(crowns, trunks);
  return group;
}

function buildMarkers(data) {
  const routes = data.roads.map((road) => routeSegments(road.points)).filter(Boolean);
  const count = routes.length ? 300 : 0;
  markers = Array.from({ length: count }, (_, index) => {
    const route = routes[(index * 37) % routes.length];
    return { route, offset: route.length * ((index * 0.61803398875) % 1), speed: 3 + (index % 9) * 0.7 };
  });
  const torso = new THREE.CapsuleGeometry(0.17, 0.37, 4, 8); torso.translate(0, 1.16, 0);
  const head = new THREE.SphereGeometry(0.13, 8, 6); head.translate(0, 1.67, 0);
  const left = new THREE.CapsuleGeometry(0.07, 0.63, 4, 8); left.translate(-0.10, 0.5, 0);
  const right = left.clone(); right.translate(0.2, 0, 0);
  const geometry = mergeGeometries([torso, head, left, right]);
  for (const part of [torso, head, left, right]) part.dispose();
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: '#ae7047', roughness: 0.9 }), count);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  $('#marker-count').textContent = String(count);
  return mesh;
}

function buildCanopy(data) {
  const reference = data.canopy_reference;
  if (!reference?.geometry) return new THREE.Group();
  return new THREE.Mesh(canopyGeometry(reference.geometry, data.terrain), new THREE.MeshStandardMaterial({ color: '#62825c', roughness: 1, transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide }));
}

function populateWorld(data) {
  exitRide();
  exitWalk();
  if (worldGroup) {
    scene.remove(worldGroup);
    worldGroup.remove(buildingMesh);
    buildingMesh?.userData.dispose?.();
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
  buildingMesh = data.scene === 'district' ? buildDistrictBuildings(data) : buildBuildings(data);
  markerMesh = buildMarkers(data);
  economy.setWorld(data);
  community.setWorld(data);
  localsGroup = buildLocals(data, community.state.locals);
  layers = { ground: buildGround(data), roads: buildRoads(data), parcels: buildParcels(data), buildings: buildingMesh, trees: buildTrees(data), canopy: buildCanopy(data), markers: markerMesh };
  Object.values(layers).forEach((layer) => worldGroup.add(layer));
  worldGroup.add(localsGroup);
  if (data.scene === 'district') worldGroup.add(buildDistrictDetail(data));
  document.querySelectorAll('[data-layer]').forEach((input) => { layers[input.dataset.layer].visible = input.checked; });
  if (data.scene === 'district' && !economy.enabled) { markerMesh.visible = false; $('input[data-layer="markers"]').checked = false; }
  scene.add(worldGroup);
  const [west, south, east, north] = data.bounds_m;
  const center = [(west + east) / 2, (south + north) / 2];
  overviewTarget.set(center[0], terrainHeight(data.terrain, ...center), -center[1]);
  extent = Math.max(east - west, north - south);
  const desired = data.buildings.reduce((best, building) => {
    const distance = Math.hypot(building.center[0] + 250, building.center[1]);
    return !best || distance < best.distance ? { building, distance } : best;
  }, null)?.building;
  closeupTarget.fromArray(desired ? localToScene(desired.center) : overviewTarget.toArray());
  const span = extent * 0.6;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span });
  sun.shadow.camera.updateProjectionMatrix();
  sun.target.position.copy(overviewTarget);
  updateAtmosphere();
  setCamera('overview', true);
  document.body.classList.toggle('district', data.scene === 'district');
  $('#district-source').hidden = data.scene !== 'district';
  $('#district-directory').hidden = data.scene !== 'district';
  $('#building-layer-label').textContent = data.scene === 'district' ? 'Mapped storefronts' : 'Procedural homes';
  $('#destination').replaceChildren(...(data.stores ?? []).map(store => { const option = document.createElement('option'); option.value = store.id; option.textContent = store.name; return option; }));
  if (data.scene === 'district') {
    const dior = data.stores.find(store => store.name === 'Dior');
    $('#destination').value = dior.id;
    closeupTarget.fromArray(localToScene(dior.visit));
    $('#view-scale').textContent = 'Mapped footprints · interpreted facades';
    $('#connection').textContent = 'District map loaded · development view';
  }
  for (const key of ['roads', 'parcels', 'buildings', 'trees']) $(`#${key}-count`).textContent = data[key].length.toLocaleString();
  $('#terrain-state').textContent = data.terrain ? 'Observed elevation grid' : 'Flat · elevation missing';
  const canopy = data.canopy_reference;
  const hasCanopyCover = Boolean(canopy?.geometry);
  $('#canopy-state').textContent = data.trees.length ? `${data.trees.length.toLocaleString()} observed trees` : hasCanopyCover ? `${canopy.source_label_year ?? 'Historical'} cover · 0 tree points` : 'Not acquired · 0 trees';
  $('#canopy-layer').hidden = !hasCanopyCover;
  $('#canopy-layer-label').textContent = `${canopy?.source_label_year ?? 'Historical'} canopy cover`;
  $('#canopy-source').hidden = !hasCanopyCover;
  $('#canopy-source').textContent = hasCanopyCover ? `${canopy.source_label_year ?? 'Historical'} classified canopy footprint; not individual stems or species. Source: ${canopy.source_id}.` : '';
  const limitations = $('#limitations');
  limitations.replaceChildren(...(data.limitations ?? []).map((text) => { const item = document.createElement('li'); item.textContent = text; return item; }));
  $('#selection').hidden = true;
  if (data.scene !== 'district') $('#connection').textContent = 'Local source data loaded';
}

function setCamera(preset, immediate = false) {
  if (!world) return;
  exitRide();
  exitWalk();
  const target = preset === 'overview' ? overviewTarget.clone() : closeupTarget.clone();
  // Portrait viewports need more distance to fit the full east-west extent.
  const fit = Math.max(1, 1 / camera.aspect);
  const offset = preset === 'overview' ? new THREE.Vector3(extent * 0.30, extent * 0.86, extent * 0.74).multiplyScalar(fit) : new THREE.Vector3(95, 85, 145);
  const destination = target.clone().add(offset);
  if (immediate || reducedMotion) { camera.position.copy(destination); controls.target.copy(target); controls.update(); }
  else cameraTransition = { start: performance.now(), from: camera.position.clone(), fromTarget: controls.target.clone(), to: destination, target };
  for (const name of ['overview', 'street']) {
    $(`#${name}`).classList.toggle('active', name === preset);
    $(`#${name}`).setAttribute('aria-pressed', String(name === preset));
  }
  $('#view-name').textContent = world.scene === 'district' ? preset === 'overview' ? 'River Oaks District · 4444 Westheimer' : 'District storefronts · closeup' : preset === 'overview' ? 'Neighborhood overview' : 'Residential block · closeup';
}

function enterWalk(position, lookAt) {
  if (!world || !walking) return;
  exitRide();
  if (!walking.active) savedCamera = { position: camera.position.clone(), target: controls.target.clone(), preset: ['overview', 'street'].find(name => $(`#${name}`).getAttribute('aria-pressed') === 'true') };
  cameraTransition = null;
  controls.enabled = false;
  walking.enter(world, position, lookAt);
  $('#walk').setAttribute('aria-pressed', 'true');
}

function exitWalk() {
  if (!walking?.active) return;
  walking.exit(); controls.enabled = true;
  if (savedCamera) { camera.position.copy(savedCamera.position); controls.target.copy(savedCamera.target); controls.update(); }
  $('#walk').setAttribute('aria-pressed', 'false');
  host.setAttribute('aria-label', '3D map. Drag to orbit, right-drag to pan, scroll to zoom.');
}

function enterRide() {
  if (!world || moped.active) return;
  exitWalk();
  cameraTransition = null;
  savedCamera = { position: camera.position.clone(), target: controls.target.clone(), preset: ['overview', 'street'].find((name) => $(`#${name}`).getAttribute('aria-pressed') === 'true') };
  controls.enabled = false;
  moped.enter(world);
  host.setAttribute('aria-label', 'Hover moped. WASD steers and controls speed, Q and E change altitude, H pauses, Escape exits.');
  $('#ride').setAttribute('aria-pressed', 'true');
  for (const preset of ['overview', 'street']) { $(`#${preset}`).classList.remove('active'); $(`#${preset}`).setAttribute('aria-pressed', 'false'); }
}

function exitRide() {
  if (!moped?.active) return;
  moped.exit();
  controls.enabled = true;
  if (savedCamera) { camera.position.copy(savedCamera.position); controls.target.copy(savedCamera.target); controls.update(); }
  for (const name of ['overview', 'street']) { $(`#${name}`).classList.toggle('active', name === savedCamera?.preset); $(`#${name}`).setAttribute('aria-pressed', String(name === savedCamera?.preset)); }
  host.setAttribute('aria-label', '3D map. Drag to orbit, right-drag to pan, scroll to zoom. Arrow keys pan when focused.');
  $('#ride').setAttribute('aria-pressed', 'false');
  $('#ride').focus({ preventScroll: true });
}

function updateAtmosphere() {
  const hour = Number($('#sun-hour').value), weather = $('#weather').value;
  $('#sun-time').textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
  const angle = (hour - 6) / 14 * Math.PI;
  sunOffset.set(Math.cos(angle) * 4500, Math.max(300, Math.sin(angle) * 5500), 1900);
  sun.position.copy(sun.target.position).add(sunOffset);
  sun.intensity = weather === 'overcast' ? 0.8 : 3.2;
  sun.color.set(hour > 17 || hour < 9 ? '#ffca91' : '#fff2d8');
  ambient.intensity = weather === 'overcast' ? 0.55 : 0.35;
  const horizon = new THREE.Color(weather === 'overcast' ? '#b9c3c9' : weather === 'haze' ? '#d2cfc1' : '#c7dce9');
  scene.background = environmentAssets && weather !== 'overcast' ? environmentAssets.hdr : horizon;
  scene.backgroundIntensity = hour > 17 ? 0.48 : 0.7;
  scene.environmentIntensity = weather === 'overcast' ? 0.45 : 0.7;
  scene.fog = new THREE.FogExp2(horizon, weather === 'haze' ? 0.0003 : 0.000075);
  if (layers.roads?.material) {
    layers.roads.material.roughness = weather === 'overcast' ? 0.38 : 1;
  }
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
  $('#scene-select').disabled = true;
  $('#loading').hidden = false;
  $('#loading').classList.remove('error');
  $('#loading h2').textContent = 'Building the view';
  $('#loading p').textContent = 'Loading local road and parcel geometry…';
  try {
    const district = $('#scene-select').value === 'district';
    const [worldResult, reportResult] = await Promise.allSettled([jsonResponse(district ? '/data/district.json' : '/v1/world'), district ? Promise.resolve(null) : jsonResponse('/v1/verification')]);
    if (worldResult.status !== 'fulfilled') throw worldResult.reason;
    const data = worldResult.value;
    if (data.schema_version !== 1 || !Array.isArray(data.bounds_m) || !['roads', 'parcels', 'buildings', 'trees'].every((key) => Array.isArray(data[key]))) throw new Error('The world manifest does not match the supported geometry schema.');
    populateWorld(data);
    if (district) {
      $('#verification-state').textContent = 'District reconstruction in progress';
      $('#verification-detail').textContent = `${data.stores.length} directory-matched destinations. Footprints and tenant points from OpenStreetMap; facades and entrances need photographic/site verification.`;
      $('#verification-dot').className = 'status-dot';
    } else if (reportResult.status === 'fulfilled') {
      const report = reportResult.value;
      const checks = Object.values(report.checks ?? {});
      const passed = checks.filter((check) => check.status === 'pass').length;
      const blocked = checks.filter((check) => check.status !== 'pass').length;
      $('#verification-state').textContent = report.status === 'pass' ? 'Current checks passed' : report.status === 'fail' ? 'Verification issues found' : 'Release gates blocked';
      $('#verification-detail').textContent = `${passed} checks passed · ${blocked} outstanding. GIS import checks do not establish independent survey accuracy.`;
      $('#verification-dot').className = `status-dot ${report.status === 'pass' ? 'pass' : report.status === 'fail' ? 'fail' : ''}`;
    } else {
      $('#verification-state').textContent = 'Verification unavailable';
      $('#verification-detail').textContent = `${reportResult.reason.message}. The scene remains an unverified development view.`;
      $('#verification-dot').className = 'status-dot fail';
    }
    $('#loading').hidden = true;
    if (district) enterWalk(data.walkSpawn, data.walkLookAt);
  } catch (error) {
    showError(`${error.message}. Start the local bridge on port 8765, then use the reload button.`);
  } finally {
    loading = false;
    $('#reload').disabled = false;
    $('#scene-select').disabled = false;
  }
}


function followSunShadow() {
  if (!world) return;
  const target = moped?.active || walking?.active ? camera.position : controls.target;
  const height = camera.position.y - terrainHeight(world.terrain, camera.position.x, -camera.position.z);
  const span = Math.max(110, Math.min(2200, height * 0.6));
  const snap = span * 2 / 2048;
  shadowCenter.set(Math.round(target.x / snap) * snap, target.y, Math.round(target.z / snap) * snap);
  sun.target.position.copy(shadowCenter);
  sun.position.copy(shadowCenter).add(sunOffset);
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span });
  sun.shadow.camera.updateProjectionMatrix();
}

function render(now) {
  clock.update();
  const delta = Math.min(clock.getDelta(), 0.08);
  economy?.update(delta, now);
  community?.update(delta, now);
  if (localsGroup && community?.state) localsGroup.userData.update(community.state, camera, now);
  if (moving && !document.hidden) animationTime += delta;
  if (cameraTransition) {
    const t = Math.min(1, (now - cameraTransition.start) / 900);
    const ease = t * t * (3 - 2 * t);
    camera.position.lerpVectors(cameraTransition.from, cameraTransition.to, ease);
    controls.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.target, ease);
    if (t === 1) cameraTransition = null;
  }
  if (markerMesh && markerMesh.visible && economy?.enabled) {
    markerMesh.material.color.set('#ffffff');
    markerMesh.count = economy.state.workers.length;
    economy.state.workers.forEach((worker, index) => {
      object.position.fromArray(localToScene(worker.position));
      object.position.y = terrainHeight(world.terrain, worker.position[0], worker.position[1]) + 0.2;
      const size = worker.active ? 1 : 0;
      object.scale.setScalar(size);
      object.rotation.set(0, 0, 0);
      object.updateMatrix();
      markerMesh.setMatrixAt(index, object.matrix);
      markerMesh.setColorAt(index, markerColor.set(worker.source === 'jev' ? '#69dad4' : worker.source === 'safety_override' ? '#d77f6b' : '#d8b17a'));
    });
    markerMesh.instanceMatrix.needsUpdate = true;
    if (markerMesh.instanceColor) markerMesh.instanceColor.needsUpdate = true;
  } else if (markerMesh && markerMesh.visible) {
    markers.forEach((marker, index) => {
      // Ping-pong along each source polyline, with no invented junction decisions.
      const traveled = (marker.offset + animationTime * marker.speed) % (marker.route.length * 2);
      const distance = traveled <= marker.route.length ? traveled : marker.route.length * 2 - traveled;
      const sample = sampleRoute(marker.route, Math.min(distance, marker.route.length - 0.00001));
      object.position.fromArray(sample.position);
      if (world.terrain) object.position.y = terrainHeight(world.terrain, object.position.x, -object.position.z);
      object.position.y += 0.2;
      object.scale.setScalar(1);
      object.rotation.set(0, Math.atan2(sample.direction[0], sample.direction[1]), 0);
      object.updateMatrix();
      markerMesh.setMatrixAt(index, object.matrix);
    });
    markerMesh.instanceMatrix.needsUpdate = true;
  }
  if (moped?.active) moped.update(delta, now);
  else if (walking?.active) walking.update(delta, now);
  else {
    controls.update();
    $('#compass-arrow').style.transform = `rotate(${controls.getAzimuthalAngle() * 180 / Math.PI}deg)`;
  }
  followSunShadow();
  renderer.render(scene, camera);
}

for (const preset of ['overview', 'street']) $(`#${preset}`).addEventListener('click', () => setCamera(preset));
$('#ride').addEventListener('click', () => moped?.active ? exitRide() : enterRide());
$('#walk').addEventListener('click', () => walking?.active ? exitWalk() : enterWalk());
$('#scene-select').addEventListener('change', loadWorld);
$('#visit-destination').addEventListener('click', () => { const store = world?.stores?.find(item => item.id === $('#destination').value); if (store) enterWalk(store.visit, store.facade); });
document.querySelectorAll('[data-layer]').forEach((input) => input.addEventListener('change', () => { if (layers[input.dataset.layer]) layers[input.dataset.layer].visible = input.checked; }));
$('#sun-hour').addEventListener('input', updateAtmosphere);
$('#weather').addEventListener('change', updateAtmosphere);
document.addEventListener('appearancechange', updateAtmosphere);
function updateMotionButton() {
  $('#motion').textContent = moving ? 'Pause marker movement' : 'Resume marker movement';
  $('#motion').setAttribute('aria-pressed', String(moving));
}
$('#motion').addEventListener('click', () => { moving = !moving; updateMotionButton(); });
$('#reload').addEventListener('click', loadWorld);
$('#clear-selection').addEventListener('click', () => { $('#selection').hidden = true; });
let pointerStart;
host.addEventListener('pointerdown', (event) => { pointerStart = [event.clientX, event.clientY]; });
host.addEventListener('pointerup', (event) => {
  if (moped?.active) return;
  if (!buildingMesh?.visible || !pointerStart || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 5) return;
  const rect = host.getBoundingClientRect();
  const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const person = raycaster.intersectObject(localsGroup, true)[0];
  if (person?.object.userData.localId && (!walking.active || person.distance < 5)) { community.selectLocal(person.object.userData.localId); return; }
  if (walking?.active) return;
  const hit = raycaster.intersectObject(buildingMesh, true)[0];
  if (!hit) return;
  if (world.scene === 'district') {
    const store = world.stores.find(item => item.id === hit.object.userData.storeId);
    if (store) { $('#destination').value = store.id; enterWalk(store.visit, store.facade); }
    return;
  }
  const building = world.buildings[hit.object.userData.buildingIndices?.[hit.instanceId]];
  if (!building) return;
  $('#selection-style').textContent = styleNames[building.style] ?? building.style;
  $('#selection-detail').textContent = `${building.size.map((value) => value.toFixed(1)).join(' × ')} m · Representative architecture, review pending. Parcel ${building.parcel_id}.`;
  $('#selection').hidden = false;
});

try {
  initializeRenderer();
  updateMotionButton();
  loadWorld();
} catch (error) {
  showError(`WebGL could not initialize: ${error.message}`);
}
