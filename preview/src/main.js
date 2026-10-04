import { buildRoads } from './street-roads.js';
import { buildDesignatedSidewalks } from './sidewalks.js';
import { createBreakableGlass } from './breakable-glass.js';
import { createForceControls } from './force-controls.js';
import { createLiftSparkles } from './lift-sparkles.js';
import { pickPerson, withinTalkingReach } from './people-picking.js';
import { createResidentPortraits } from './resident-portraits.js';
import { createPointerGesture } from './pointer-gesture.js';
import { createPlayerAvatar } from './player-avatar.js';
import * as THREE from 'three';
import { createPlayDock } from './play-dock.js';
import { AO_OUTPUT, createRenderPipeline } from './render-pipeline.js';
import { bindRenderVisibility } from './render-lifecycle.js';
import { localToScene, terrainHeight } from './geometry.js';
import { setupThemeControls } from './theme.js';
import { configureMaterials, physicalSurface, paverSurface, loadEnvironment } from './materials.js';
import { setupDistrictUI } from './district-ui.js';
import { setupSidebar, setupSidebarSections } from './sidebar.js';
import { createAccountLandmarks, createLandmarks, destinationFromSearch, openSpotNear, placesOf } from './places.js';
import { setupPlacesUI } from './places-ui.js';
import { renderPixelRatio } from './viewport.js';
import { createWalkingControls } from './walking-ui.js';
import { createCommunityPanel } from './community-ui.js';
import { buildDistrictBuildings, buildDistrictDetail } from './district.js';
import { buildDistrictFantasy } from './district-fantasy.js';
import { buildLocals } from './locals.js';
import { buildStorePeople } from './store-people.js';
import { sharedRoomSummary } from './shared-population.js';
import { storeRoomsFor } from './store-rooms.js';
import { buildFoliage, buildObservedFoliage } from './foliage.js';
import { castShadowsFromProxies } from './landscape-models.js';
import { validateVegetation } from './vegetation.js';
import { createStorefrontReflections } from './reflections.js';
import { registerGroundSurfaces, groundSurfaceHeight } from './world-surface.js';
import { buildStreetFurniture } from './street-furniture.js';
import { atmosphereFor } from './atmosphere.js';
import { createWalkingEnvironment } from './walking.js';
import { createAutoControls } from './auto-ui.js';
import { createInvasionControls } from './invasion-ui.js';
import { createQualityControl } from './render-quality.js';
import { mountAssetProgress } from './asset-progress.js';
import { createClearView } from './clear-view.js';
import { storefrontSpot } from './arrival.js';
import { createMultiplayer } from './multiplayer-client.js';
import { waitForTown, resolveMultiplayerMode, activePlayMode, switchPlayMode } from './multiplayer-mode.js';
import { createPlayMode } from './play-mode.js';
import './play-mode.css';
import { createRemotePlayers } from './remote-players.js';
import { createSharedBuildLayer } from './shared-build-layer.js';
import { createSharedBuildControls } from './shared-build-ui.js';
import { builderTarget, evaluatePlacement, poseFeet } from './builder-mode.js';
import { buildKind, buildRoads as buildSiteRoads } from './shared-build.js';
import './style.css';
import './playground-theme.css';
import './district-theme.css';
import './immersive.css';
import './sidebar.css';
import './visual-finish.css';
import './retro-finish.css';
import { setupUIMotion } from './ui-motion.js';
import { STREET } from './street-profile.js';
import { createBirdCams } from './bird-cams.js';
import { seeThroughNearCameraIn } from './near-camera-fade.js';
import { createBirdCamsUI } from './bird-cams-ui.js';
import { createWorldPortal } from './world-portal.js';

setupUIMotion();
setupThemeControls();
setupSidebar();
const $ = (selector) => document.querySelector(selector);
const host = $('#canvas-host');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Shared browser acceptance on CPU-only runners still draws the real scene,
// but leaves material/lighting quality to full-render and WebGL smoke runs.
// Never enable this profile in a production build.
const softwareAcceptance = import.meta.env.DEV && import.meta.env.VITE_SHARED_SOFTWARE_RENDERING === '1';
let renderer, pipeline, world, worldGroup, buildingMesh, walking, community, localsGroup, storePeople, interiorsLayer;
let districtUI, environmentAssets = null, storefrontReflections = null;
let placesUI = null, landmarks = null;
let worldPortal = null;
let landmarkAccountId = null;
let autoControls, playerAvatar, invasion, force, liftSparkles, breakableGlass;
let forceObjects=[],forceObstacles=[];
let multiplayer, remotePlayers, buildLayer, buildControls;
let soloCanGrantWishes = false;
async function refreshSoloPrivileges() {
  try {
    const response = await fetch('/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const session = response.ok && response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
    soloCanGrantWishes = session?.authenticated === true && session.canGrantWishes === true;
  } catch { soloCanGrantWishes = false; }
  if (community?.state) community.refresh();
  worldPortal?.refreshCapability();
  return soloCanGrantWishes;
}
let autoTownDecision = null;
let birdCams = null, birdCamsUI = null;
let debugTools = null, debugLoading = null;
const multiplayerMode = resolveMultiplayerMode(import.meta.env);
let playModeStorage = null;
try { playModeStorage = window.localStorage; } catch { /* The current visit still plays solo. */ }
if (!playModeStorage) try { playModeStorage = window.sessionStorage; } catch { /* Stay in single player. */ }
// This tab's play mode, decided once at load; a reload after a refused save
// carries the choice in its URL.
const playMode = activePlayMode(playModeStorage, location.search);
let layers = {}, loading = false;
let lastRenderStats = 0, treeShadows = null, quality = null, lastFrame = null, assetProgress = null;
let lastSoftwareDraw = -Infinity;

const scene = new THREE.Scene();
// Keep geometry, skinning and simulation intact without compiling every PBR
// material variant on two CPU-bound browser clients.
if (softwareAcceptance) scene.overrideMaterial = new THREE.MeshNormalMaterial();
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
const wandTip = new THREE.Vector3(), drawingSize = new THREE.Vector2(), viewportSize = new THREE.Vector2();

function showError(message) {
  const panel = $('#loading');
  panel.hidden = false;
  panel.classList.add('error');
  panel.querySelector('h2').textContent = 'Preview unavailable';
  panel.querySelector('p').textContent = message;
  $('#connection').textContent = 'Local data unavailable';
}

function initializeRenderer() {
  // The composer antialiases the scene before the fullscreen output pass.
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = !softwareAcceptance;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  configureMaterials(renderer);
  pipeline = createRenderPipeline(renderer, scene, camera, { samples: softwareAcceptance ? 0 : 4 });
  const debugOcclusion = new URLSearchParams(location.search).get('ao');
  // The storefront probe renders fixed-size cube faces outside the composer,
  // so quality changes never invalidate it.
  quality = createQualityControl({ apply({ scale, occlusion }) {
    pipeline.setRenderScale(softwareAcceptance ? 0.25 : scale);
    if (debugOcclusion !== 'off') pipeline.setOcclusion(!softwareAcceptance && occlusion);
  } });
  if (debugOcclusion === 'off') pipeline.setOcclusion(false);
  else if (debugOcclusion === 'only') pipeline.occlusion.output = AO_OUTPUT.Denoise;
  if (!softwareAcceptance) loadEnvironment(renderer, scene).then((assets) => { environmentAssets = assets; updateAtmosphere(); }).catch(() => { $('#connection').textContent = 'Sky lighting unavailable · base lighting active'; });
  host.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showError('The browser lost its graphics context. Reload this page to rebuild the scene.');
  });
  const portraits = createResidentPortraits({ renderer, getHolder: id => (String(id).startsWith('player-look:') ? playerAvatar?.portraitSubject(id.slice(12)) : null)
    ?? [...(localsGroup?.userData.models ?? []), playerAvatar?.carriage.driver].find(person => person?.userData.localId === id && person.userData.avatar)
    ?? storePeople?.userData.figures?.find(figure => figure.id === id)?.holder });
  community = createCommunityPanel({ host: $('.panel-scroll'), reducedMotion, getPortrait: id => portraits.portrait(id),
    getVisitor: () => walking?.active ? walking.getPosition() : null,
    getVisitorPose: () => walking?.getPose() ?? null,
    getObstacles: () => forceObjects.map(object=>[object.position.x,-object.position.z,object.position.y]),
    getPersona: () => playerAvatar?.form ?? 'visitor',
    getCanGrantWishes: () => soloCanGrantWishes,
    authorizeSoloWish: refreshSoloPrivileges,
    onWish: () => playerAvatar?.cast(performance.now()),
    getMultiplayer: () => multiplayer,
    getRoomId: () => walking?.roomId ?? null,
    getWeather: () => ({storm:$('#weather').value === 'overcast',hour:Number($('#sun-hour').value),humidity:$('#weather').value==='haze'?0.9:0.72}),
    onFocus(local) {
      autoControls?.stop();
      // The town confirms travel asynchronously; solo focus stays synchronous.
      if (multiplayer) return multiplayer.travel({ localId: local.id }).then(result => {
        if (result.ok) walking.lookAt(local.position);
        return result.ok;
      });
      if (local.indoor) {
        const room = storeRoomsFor(world).find(room => room.storeId === local.storeId);
        const position = walking.active ? walking.getPosition() : null;
        if (room && (!position || !room.contains(position[0], position[1]))) {
          enterStore(world.stores.find(store => store.id === local.storeId));
        }
        return walking.focusPerson(local);
      }
      if (!walking.active) enterWalk();
      if (walking.roomId) {
        const store = world.stores.find(store => store.id === walking.roomId);
        if (!store) return false;
        leaveStore(store);
      }
      return walking.focusPerson(local);
  } });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !multiplayer && ['solo','off','unavailable','signed-out'].includes(host.dataset.multiplayer)) void refreshSoloPrivileges();
  });
  $('.panel-scroll').prepend($('#community-section'));
  worldPortal=createWorldPortal({host:$('#explore-section'),getCanPublish:()=>Boolean(multiplayer?.snapshot?.players.find(player=>player.id===multiplayer.identity?.id)?.canBuild) || soloCanGrantWishes});
  void worldPortal.load();
  setupSidebarSections({ graphics: quality.element });
  walking = createWalkingControls({ camera, host, reducedMotion, onMeetNearby: () => community.meetNearby(), onTalk: id => community.selectLocal(id), getLocals: () => community.state?.locals, onEnter: enterStore, onLeave: leaveStore, onManual: () => autoControls?.stop(), getSharedPopulation: () => Boolean(multiplayer) });
  playerAvatar = createPlayerAvatar({ scene, host, walking, reducedMotion, getLocals: () => community.state?.locals, getConversation: () => community.state?.locals.find(local=>local.id===community.state.selectedId), getWorld: () => world,
    requestAppearance: appearance => multiplayer?.command({type:'appearance',appearance}),
    requestMovement: movement => multiplayer?.command({type:'movement',movement}),
    getPortrait: id => portraits.portrait(id) });
  breakableGlass=createBreakableGlass({reducedMotion,
    groundAt:(x,z)=>world?groundSurfaceHeight(world,x,z):0,
    onChange:()=>storefrontReflections?.invalidate(),
  });scene.add(breakableGlass.object);
  liftSparkles=createLiftSparkles({reducedMotion});scene.add(liftSparkles.object);
  autoControls = createAutoControls({ walking, community, getWorld: () => world, getStorm: () => $('#weather').value === 'overcast' });
  // Let content height determine spacing, including wrapped visit status text.
  const playDock = createPlayDock(), visitTools = playDock.content;
  buildControls=createSharedBuildControls({getPose:()=>walking?.getPose(),onBuilderChange:builder=>{builderAim='';if(!builder.active)buildLayer?.setGhost(null);},request:message=>multiplayer?.command(message)??Promise.resolve({ok:false,message:'Join the town before building.'})});
  invasion = createInvasionControls({ scene, host, walking, getWorld: () => world, getLocals: () => community.state?.locals, getForm: () => playerAvatar?.form ?? 'visitor', onCast: () => playerAvatar?.cast(performance.now()) });
  playerAvatar.onChange(() => invasion.refreshGate());
  visitTools.append($('.player-controls'),buildControls.panel,$('.auto-controls'), invasion.panel);
  force=createForceControls({host,walking,isAvailable:()=>!multiplayer,
    getTargets:()=>[
      ...(localsGroup?.userData.models??[]).filter(person=>person.userData.avatar).map(object=>({object,id:object.userData.localId})),
      ...(storePeople?.userData.figures??[]).filter(figure=>figure.id).map(figure=>({object:figure.holder,id:figure.id})),
    ].map(target=>{const local=community.state?.locals.find(local=>local.id===target.id);return {...target,local,name:local?.name??'Neighbor',mass:75,radius:.35,height:1.8};}).filter(target=>target.local)
      .concat(forceObjects.map(object=>({object,...object.userData.forceBody}))),
    onProjectileMove:(from,to,projectile)=>breakableGlass.trace(from,to,projectile),
    getObstacles:()=>forceObstacles,getCarriage:()=>playerAvatar?.carriage,
    onCast:target=>playerAvatar?.setForceTarget(target),onManual:()=>autoControls?.stop(),
  });
  visitTools.insertBefore(force.panel,invasion.panel);
  // Bird cams: Jev flies a few birds over the district; ride along or take over.
  birdCams = createBirdCams({ scene, camera, host, getEnvironment: () => world && walking?.active ? walkingEnvironment() : null, getInterests: birdInterests });
  birdCamsUI = createBirdCamsUI(birdCams);
  visitTools.insertBefore(birdCamsUI.panel, invasion.panel);
  $('#viewport').append(playDock.element);
  createClearView({ viewport: $('#viewport') });
  let storage = null; try { storage = window.localStorage; } catch { /* storage unavailable: landmarks last the session */ }
  landmarks = createLandmarks({ storage });
  placesUI = setupPlacesUI({ places: [], landmarks, onGo: goToPlace, getPosition: () => walking?.getPosition() ?? null, getYaw: () => walking?.getYaw() ?? 0 });
  if (multiplayerMode === 'choice') {
    createPlayMode({ viewport: $('#viewport'), storage: playModeStorage, active: playMode.mode, remembered: playMode.remembered });
    if (playMode.mode === 'multiplayer') startMultiplayer();
    else {host.dataset.multiplayer = 'solo';void refreshSoloPrivileges();}
  }
  else if (multiplayerMode === 'required') startMultiplayer();
  else if (multiplayerMode === 'auto') (autoTownDecision = waitForTown()).then(town => {
    host.dataset.multiplayer = town.reason;
    if (town.join) startMultiplayer();
    else {if (town.signIn) $('#connection').textContent = 'Playing solo · sign in to join the shared town';void refreshSoloPrivileges();}
  });
  else {host.dataset.multiplayer = 'off';void refreshSoloPrivileges();}
  districtUI = setupDistrictUI({ onArrive: arriveAtStore, onEnter: enterStore, onAtmosphere: updateAtmosphere, describeStore: describeInterior });
  sun.castShadow = true;
  const shadowResolution=Math.min(4096,renderer.capabilities.maxTextureSize);
  sun.shadow.mapSize.set(shadowResolution,shadowResolution);
  treeShadows = castShadowsFromProxies(sun, () => layers.trees?.userData.shadowProxies ?? []);
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
  bindRenderVisibility({ document, setLoop: callback => renderer.setAnimationLoop(callback), render,
    resetTime: () => { clock.reset(); lastFrame = null; } });
}

// Join the shared town. Local simulations (auto visits, the invasion) would
// diverge from everyone else's town, so they stop and hide. The town owns each
// player's appearance; solo character choices stay on this device.
function startMultiplayer() {
  if (multiplayer) return;
  landmarkAccountId = null;
  landmarks = createAccountLandmarks({ request: (action, data) => multiplayer.landmarkRequest(action, data) });
  placesUI?.setLandmarks(landmarks);
  autoControls?.stop(); invasion?.reset();
  $('.auto-controls').hidden = true;
  invasion.panel.hidden = true;
  force?.reset();force.panel.hidden=true;
  playerAvatar?.setSharedMode(true);
  remotePlayers = createRemotePlayers(scene, host);
  buildLayer ??= createSharedBuildLayer(scene);
  buildControls?.hide();
  multiplayer = createMultiplayer({
    getPose: () => walking?.getPose(),
    onSnapshot: snapshot => { if (world) community.applyRemote(snapshot);buildLayer?.sync(snapshot.builds??[]); },
    onCorrection: player => { if (world && player) walking.applyServerPose(player); },
    onPlayers: (players, selfId) => {
      remotePlayers.sync(players, selfId);
      if (!players.length) buildLayer?.sync([]);
      const self = players.find(player => player.id === selfId);
      playerAvatar?.setSharedIdentity(self);
      if (self?.canBuild) buildControls?.show(); else buildControls?.hide();
      worldPortal?.refreshCapability();
      if (self) void worldPortal?.load();
      buildControls?.sync(players.length ? multiplayer?.snapshot?.builds ?? [] : [], self?.canBuild ? selfId : null);
      if (self?.canBuild) buildControls?.loadInventory(selfId);
      if (self && landmarkAccountId !== selfId) {
        landmarkAccountId = selfId;
        const store = createAccountLandmarks({ request: (action, data) => multiplayer.landmarkRequest(action, data) });
        landmarks = store;
        placesUI?.setLandmarks(store);
        store.load().then(() => { if (landmarks === store) placesUI?.refresh(); })
          .catch(error => { if (landmarks === store) placesUI?.say(error.message, 'error'); });
      } else if (!self && landmarkAccountId !== null) {
        landmarkAccountId = null;
        landmarks = createAccountLandmarks({ request: (action, data) => multiplayer.landmarkRequest(action, data) });
        placesUI?.setLandmarks(landmarks);
      }
    },
    onPlaySolo: multiplayerMode === 'choice' ? () => switchPlayMode(playModeStorage, 'solo') : null,
  });
  host.dataset.multiplayer = 'joined';
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
    surface = new THREE.Mesh(geometry, paverSurface());
    surface.position.y = STREET.plazaOffset;
  } else {
    surface = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), paverSurface());
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


function populateWorld(data) {
  force?.reset();
  breakableGlass?.reset();
  liftSparkles?.reset();
  invasion?.reset();
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
      item.userData.cancelLandscapeLoad?.();
      item.userData.texture?.dispose();
      item.geometry?.dispose();
      if (Array.isArray(item.material)) item.material.forEach((material) => material.dispose());
      else item.material?.dispose();
      if (item.isInstancedMesh) item.dispose();
    });
  }
  world = data;
  worldGroup = new THREE.Group();
  // Facades, arcade rails and neon dissolve near the camera, like trees, so a take-off beside the shops never fills the view.
  buildingMesh = seeThroughNearCameraIn(buildDistrictBuildings(data));
  const ground=buildGround(data),roads=buildRoads(data);
  const streetEnvironment=createWalkingEnvironment(data);
  const streetSpace=(x,z)=>streetEnvironment.isFree(x,z)&&!streetEnvironment.roomAt(x,z);
  const sidewalks=buildDesignatedSidewalks(data,streetSpace);
  host.dataset.streetProfile=JSON.stringify(sidewalks.userData.streetProfile);
  const supports=[ground.children[0],roads,...sidewalks.children];
  registerGroundSurfaces(data,supports);
  const furniture=buildStreetFurniture(data,streetSpace);
  community.setWorld(data, buildingMesh.userData.rooms ?? []);
  localsGroup = buildLocals(data, community.state.locals.filter(local => !local.indoor && !local.vehicleRole));
  storePeople = buildStorePeople(buildingMesh.userData.rooms ?? [], { reducedMotion, sharedPopulation: Boolean(multiplayer) });
  interiorsLayer = new THREE.Group(); interiorsLayer.name = 'Boutique interiors layer';
  interiorsLayer.add(buildingMesh.userData.interiors, storePeople);
  layers = { ground, roads, buildings: buildingMesh, interiors: interiorsLayer, trees: data.vegetation ? buildObservedFoliage(data) : buildFoliage(data.trees) };
  Object.values(layers).forEach((layer) => worldGroup.add(layer));
  worldGroup.add(localsGroup);
  worldGroup.add(seeThroughNearCameraIn(buildDistrictDetail(data)));
  worldGroup.add(sidewalks);
  worldGroup.add(furniture);
  forceObjects=furniture.userData.forceObjects;
  forceObstacles=[...furniture.userData.forceObstacles,...(data.trees??[]).map(tree=>({x:tree.position[0],z:-tree.position[1],radius:.35}))];
  force?.setWorld(data,forceObjects);
  buildingMesh.add(seeThroughNearCameraIn(buildDistrictFantasy(data)));
  document.querySelectorAll('[data-layer]').forEach((input) => { layers[input.dataset.layer].visible = input.checked; });
  scene.add(worldGroup);
  breakableGlass?.setWorld(buildingMesh);
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
  $('#connection').textContent = 'World ready to explore';
  $('#stores-count').textContent = data.stores.length;
  $('#terrain-state').textContent = 'Mapped district terrain';
  $('#canopy-state').textContent = data.vegetation ? '2018 LiDAR canopy' : 'District trees';
  $('#canopy-source').hidden = !data.vegetation;
  if (data.vegetation) $('#canopy-source').textContent = 'Tree placement follows 2018 LiDAR. Foliage is interpreted; the independent historical canopy comparison does not pass.';
  const limitations = $('#limitations');
  limitations.replaceChildren(...(data.limitations ?? []).map((text) => { const item = document.createElement('li'); item.textContent = text; return item; }));
}

// One walkable-area model per loaded district, shared by arrival checks.
let arrivalEnvironment = null;
function walkingEnvironment() {
  if (arrivalEnvironment?.world !== world) arrivalEnvironment = { world, environment: createWalkingEnvironment(world) };
  return arrivalEnvironment.environment;
}

function enterWalk(position, lookAt, pitch = 0) {
  if (!world || !walking) return;
  walking.enter(world, position, lookAt, pitch);
}

function enterStore(store) {
  if (multiplayer) { districtUI.select(store.id); return multiplayer.travel({storeId:store.id,mode:'enter'}); }
  const room = storeRoomsFor(world).find(item => item.storeId === store.id);
  if (!room) return arriveAtStore(store);
  const [east, north] = room.toWorld(0, 2.4), [lookEast, lookNorth] = room.toWorld(room.center, room.depth - 1);
  districtUI.select(store.id);
  enterWalk([east, north, room.floor], [lookEast, lookNorth], 0.02);
}

function leaveStore(store) {
  if (multiplayer) return multiplayer.travel({storeId:store.id,mode:'leave'});
  // Step out onto the threshold, facing the door you just came through.
  const [x, north] = store.facade;
  const environment=walkingEnvironment();
  enterWalk(storefrontSpot(world, store, 'leave', { isFree: (x,z)=>environment.isFree(x,z)&&!environment.roomAt(x,z) }), [x, north], 0.05);
}

function describeInterior(store) {
  const room = world ? storeRoomsFor(world).find(item => item.storeId === store.id) : null;
  if (!room) return 'Exterior viewing destination.';
  const { label, staff, guests, mannequins, highlights } = multiplayer ? sharedRoomSummary(room) : room.summary;
  const people = [`${staff} associate${staff === 1 ? '' : 's'}`, `${guests} guest${guests === 1 ? '' : 's'}`, mannequins ? `${mannequins} mannequin${mannequins === 1 ? '' : 's'}` : null].filter(Boolean).join(', ');
  return `${label} · ${Math.round(room.width)} × ${Math.round(room.depth)} m walk-in floor · ${people} · ${highlights.join(', ')}. Imagined interior, not a photographed store.`;
}

// Places: a spot teleports to a clear outdoor point beside it, a storefront
// arrives the way the directory does, a landmark or shared link restores the
// exact position and facing. The town decides for shared play; solo play
// applies the same outdoor-only rule locally.
async function goToPlace(place) {
  if (!world || !walking) return { ok: false, message: 'The district is still loading.' };
  if (multiplayer) {
    const target = place.kind === 'spot' ? { placeId: place.ref } : place.kind === 'shop' ? { storeId: place.ref, mode: 'arrive' } : { position: [place.position[0], place.position[1]] };
    const result = await multiplayer.travel(target);
    if (result?.ok && Number.isFinite(place.yaw) && ['landmark', 'link'].includes(place.kind)) walking.setYaw(place.yaw);
    return result;
  }
  if (place.kind === 'shop') {
    const store = world.stores.find(item => item.id === place.ref);
    if (store) { arriveAtStore(store); return { ok: true }; }
  }
  const environment = walkingEnvironment();
  const spot = openSpotNear((x, north) => environment.isFree(x, -north) && !environment.roomAt(x, -north), place.position, place.kind === 'spot' ? 4 : 1.2);
  if (!spot) return { ok: false, message: `${place.name} is not reachable right now.` };
  enterWalk(spot, ['spot', 'arrival'].includes(place.kind) && (spot[0] !== place.position[0] || spot[1] !== place.position[1]) ? place.position : null);
  if (Number.isFinite(place.yaw) && ['landmark', 'link'].includes(place.kind)) walking.setYaw(place.yaw);
  return { ok: true };
}

function arriveAtStore(store) {
  if (multiplayer) return multiplayer.travel({storeId:store.id,mode:'arrive'});
  const environment=walkingEnvironment();
  enterWalk(storefrontSpot(world, store, 'arrive', { isFree: (x,z)=>environment.isFree(x,z)&&!environment.roomAt(x,z) }), store.facade, 0.22);
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
  if (layers.roads?.userData.asphalt) {
    layers.roads.userData.asphalt.material.roughness = weather === 'overcast' ? 0.38 : 1;
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
    // The initial resident and boutique cast depends on whether auto mode
    // joins. Resolve that decision before constructing either set of models.
    if (autoTownDecision) await autoTownDecision;
    populateWorld(data);
    // Reveal a finished street: stone, asphalt and sky first. Trees, people
    // and interiors keep streaming behind the progress pill. On a slow link
    // every download shares the bandwidth, so the wait is capped.
    $('#loading p').textContent = 'Laying the stone and lighting the sky…';
    await assetProgress?.settled(url => /\/assets\/materials\//.test(url), { timeout: 4000 });
    $('#verification-state').textContent = 'A real district, reimagined';
    $('#verification-detail').textContent = `${data.stores.length} real store names on mapped streets, with imagined architecture and fictional encounters. This is an artistic interpretation.`;
    $('#verification-dot').className = 'status-dot pass';
    $('#loading').hidden = true;
    enterWalk(data.walkSpawn, data.walkLookAt);
    if (multiplayer?.snapshot) {
      community.applyRemote(multiplayer.snapshot);
      walking.applyServerPose(multiplayer.snapshot.players.find(player => player.id === multiplayer.identity?.id));
    }
    const places = placesOf(data);
    placesUI?.setPlaces(places);
    // A shared link (?place=… or ?at=…) lands its visitor there after arrival.
    const linked = destinationFromSearch(location.search, places, data.bounds_m);
    if (linked) {
      const result = await goToPlace(linked);
      placesUI?.say(result?.ok === false ? (result.message ?? `${linked.name} is not reachable right now.`) : `You're at ${linked.name}`, result?.ok === false ? 'error' : 'ok');
    }
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
  if (lastFrame !== null) quality.sample(now - lastFrame);
  lastFrame = now;
  const delta = Math.min(clock.getDelta(), 0.08);
  if(!multiplayer)force?.update(delta,now);
  breakableGlass?.update(delta);
  playerAvatar?.react(now);
  community?.update(delta, now);
  if (localsGroup && community?.state) localsGroup.userData.update(community.state, camera, now, community.speakingId, walking?.getPosition());
  layers.trees?.userData.update?.(camera.position);
  if (storePeople && interiorsLayer?.visible) storePeople.userData.update(camera, now, community?.state, walking?.getPosition(), community?.speakingId);
  community?.updateSpeech(delta);
  if (buildingMesh?.userData.updateDoors) {
    const visitor = walking?.active ? walking.getPosition() : null;
    if (visitor) walkerPosition.set(visitor[0], visitor[2], -visitor[1]);
    const prince=playerAvatar?.carriage.prince;
    buildingMesh.userData.updateDoors([visitor?walkerPosition:null,prince?.object.visible&&prince.companion.mode!=='seat'?prince.object.position:null],delta);
  }
  updateStoreLights();
  if (!multiplayer) autoControls?.update(delta);
  // Riding a bird pauses walking; the bird drives the camera below.
  if (birdCams?.riding) walking?.halt();
  else if (!multiplayer || multiplayer.connected && !multiplayer.traveling) walking?.update(delta, now);
  else walking?.halt();
  birdCams?.update(delta);
  if (!multiplayer) invasion?.update(delta, now);
  multiplayer?.update(now);
  remotePlayers?.update(now, camera);
  buildLayer?.update(camera.position);
  updateBuilder();
  renderer.getDrawingBufferSize(drawingSize);
  playerAvatar?.update(now, camera, renderer.getSize(viewportSize).y);
  liftSparkles?.update(delta,force?.spell,playerAvatar?.getWandTip(wandTip),camera,drawingSize.y);
  followSunShadow();
  treeShadows?.hide(); // Shadow proxies show only while the sun draws its map.
  if (!softwareAcceptance && storefrontReflections && environmentAssets) {
    const ground = terrainHeight(world.terrain, camera.position.x, -camera.position.z);
    if (camera.position.y - ground < 18) reflectionPosition.set(camera.position.x, ground + 2.5, camera.position.z);
    else {
      const stop = world.stores.find(store => store.name === 'Dior').visit;
      reflectionPosition.set(stop[0], terrainHeight(world.terrain, stop[0], stop[1]) + 2.5, -stop[1]);
    }
    storefrontReflections.update(now, reflectionPosition);
  }
  debugTools?.update(now);
  // llvmpipe draws both browser clients on CPU. Keep simulation and transport
  // updating every frame while capping only acceptance-profile draw work.
  if (!softwareAcceptance || now - lastSoftwareDraw >= 1000) {
    lastSoftwareDraw = now;
    renderer.info.reset();
    pipeline.render(delta);
  }
  if (now-lastRenderStats>1000) {
    host.dataset.renderStats=JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});
    host.dataset.reflections = JSON.stringify(storefrontReflections?.stats ?? null);
    host.dataset.pipeline = JSON.stringify(pipeline.stats);
    host.dataset.quality = JSON.stringify(quality.stats);
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
function visibleInScene(object) {
  for (let ancestor = object; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return false;
  return true;
}
// Builder mode: the preview follows the pointer over the canvas (or sits a
// few steps ahead), judged by the same rule the town applies.
const builderPointer = { at: null, ray: new THREE.Raycaster() };
let builderRoads = null, builderAim = '';
host.addEventListener('pointermove', event => {
  const rect = host.getBoundingClientRect();
  builderPointer.at = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
});
host.addEventListener('pointerleave', () => { builderPointer.at = null; });
// What Jev's birds find worth watching: residents by what they are doing,
// Jevica, other players, and the community spots as a quiet fallback.
const BIRD_ACTIVITY = [[/held by the force|enchant|wish/i, 7], [/chatting|helping|greeting|aid/i, 6], [/seeking cover|turning|walking|on the way|heading/i, 2.5], [/rest|paused|sheltered|at work/i, 1.2]];
function birdInterests() {
  const interests = [];
  for (const local of community?.state?.locals ?? []) {
    if (local.indoor || !Array.isArray(local.position)) continue;
    const status = String(local.status ?? ''), weight = BIRD_ACTIVITY.find(([pattern]) => pattern.test(status))?.[1] ?? 2;
    interests.push({ id: `local:${local.id}`, label: status ? `${local.name} (${status})` : local.name, position: [local.position[0], local.position[1]], weight: local.id === community.state.selectedId ? weight + 3 : weight });
  }
  const me = walking?.getPosition();
  if (me) interests.push({ id: 'player', label: playerAvatar?.form === 'jevica' || !playerAvatar ? 'Jevica' : 'you', position: [me[0], me[1]], weight: 4 });
  for (const player of multiplayer?.snapshot?.players ?? []) if (player.id !== multiplayer.identity?.id) interests.push({ id: `player:${player.id}`, label: player.name, position: player.position, weight: 4 });
  for (const spot of world?.communityLocations ?? []) interests.push({ id: `spot:${spot.id}`, label: spot.name, position: [spot.position[0], spot.position[1]], weight: 1.5 });
  return interests;
}

function updateBuilder() {
  const builder = buildControls?.builder;
  if (!builder?.active || !world || !walking?.active) { buildLayer?.setGhost(null); builderAim = ''; return; }
  const pose = walking.getPose();
  if (!pose || pose.flying || pose.riding || pose.roomId) {
    buildLayer?.setGhost(null);
    if (builderAim !== 'grounded') { builderAim = 'grounded'; buildControls.aimAt(null, { valid: false, message: 'Stand outside on the ground to build.' }); }
    return;
  }
  let ray = null;
  if (builderPointer.at) {
    builderPointer.ray.setFromCamera(builderPointer.at, camera);
    ray = { origin: builderPointer.ray.ray.origin.toArray(), direction: builderPointer.ray.ray.direction.toArray() };
  }
  const target = builderTarget(pose, ray), kindId = builder.moving?.kind ?? builder.kind, kind = buildKind(kindId);
  if (world !== builderRoads?.world) builderRoads = { world, roads: buildSiteRoads(world) };
  const snapshot = multiplayer?.snapshot;
  const key = JSON.stringify([target, kindId, builder.finish, builder.yaw, builder.moving?.id, snapshot?.revision, pose.position.map(v => Math.round(v * 10))]);
  if (key === builderAim) return;
  builderAim = key;
  const verdict = evaluatePlacement({ environment: walkingEnvironment(), roads: builderRoads.roads, kind, position: target, feet: poseFeet(pose),
    builds: snapshot?.builds ?? [], players: snapshot?.players ?? [], selfId: multiplayer?.identity?.id, moving: builder.moving });
  buildLayer?.setGhost({ kind: kindId, finish: builder.moving?.finish ?? builder.finish, position: target, ground: verdict.ground, yaw: builder.yaw, valid: verdict.valid });
  buildControls.aimAt(target, verdict);
}
document.addEventListener('keydown', event => {
  if (!buildControls?.builder.active || event.target.closest?.('input, textarea, select, button, [contenteditable]')) return;
  if (event.code === 'KeyR' && !event.metaKey && !event.ctrlKey) { event.preventDefault(); buildControls.rotate(event.shiftKey ? -1 : 1); }
  else if (event.code === 'Enter' && !event.repeat) { event.preventDefault(); void buildControls.place(); }
  else if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); buildControls.setBuilder(false); }
}, true);

const selectionGesture = createPointerGesture();
host.addEventListener('pointerdown', event => {
  // Walking picks own host capture, including while another dialogue is open.
  // Free-camera controls retain their existing canvas capture ownership.
  const captureTarget=walking?.active ? host : null;
  if(selectionGesture.begin(event,{captureTarget}) && captureTarget)captureTarget.setPointerCapture(event.pointerId);
});
host.addEventListener('pointermove', event => selectionGesture.move(event));
for (const type of ['pointercancel', 'lostpointercapture']) host.addEventListener(type, (event) => {
  selectionGesture.cancel(event);
});
host.addEventListener('blur', () => selectionGesture.cancel());
window.addEventListener('blur', () => selectionGesture.cancel());
document.addEventListener('visibilitychange', () => selectionGesture.cancel());
host.addEventListener('pointerup', (event) => {
  if (!selectionGesture.end(event)) return;
  // In builder mode a click on the canvas places at the preview.
  if (buildControls?.builder.active && walking?.active) { void buildControls.place(); return; }
  const rect = host.getBoundingClientRect();
  const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  if(!multiplayer&&force?.pick(raycaster))return;
  const pose = walking.getPose();
  const id = pickPerson(raycaster, [localsGroup, storePeople, playerAvatar?.carriage.driver].filter(Boolean),
    [buildingMesh, buildingMesh?.userData.interiors, playerAvatar?.carriage.object].filter(Boolean),
    id => !walking.active || withinTalkingReach(community.state.locals.find(local => local.id === id), pose, (point,eyeHeight) => walking.canSee(point,eyeHeight)));
  if (id) community.selectLocal(id);

});

// Debug tools (colliders, walkable grid, ground triangles, source map, polygon
// inspector) load on demand: F3, ?debug=1, the desktop View menu, or reopening
// with the panel left open. They ship in every build so the desktop app has them.
function openDebugTools(force) {
  if (debugTools) return debugTools.toggle(force);
  debugLoading ??= import('./debug-tools.js').then(({ createDebugTools }) => {
    debugTools = createDebugTools({ scene, camera, host, renderer, getWorld: () => world, getEnvironment: () => walking?.environment ?? null,
      getFocus: () => { const pose = walking?.getPose(); return pose ? [pose.position[0], pose.position[2]] : null; } });
    return debugTools;
  });
  // The first request opens the panel; later ones toggle it.
  return debugLoading.then(tools => tools.toggle(force ?? true));
}
document.addEventListener('keydown', event => {
  if (event.code !== 'F3' || event.repeat || event.target.closest?.('input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]')) return;
  event.preventDefault(); void openDebugTools();
});
window.addEventListener('river-oaks:debug', event => void openDebugTools(event.detail?.open));
window.__riverDebug = () => debugTools;
// Read-only bird cam state for development and browser acceptance runs.
if (import.meta.env.DEV) window.__riverBirds = () => birdCams ? { ...birdCams.state, camera: camera.position.toArray(), walking: walking?.active ?? false } : null;
try {
  if (new URLSearchParams(location.search).get('debug') === '1') void openDebugTools(true);
  else if (JSON.parse(localStorage.getItem('river-oaks-debug') ?? '{}').open) void openDebugTools(true);
} catch { /* storage unavailable */ }

// Read-only diagnostics for browser acceptance runs; absent from production.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('motion-debug') === '1') {
  window.__riverMultiplayer = () => ({ connected: multiplayer?.connected ?? false, selfId: multiplayer?.identity?.id, snapshot: multiplayer?.snapshot, remotes: remotePlayers?.stats(),creations:buildLayer?.stats(),birds:birdCams?.state,builder:buildControls?{...buildControls.builder,ghost:buildLayer?.ghost?{position:buildLayer.ghost.position.toArray(),visible:buildLayer.ghost.visible}:null,hint:document.querySelector('#build-hint')?.textContent,valid:document.querySelector('#build-hint')?.dataset.valid}:null });
  window.__riverPlayerAttention=()=>{
    const rig=playerAvatar?.rig;if(!rig)return null;
    rig.model.updateWorldMatrix(true,true);
    return {...playerAvatar.attention,position:playerAvatar.object.position.toArray(),bodyYaw:playerAvatar.object.rotation.y,
      head:rig.model.getObjectByName('head').getWorldQuaternion(new THREE.Quaternion()).toArray(),
      feet:playerAvatar.feet.map(leg=>({contact:leg.contact,error:leg.error,target:leg.target?.toArray(),actual:leg.foot.getWorldPosition(new THREE.Vector3()).toArray()})),
      eyes:rig.eyes.pose.map(p=>{const b=rig.model.getObjectByName(p.name);return {...p,position:b.getWorldPosition(new THREE.Vector3()).toArray(),forward:new THREE.Vector3(0,0,1).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())).toArray()};})};
  };
  window.__riverGlass=(details=false)=>breakableGlass?.inspect(details);
  window.__riverForce=()=>force?.inspect();
  window.__riverLiftSparkles=()=>liftSparkles?.inspect();
  window.__riverConversation=(id=community?.state?.selectedId)=>{
    if(!id)return {id:null,speaking:false};
    const station=storePeople?.userData.figures.find(p=>p.id===id);
    const resident=localsGroup?.userData.models.find(p=>p.userData.localId===id)?.userData.avatar;
    const rig=station?.avatar??resident?.rig,head=rig?.model.getObjectByName('head');
    return {id,speaking:Boolean(id&&community?.speakingId===id),nod:station?.conversation.pose??resident?.conversationPose,face:station?.face.pose??resident?.facePose,mouth:rig?.speechPose,eyes:rig?.eyes.pose,head:head?.quaternion.toArray()};
  };
  window.__riverCarriage = () => ({vehicle:playerAvatar?.carriage.kind,chauffeur:playerAvatar?.carriage.chauffeur,companion:playerAvatar?.carriage.prince.companion,princePosition:playerAvatar?.carriage.prince.object.position.toArray(),wingsVisible:playerAvatar?.carriage.prince.object.getObjectByName('Jev’s angel wings')?.visible,placement:playerAvatar?.carriage.placement,unicorns:playerAvatar?.carriage.unicorns,spinners:playerAvatar?.carriage.spinners?.map(spinner=>({rotation:spinner.rotation.z})),visible:playerAvatar?.carriage.object.visible,riding:playerAvatar?.carriage.riding,tyreClearances:playerAvatar?.carriage.tyreClearances,pose:walking.getPose(),rider:playerAvatar?.object.position.toArray(),riderYaw:playerAvatar?.object.rotation.y});
  window.__riverPeople = (bone = 'head') => [...[...(localsGroup?.userData.models ?? []),...([playerAvatar?.carriage.driver].filter(p=>p?.userData.avatar))].map(person => ({id:person.userData.localId,holder:person})), ...(storePeople?.userData.figures ?? [])]
    .filter(person => person.id&&community.state.locals.some(local=>local.id===person.id)).map(person => {
      person.holder.updateWorldMatrix(true,true);
      const bounds = new THREE.Box3().setFromObject(person.holder), point = bounds.getCenter(new THREE.Vector3());
      point.y = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.86;
      // A rig landmark stays on the body as swinging limbs change its bounds.
      const landmark = person.holder.getObjectByName(bone);
      if (landmark) { landmark.getWorldPosition(point); if (bone === 'head') point.y += 0.07; }
      point.project(camera);
      const rect = host.getBoundingClientRect();
      const local=community.state.locals.find(local=>local.id===person.id);
      return {id:person.id, position:[...local.position], renderedPosition:person.holder.getWorldPosition(new THREE.Vector3()).toArray(), role:person.role??local.role, task:person.task?{kind:person.task.kind,docked:person.task.docked,contacts:person.task.contacts}:null, seated:Boolean(person.seatedFeet), feet:person.seatedFeet?.map(leg=>({error:leg.error,target:leg.target.toArray(),actual:leg.foot.getWorldPosition(new THREE.Vector3()).toArray()})), attention:person.attention, workTime:person.workTime,
        reachable:withinTalkingReach(local,walking.getPose(),(point,eyeHeight)=>walking.canSee(point,eyeHeight)), visible:visibleInScene(person.holder), screen:[rect.left+(point.x+1)*rect.width/2,rect.top+(1-point.y)*rect.height/2], depth:point.z};
    });
  window.__riverWishes = () => [...(localsGroup?.userData.models ?? []).map(person => ({ id:person.userData.localId,holder:person,model:person.userData.avatar?.object })), ...(storePeople?.userData.figures ?? []).filter(person=>person.id).map(person=>({id:person.id,holder:person.holder,model:person.avatar.model}))]
    .map(person => {
      const local=community.state.locals.find(local=>local.id===person.id),effect=person.holder.getObjectByName('Wish effects');
      let skin=0,clothes=0;
      person.model?.traverse(item=>{if(item.isMesh && item.visible){if(/^(young|middleage|old)_/.test(item.material?.name ?? ''))skin++;else clothes++;}});
      return {id:person.id,wish:local?.wish,disrupted:Boolean(local?.wishDisruption),modelReady:Boolean(person.model),bodyVisible:person.model?.visible,height:person.holder.position.y-local.position[2],skin,clothes,props:effect?.children.filter(child=>child.visible).map(child=>child.name) ?? []};
    });
  window.__riverMotion = () => (localsGroup?.userData.models ?? []).filter(person=>person.visible && person.userData.avatar).map(person=>({
    id:person.userData.localId, status:community.state.locals.find(local=>local.id===person.userData.localId)?.life?.status,
    feet:person.userData.avatar.feet.filter(leg=>leg.target).map(leg=>{
      const source=leg.rollPose?leg.soleSources[leg.rollPose.pivotId]:null;
      const support=source?source.mesh.getVertexPosition(source.index,new THREE.Vector3()).applyMatrix4(source.mesh.matrixWorld):null;
      return {contact:leg.contact,target:(leg.ikTarget??leg.target).toArray(),actual:leg.foot.getWorldPosition(new THREE.Vector3()).toArray(),
        support:support?.toArray(),surface:leg.supportPoint?[leg.supportPoint.x,groundSurfaceHeight(world,leg.supportPoint.x,leg.supportPoint.z),leg.supportPoint.z]:null};
    }),
  }));
}

try {
  assetProgress = mountAssetProgress({ viewport: $('#viewport'), overlay: $('#loading'), manager: THREE.DefaultLoadingManager, reducedMotion });
  initializeRenderer();
  loadWorld();
} catch (error) {
  showError(`WebGL could not initialize: ${error.message}`);
}
