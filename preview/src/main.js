import { createOfficeUI } from './office-ui.js';
import { createIpicScreening } from './ipic-screening-ui.js';
import { IPIC_DARTS, IPIC_INTERIOR, atIpicDartsLine } from './ipic-plan.js';
import './ipic-screening.css';
import { officeLobbyGroundCutout } from './office-contract.js';
import { captureOfficeStreet } from './office-world-presentation.js';
import { createStoreIntros } from './store-intro-ui.js';
import {treeFlightEnvironment} from './tree-flight.js';
import { buildRoads } from './street-roads.js';
import { buildDesignatedSidewalks } from './sidewalks.js';
import { pickPerson, withinTalkingReach } from './people-picking.js';
import { createResidentPortraits } from './resident-portraits.js';
import { createPointerGesture } from './pointer-gesture.js';
import { createPlayerAvatar } from './player-avatar.js';
import * as THREE from 'three';
import { createPlayDock } from './play-dock.js';
import { AO_OUTPUT, createRenderPipeline } from './render-pipeline.js';
import { warnIfSoftwareRendering } from './hardware-acceleration.js';
import './hardware-acceleration.css';
import { bindRenderVisibility } from './render-lifecycle.js';
import { createRenderAudit } from './render-audit.js';
import { localToScene, terrainHeight } from './geometry.js';
import { setupThemeControls } from './theme.js';
import { configureMaterials, physicalSurface, paverSurface, loadEnvironment } from './materials.js';
import { setupDistrictUI } from './district-ui.js';
import { setupSidebar, setupSidebarSections } from './sidebar.js';
import { setupRailNavigation } from './rail-navigation.js';
import { isGameplayKey } from './keyboard-input.js';
import { createAccountLandmarks, destinationFromSearch, placesOf } from './places.js';
import { setupPlacesUI } from './places-ui.js';
import { renderPixelRatio } from './viewport.js';
import { createWalkingControls } from './walking-ui.js';
import { createCommunityPanel } from './community-ui.js';
import { buildDistrictBuildings, buildDistrictDetail } from './district.js';
import { buildDistrictFantasy } from './district-fantasy.js';
import { buildStorePeople } from './store-people.js';
import { createGeneratedInteriorStream } from './generated-interior-stream.js';
import { canCullExterior, canCullIpicAuditorium, renderOnly, renderWithoutExterior } from './interior-exterior-culling.js';
import { sharedRoomSummary } from './shared-population.js';
import { storeRoomsFor } from './store-rooms.js';
import { attachDistrictGalleryPlan } from './district-interior-contract.js';
import { buildFoliage, buildObservedFoliage } from './foliage.js';
import { castShadowsFromProxies } from './landscape-models.js';
import { validateVegetation } from './vegetation.js';
import { createStorefrontReflections } from './reflections.js';
import { registerGroundSurfaces, groundSurfaceHeight } from './world-surface.js';
import { buildStreetFurniture } from './street-furniture.js';
import { buildPlazaSalon } from './plaza-salon.js';
import { createPlazaTableGames, seatAtTable } from './plaza-table-games.js';
import { createPlazaStage } from './plaza-stage.js';
import { plazaSalonPlan } from './plaza-salon-plan.js';
import { createPlazaDominoes, seatAtCafe } from './plaza-dominoes.js';
import { createPlazaHearts } from './plaza-hearts.js';
import { createPlazaSpades } from './plaza-spades.js';
import { createPlazaLiarsDice } from './plaza-liars-dice.js';
import { createPlazaBackgammon, seatAtBackgammon } from './plaza-backgammon.js';
import { createPlazaCribbage } from './plaza-cribbage.js';
import { createPlazaJenga, seatAtJenga } from './plaza-jenga.js';
import { createPlazaYacht } from './plaza-yacht.js';
import { createPlazaWinePong } from './plaza-wine-pong.js';
import { createPlazaShuffleboard } from './plaza-shuffleboard.js';
import { createPlazaDarts } from './plaza-darts.js';
import { createPlazaMancala, seatAtGrove } from './plaza-mancala.js';
import { createPlazaGo } from './plaza-go.js';
import { createPlazaChineseCheckers } from './plaza-chinese-checkers.js';
import { createPlazaXiangqi } from './plaza-xiangqi.js';
import { atmosphereFor } from './atmosphere.js';
import { createWalkingEnvironment } from './walking.js';
import { createQualityControl } from './render-quality.js';
import { mountAssetProgress } from './asset-progress.js';
import { createClearView } from './clear-view.js';
import { createPhotoMode } from './photo-mode.js';
import { createGuideEntry } from './salon-guide.js';
import { createMultiplayer } from './multiplayer-client.js';
import { createRemotePlayers } from './remote-players.js';
import { createSharedBuildLayer } from './shared-build-layer.js';
import { createSeatAndWater } from './seat-and-water.js';
import { createSharedSeatingControls } from './shared-seating-ui.js';
import { createSharedBuildControls } from './shared-build-ui.js';
import { builderTarget, evaluatePlacement, poseFeet } from './builder-mode.js';
import { buildKind, buildGeometry, buildRoads as buildSiteRoads } from './shared-build.js';
import './style.css';
import './playground-theme.css';
import './district-theme.css';
import './immersive.css';
import './sidebar.css';
import './visual-finish.css';
import './retro-finish.css';
import './rail-navigation.css';
import { setupUIMotion } from './ui-motion.js';
import { STREET } from './street-profile.js';
import { createBirdCams, BIRD_WINGSPAN } from './bird-cams.js';
import { FACE_SHAPES } from './resident-face.js';
import { seeThroughNearCameraIn } from './near-camera-fade.js';
import { createBirdCamsUI } from './bird-cams-ui.js';
import { createWorldPortal } from './world-portal.js';
import { createRoomGroundClip } from './room-ground-clip.js';
import { DEFAULT_WORLD_ID, worldIdFromSearch } from './world-contract.js';
// Panel material last, so it applies over the earlier interface layers.
import './hud-glass.css';
import './game-hud.css';
import './settings-dialog.css';
import { createPlazaBicycle } from './plaza-bicycle.js';
import { createCyclingLeaderboard } from './cycling-leaderboard.js';
import './cycling-leaderboard.css';
import { plazaSalonRack } from './plaza-salon-plan.js';
import { describeRenderer, describeScene, noteFrame, registerDiagnosticSource, setScreenshotCapture } from './debug-report.js';
import { venueDoorSites } from './venue-rooms.js';
import { createAxePanel } from './axe-panel.js';
import { AXE_LANES, AXE_ROOM_DARTS, AXE_ROOM_INTERIOR, atAxeLane, atAxeRoomDarts } from './axe-room-plan.js';

// Every stylesheet above is applied by now, so the sign-in gate can lift.
document.dispatchEvent(new Event('river-oaks:styled'));

setupUIMotion();
setupThemeControls();
const sidebar = setupSidebar();
let sidebarSections, playDock, clearView, photoMode;
setupRailNavigation({ sidebar, getSections: () => sidebarSections, getDock: () => playDock, getClearView: () => clearView, getPhotoMode: () => photoMode });
const $ = (selector) => document.querySelector(selector);
const host = $('#canvas-host');
let storeIntros;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Shared browser acceptance on CPU-only runners still draws the real scene,
// but leaves material/lighting quality to full-render and WebGL smoke runs.
// Never enable this profile in a production build.
const softwareAcceptance = import.meta.env.DEV && import.meta.env.VITE_SHARED_SOFTWARE_RENDERING === '1';
const renderAudit = import.meta.env.DEV && new URLSearchParams(location.search).get('render-audit') === '1' ? createRenderAudit() : null;
let exteriorCulling = true; // A development audit can switch it off to compare frames.
// Inside IPIC's auditorium, facing away from its only partition, nothing outdoors can be seen (#428),
// nor any other store's interior or people (#431): the frame keeps only IPIC's own.
function ipicAuditoriumCull() {
  const pose = !officeUI?.active && interiorsLayer?.visible ? walking?.getPose() : null;
  const room = pose ? walking?.environment?.roomAt(pose.position[0], pose.position[2]) : null;
  return room?.interior === IPIC_INTERIOR && canCullIpicAuditorium(camera, room);
}
function ipicOwn() {
  const interior = buildingMesh?.userData.interiors?.children.find(child => child.userData.interior === IPIC_INTERIOR);
  const people = storePeople?.children.find(group => group.userData.room?.interior === IPIC_INTERIOR);
  return interior ? [interior, ...(people ? [people] : [])] : null;
}
const debugOcclusion = new URLSearchParams(location.search).get('ao');
// Auto's AO tail rule stays off until it passes device acceptance (render-quality.js).
const aoTailShedding = new URLSearchParams(location.search).get('aotail') === 'on';
// The penthouse skyline (office-skyline.js); ?office-skyline=off compares without it in development.
// Functional software acceptance omits the live exterior workload.
const officeSkylineOff = import.meta.env.DEV && new URLSearchParams(location.search).get('office-skyline') === 'off';
let auditCamera = null;
let renderer, pipeline, world, worldGroup, buildingMesh, walking, community, storePeople, interiorsLayer, generatedInteriors;
let districtUI, environmentAssets = null, storefrontReflections = null, roomGroundClip = null;
let placesUI = null, landmarks = null;
let pendingSharedPlace = null, sharedPlaceInFlight = false;
let worldPortal = null;
let worldRegionSha256 = null;
let landmarkAccountId = null;
let playerAvatar, officeUI, ipicScreening;
let multiplayer, remotePlayers, buildLayer, buildControls, seatingControls, seatAndWater;
let plazaSalon = null, plazaGames = null, plazaDominoes = null, plazaHearts = null, plazaBackgammon = null, cafeGame = 'dominoes', plazaStage = null, plazaBicycle = null, cyclingBoard = null;
let plazaJenga = null, plazaYacht = null, benchGame = 'jenga';
let plazaCribbage = null, walnutGame = 'backgammon';
let plazaWinePong = null, plazaShuffleboard = null, longTableGame = 'winePong';
let plazaDarts = null, ipicDarts = null, venueDarts = null, axePanel = null;
let plazaSpades = null;
let plazaLiarsDice = null;
let plazaMancala = null;
let plazaGo = null, plazaChineseCheckers = null, plazaXiangqi = null, groveGame = 'mancala';
// What X does while seated: the first provider (a game table, the stage…) offering a play.
// Each feature adds its own line to the list, so they never edit the same one.
const playProviders = [];
const playAction = () => { for (const provider of playProviders) { const play = provider()?.interaction(); if (play) return play; } return null; };
let birdCams = null, birdCamsUI = null;
let debugTools = null, debugLoading = null;
const worldMapEnabled = import.meta.env.VITE_WORLD_MAP === 'true';
const creationToolsEnabled = import.meta.env.VITE_CREATION_TOOLS === 'true';
let layers = {}, loading = false;
let lastRenderStats = 0, treeShadows = null, quality = null, lastFrame = null, assetProgress = null;
let lastSoftwareDraw = -Infinity;
// A problem report's picture: the next drawn frame is handed over while it is still on the canvas.
let pendingCapture = null;

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
const viewportSize = new THREE.Vector2();

function showError(message) {
  const panel = $('#loading');
  panel.hidden = false;
  panel.classList.add('error');
  panel.querySelector('.loading-report').hidden = false;
  panel.querySelector('h2').textContent = 'Preview unavailable';
  panel.querySelector('p').textContent = message;
  $('#connection').textContent = 'Local data unavailable';
}

function initializeRenderer() {
  // The composer antialiases the scene before the fullscreen output pass.
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  } catch {
    throw new Error('WebGL is unavailable. Check that hardware or graphics acceleration is enabled in your browser settings, then restart your browser. If it is already enabled, check your graphics driver or try another browser.');
  }
  warnIfSoftwareRendering({ gl: renderer.getContext(), viewport: $('#viewport'), focusTarget: host });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = !softwareAcceptance;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  configureMaterials(renderer);
  // CPU acceptance also skips bloom: under the normal-colour override its blur spread
  // one figure's invalid values across the whole Mesa frame (owner view, 2026-10-08).
  pipeline = createRenderPipeline(renderer, scene, camera, { samples: softwareAcceptance ? 0 : 4, bloom: !softwareAcceptance });
  // The storefront probe renders fixed-size cube faces outside the composer,
  // so quality changes never invalidate it.
  quality = createQualityControl({ apply({ scale, occlusion }) {
    pipeline.setRenderScale(softwareAcceptance ? 0.25 : scale);
    if (debugOcclusion !== 'off') pipeline.setOcclusion(!softwareAcceptance && occlusion);
    photoMode?.qualityChanged();
  }, tailShedding: aoTailShedding });
  if (debugOcclusion === 'off') pipeline.setOcclusion(false);
  else if (debugOcclusion === 'only') pipeline.occlusion.output = AO_OUTPUT.Denoise;
  if (!softwareAcceptance) loadEnvironment(renderer, scene).then((assets) => { environmentAssets = assets; updateAtmosphere(); }).catch(() => { $('#connection').textContent = 'Sky lighting unavailable · base lighting active'; });
  host.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showError('The browser lost its graphics context. Reload this page to rebuild the scene.');
  });
  const portraits = createResidentPortraits({ renderer, getHolder: id => (String(id).startsWith('player-look:') ? playerAvatar?.portraitSubject(id.slice(12)) : null)
    ?? [playerAvatar?.carriage.driver].find(person => person?.userData.localId === id && person.userData.avatar)
    ?? storePeople?.userData.figures?.find(figure => figure.id === id)?.holder });
  community = createCommunityPanel({ host: $('.panel-scroll'), getPortrait: id => portraits.portrait(id),
    getVisitor: () => walking?.active ? walking.getPosition() : null,
    getPersona: () => playerAvatar?.persona ?? 'visitor',
    onWish: () => playerAvatar?.cast(performance.now()),
    getMultiplayer: () => multiplayer,
    getRoomId: () => walking?.roomId ?? null,
    // Resolves to the town's travel result, so a refusal can say why.
    onFocus(local) {
      return multiplayer.travel({ localId: local.id }).then(result => {
        if (result.ok) walking.lookAt(local.position);
        return result;
      });
    } });
  $('.panel-scroll').prepend($('#community-section'));
  if (worldMapEnabled) {
    worldPortal=createWorldPortal({host:$('#explore-section'),creationToolsEnabled,getCanPublish:()=>Boolean(multiplayer?.connected && multiplayer.snapshot?.players.find(player=>player.id===multiplayer.identity?.id)?.canBuild)});
    void worldPortal.load();
  }
  sidebarSections = setupSidebarSections({ graphics: quality.element, sidebar });
  walking = createWalkingControls({ camera, host, reducedMotion, onMeetNearby: () => community.meetNearby(), onTalk: id => community.selectLocal(id), getLocals: () => community.state?.locals, onEnter: enterStore, onLeave: leaveStore,
    onLevelChange: async portal => {
      const result = await multiplayer.command({ type: 'interiorLevel', portalId: portal.id });
      if (result.ok && result.player) walking.applyServerPose(result.player);
      return result;
    }, canEnterStore, getInteraction: () => seatAndWater?.interaction() ?? plazaBicycle?.prompt() ?? null, getPlay: playAction, getVoice: () => multiplayer?.voice ?? null });
  storeIntros = createStoreIntros({ camera, host,
    claim: storeId => multiplayer.claimStoreIntro(storeId),
    onHalt: () => walking.halt(), onResume: () => walking.update(0, performance.now()),
  });
  walking.addObstacle({contains:(...args)=>buildLayer?.colliders.some(collider=>collider.contains(...args))??false});
  // Before the player panel, so G reaches the rack first and the owner's ride button only when no bike is in play.
  cyclingBoard = createCyclingLeaderboard();
  plazaBicycle = createPlazaBicycle({ scene, host, walking, getMultiplayer: () => multiplayer, getLocals: () => community.state?.locals, getMiles: () => cyclingBoard?.mine() ?? null, reducedMotion });
  playerAvatar = createPlayerAvatar({ scene, host, walking, reducedMotion, userId: document.body.dataset.accountId, getLocals: () => community.state?.locals, getConversation: () => community.state?.locals.find(local=>local.id===community.state.selectedId), getWorld: () => world,
    requestAppearance: appearance => multiplayer?.command({type:'appearance',appearance}),
    requestMovement: movement => multiplayer?.command({type:'movement',movement}),
    requestChauffeur: async(url,options)=>{
      if(import.meta.env.DEV)return fetch(url,options);
      const session=await fetch('/auth/session',{signal:options.signal,credentials:'same-origin',cache:'no-store'}).then(response=>response.json());
      return fetch('/api/chauffeur',{...options,credentials:'same-origin',headers:{...options.headers,'X-CSRF-Token':session.csrfToken??''}});
    },
    requestVehicleExit: position => multiplayer.travel({position:[position[0],-position[2]]}),
    getPortrait: id => portraits.portrait(id) });
  seatAndWater = createSeatAndWater({ walking, playerAvatar, getLocals: () => community.state?.locals, getMultiplayer: () => multiplayer, isBusy: () => seatingControls?.busy() ?? false });
  // Seated at a plaza chess table, X plays chess, checkers or Connect Four; the table mirrors the game.
  plazaGames = createPlazaTableGames({ getMirror: () => plazaSalon?.userData.chess ?? null, getFourMirror: () => plazaSalon?.userData.connectFour ?? null, getMorrisMirror: () => plazaSalon?.userData.morris ?? null, getSeat: () => seatAtTable(walking?.getPose()),
    // The town holds games between the two residents at a table (server/table-games.js).
    getTown: () => multiplayer?.connected ? { selfId: multiplayer.identity?.id, snapshot: multiplayer.snapshot, command: message => multiplayer.command(message) } : null,
    focusWorld: () => host.focus({ preventScroll: true }) });
  // Seated at the café table, X plays dominoes, Hearts or Spades with the plaza regulars
  // (the last one played); switching clears the other game's pieces from the table when
  // the two use different pieces (tiles or cards).
  const cafeGames = () => ({ dominoes: plazaDominoes, hearts: plazaHearts, spades: plazaSpades, dice: plazaLiarsDice });
  const cafePieces = kind => kind === 'dominoes' ? 'dominoes' : kind === 'dice' ? 'dice' : 'cards';
  const switchCafe = kind => {
    const leaving = cafeGames()[cafeGame], joining = cafeGames()[kind];
    if (!joining || joining === leaving) return;
    const from = cafeGame;
    cafeGame = kind; leaving?.close({ toWorld: false });
    if (cafePieces(from) !== cafePieces(kind)) plazaSalon?.userData[cafePieces(from)]?.show(null);
    joining.open();
  };
  plazaDominoes = createPlazaDominoes({ getMirror: () => plazaSalon?.userData.dominoes ?? null, getSeat: () => seatAtCafe(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), onSwitch: switchCafe });
  plazaHearts = createPlazaHearts({ getMirror: () => plazaSalon?.userData.cards ?? null, getSeat: () => seatAtCafe(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), onSwitch: switchCafe });
  plazaSpades = createPlazaSpades({ getMirror: () => plazaSalon?.userData.cards ?? null, getSeat: () => seatAtCafe(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), onSwitch: switchCafe });
  plazaLiarsDice = createPlazaLiarsDice({ getMirror: () => plazaSalon?.userData.dice ?? null, getSeat: () => seatAtCafe(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), onSwitch: switchCafe });
  plazaStage = createPlazaStage({ walking, getMultiplayer: () => multiplayer, getStageView: () => plazaSalon?.userData.stage ?? null });
  // Seated at the walnut table, X plays backgammon or cribbage (the last one played);
  // switching puts the checkers or the pegging board away and sets out the other.
  const walnutGames = () => ({ backgammon: plazaBackgammon, cribbage: plazaCribbage });
  const switchWalnut = kind => {
    const leaving = walnutGames()[walnutGame], joining = walnutGames()[kind];
    if (!joining || joining === leaving) return;
    walnutGame = kind; leaving?.close({ toWorld: false });
    plazaSalon?.userData.backgammon?.setVisible(kind === 'backgammon'); plazaSalon?.userData.cribbage?.setVisible(kind === 'cribbage');
    joining.open();
  };
  plazaBackgammon = createPlazaBackgammon({ getMirror: () => plazaSalon?.userData.backgammon ?? null, getSeat: () => seatAtBackgammon(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), onSwitch: switchWalnut });
  plazaCribbage = createPlazaCribbage({ getMirror: () => plazaSalon?.userData.cribbage ?? null, getSeat: () => seatAtBackgammon(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), onSwitch: switchWalnut });
  playProviders.push(() => plazaGames);
  playProviders.push(() => walnutGames()[walnutGame]);
  // On the curved bench, X plays Jenga or Yacht with two plaza regulars (the last one
  // played); the drum's tower or its five dice mirror it, and switching puts the other away.
  const benchGames = () => ({ jenga: plazaJenga, yacht: plazaYacht });
  const switchBench = kind => {
    const leaving = benchGames()[benchGame], joining = benchGames()[kind];
    if (!joining || joining === leaving) return;
    benchGame = kind; leaving?.close({ toWorld: false });
    plazaSalon?.userData.jenga?.setVisible(kind === 'jenga'); plazaSalon?.userData.yacht?.setVisible(kind === 'yacht');
    joining.open();
  };
  plazaJenga = createPlazaJenga({ getMirror: () => plazaSalon?.userData.jenga ?? null, getSeat: () => seatAtJenga(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), reducedMotion, onSwitch: switchBench });
  plazaYacht = createPlazaYacht({ getMirror: () => plazaSalon?.userData.yacht ?? null, getSeat: () => seatAtJenga(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), onSwitch: switchBench });
  playProviders.push(() => benchGames()[benchGame]);
  // Standing at an end of the long café table, X plays wine pong or shuffleboard (the last
  // one played); the table's glasses and ball, or its pucks, mirror it, and switching puts
  // the other game's pieces away.
  const longTableGames = () => ({ winePong: plazaWinePong, shuffleboard: plazaShuffleboard });
  const switchLongTable = kind => {
    const leaving = longTableGames()[longTableGame], joining = longTableGames()[kind];
    if (!joining || joining === leaving) return;
    longTableGame = kind; leaving?.close({ toWorld: false });
    plazaSalon?.userData.winePong?.setVisible(kind === 'winePong'); plazaSalon?.userData.shuffleboard?.setVisible(kind === 'shuffleboard');
    joining.open();
  };
  const longTable = () => (world && plazaSalonPlan(world)?.winePong) ?? null;
  plazaWinePong = createPlazaWinePong({ getMirror: () => plazaSalon?.userData.winePong ?? null, getTable: longTable,
    getPose: () => walking?.getPose(), focusWorld: () => host.focus({ preventScroll: true }), reducedMotion, onSwitch: switchLongTable });
  plazaShuffleboard = createPlazaShuffleboard({ getMirror: () => plazaSalon?.userData.shuffleboard ?? null, getTable: longTable,
    getPose: () => walking?.getPose(), focusWorld: () => host.focus({ preventScroll: true }), reducedMotion, onSwitch: switchLongTable });
  playProviders.push(() => longTableGames()[longTableGame]);
  // Standing at the darts line, X plays 501; the board on the wall shows the turn's darts.
  plazaDarts = createPlazaDarts({ getMirror: () => plazaSalon?.userData.darts ?? null, getBoard: () => (world && plazaSalonPlan(world)?.darts) ?? null,
    getPose: () => walking?.getPose(), focusWorld: () => host.focus({ preventScroll: true }), reducedMotion });
  playProviders.push(() => plazaDarts);
  // Standing at the Tuck Room line in IPIC, X plays shared darts that the town holds
  // (server/darts-games.js); the cabinet's board shows every match's darts.
  const ipicRoom = () => walkingEnvironment().rooms.find(room => room.interior === IPIC_INTERIOR) ?? null;
  const atIpicLine = ([east, north]) => { const room = ipicRoom(); return Boolean(room && walkingEnvironment().roomAt(east, -north) === room && atIpicDartsLine(room.toLocal(east, north))); };
  ipicDarts = createPlazaDarts({ getMirror: () => buildingMesh?.userData.interiors?.userData.dartboards?.[0] ?? null,
    getPose: () => walking?.getPose(), focusWorld: () => host.focus({ preventScroll: true }), reducedMotion,
    shared: { lineId: IPIC_DARTS.id, eyebrow: 'IPIC · shared game', title: 'Darts in the Tuck Room',
      line: () => multiplayer?.snapshot?.darts?.find(item => item.id === IPIC_DARTS.id) ?? null,
      selfId: () => multiplayer?.identity?.id ?? null,
      name: id => multiplayer?.snapshot?.players?.find(player => player.id === id)?.name ?? 'A visitor',
      atLine: () => { const pose = walking?.getPose(); return Boolean(pose && !pose.sitting && !pose.riding && pose.altitude <= .1 && atIpicLine([pose.position[0], -pose.position[2]])); },
      peers: () => (multiplayer?.snapshot?.players ?? []).filter(player => !player.sitting && (player.altitude ?? 0) <= .1 && atIpicLine(player.position)).map(player => ({ id: player.id, name: player.name })),
      send: message => multiplayer?.command(message) ?? Promise.resolve({ ok: false, message: 'Connect to the town to play together.' }) } });
  playProviders.push(() => ipicDarts);
  // The axe-and-darts venue (venue-rooms.js): its board is a second shared darts line and
  // its lanes play shared axes (server/axe-games.js); both show on the venue's own props.
  const roomPoint = (interior, [east, north]) => { const room = walkingEnvironment().rooms.find(item => item.interior === interior); return room && walkingEnvironment().roomAt(east, -north) === room ? room.toLocal(east, north) : null; };
  const onFoot = () => { const pose = walking?.getPose(); return pose && !pose.sitting && !pose.riding && pose.altitude <= .1 ? [pose.position[0], -pose.position[2]] : null; };
  const venueProps = () => buildingMesh?.userData.interiors?.userData.axeVenue ?? null;
  const snapshotPlayers = () => (multiplayer?.snapshot?.players ?? []).filter(player => !player.sitting && (player.altitude ?? 0) <= .1);
  const townShared = { selfId: () => multiplayer?.identity?.id ?? null, name: id => multiplayer?.snapshot?.players?.find(player => player.id === id)?.name ?? 'A visitor',
    send: message => multiplayer?.command(message) ?? Promise.resolve({ ok: false, message: 'Connect to the town to play together.' }) };
  const atVenueDarts = position => { const point = position && roomPoint(AXE_ROOM_INTERIOR, position); return Boolean(point && atAxeRoomDarts(point)); };
  venueDarts = createPlazaDarts({ getMirror: () => venueProps()?.venueDarts ?? null, getPose: () => walking?.getPose(), focusWorld: () => host.focus({ preventScroll: true }), reducedMotion,
    shared: { ...townShared, lineId: AXE_ROOM_DARTS.id, eyebrow: 'Axe & Darts · shared game', title: 'Darts at Axe & Darts',
      line: () => multiplayer?.snapshot?.darts?.find(item => item.id === AXE_ROOM_DARTS.id) ?? null, atLine: () => atVenueDarts(onFoot()),
      peers: () => snapshotPlayers().filter(player => atVenueDarts(player.position)).map(player => ({ id: player.id, name: player.name })) } });
  playProviders.push(() => venueDarts);
  const laneOf = position => { const point = position && roomPoint(AXE_ROOM_INTERIOR, position); return point ? atAxeLane(point) : null; };
  axePanel = createAxePanel({ getMirror: id => venueProps()?.axeLanes?.[id] ?? null, focusWorld: () => host.focus({ preventScroll: true }), reducedMotion,
    shared: { ...townShared, laneIds: AXE_LANES.map(lane => lane.id), laneAt: () => laneOf(onFoot()),
      lane: id => multiplayer?.snapshot?.axes?.find(item => item.id === id) ?? null,
      peers: id => snapshotPlayers().filter(player => laneOf(player.position) === id).map(player => ({ id: player.id, name: player.name })) } });
  playProviders.push(() => axePanel);
  // Seated at the grove table, X plays mancala, Go, Chinese checkers or xiangqi (the last
  // one played); switching puts the other games' boards away and sets out this one's.
  const groveGames = () => ({ mancala: plazaMancala, go: plazaGo, chineseCheckers: plazaChineseCheckers, xiangqi: plazaXiangqi });
  const switchGrove = kind => {
    const leaving = groveGames()[groveGame], joining = groveGames()[kind];
    if (!joining || joining === leaving) return;
    groveGame = kind; leaving?.close({ toWorld: false });
    plazaSalon?.userData.mancala?.setVisible(kind === 'mancala'); plazaSalon?.userData.go?.setVisible(kind === 'go'); plazaSalon?.userData.chineseCheckers?.setVisible(kind === 'chineseCheckers'); plazaSalon?.userData.xiangqi?.setVisible(kind === 'xiangqi');
    joining.open();
  };
  plazaMancala = createPlazaMancala({ getMirror: () => plazaSalon?.userData.mancala ?? null, getSeat: () => seatAtGrove(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), onSwitch: switchGrove });
  plazaGo = createPlazaGo({ getMirror: () => plazaSalon?.userData.go ?? null, getSeat: () => seatAtGrove(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), onSwitch: switchGrove });
  plazaChineseCheckers = createPlazaChineseCheckers({ getMirror: () => plazaSalon?.userData.chineseCheckers ?? null, getSeat: () => seatAtGrove(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), reducedMotion, onSwitch: switchGrove });
  plazaXiangqi = createPlazaXiangqi({ getMirror: () => plazaSalon?.userData.xiangqi ?? null, getSeat: () => seatAtGrove(walking?.getPose()),
    focusWorld: () => host.focus({ preventScroll: true }), onSwitch: switchGrove });
  playProviders.push(() => groveGames()[groveGame]);
  playProviders.push(() => cafeGames()[cafeGame]);
  playProviders.push(() => plazaStage);
  playDock = createPlayDock({creationToolsEnabled}); const visitTools = playDock.content;
  if (creationToolsEnabled) buildControls=createSharedBuildControls({getPose:()=>walking?.getPose(),isBuildableRoom:id=>world?.stores.some(store=>store.id===id && store.category==='home'),onBuilderChange:builder=>{builderAim='';if(!builder.active)buildLayer?.setGhost(null);},request:message=>multiplayer?.command(message)??Promise.resolve({ok:false,message:'Join the town before building.'})});
  visitTools.append($('.player-controls'), cyclingBoard.panel, ...(buildControls ? [buildControls.panel] : []));
  officeUI=createOfficeUI({host,panelHost:visitTools,renderer,getWorld:()=>world,getMultiplayer:()=>multiplayer,walking,
    captureStreet:()=>captureOfficeStreet({scene,camera,pipeline,renderer,architecture:buildingMesh,skyline:officeSkylineOff||softwareAcceptance?null:{mode:'live'},lights:storeLights,avatar:playerAvatar,lobby:buildingMesh?.userData.officeArrival,world,getWorld:()=>world,pose:walking?.getPose()})});
  // IPIC screenings (#367): the town's timeline on the existing screen, while the player is inside IPIC.
  // Mounted on the viewport, not the canvas host: walking takes pointer capture on the canvas host.
  ipicScreening??=createIpicScreening({host:host.parentElement??host,THREE,getMultiplayer:()=>multiplayer,getScreen:()=>buildingMesh?.userData.interiors?.userData.screens?.[0]??null,
    getVenue:()=>{
      const pose=walking?.getPose(),room=pose&&!officeUI?.active?walking?.environment?.roomAt(pose.position[0],pose.position[2]):null;
      if(room?.interior!==IPIC_INTERIOR)return {active:false,auditorium:false};
      return {active:true,auditorium:room.toLocal(pose.position[0],-pose.position[2])[1]>=26};
    }});
  // Bird cams: Jev flies a few birds over the district; ride along or take over.
  birdCams = createBirdCams({ scene, camera, host, getEnvironment: () => world && walking?.active ? birdFlightEnvironment() : null, getInterests: birdInterests, getPathHints: () => world?.birdPathHints ?? {} });
  birdCamsUI = createBirdCamsUI(birdCams);
  visitTools.insertBefore(birdCamsUI.panel, buildControls?.panel ?? null);
  $('#viewport').append(playDock.element);
  clearView = createClearView();
  photoMode = createPhotoMode({ camera, canvas: renderer.domElement, host,
    // What the pipeline actually renders: acceptance runs and ?ao=off override the selected mode.
    getQuality: () => { const stats = quality.stats; return { ...stats, scale: softwareAcceptance ? 0.25 : stats.scale, occlusion: debugOcclusion !== 'off' && !softwareAcceptance && stats.occlusion }; },
    canOpen: () => Boolean(multiplayer?.connected && !multiplayer.traveling && world && !loading && document.body.classList.contains('access-granted')),
    onOpen: () => { walking?.halt(); },
  });
  visitTools.prepend(photoMode.panel);
  photoMode.panel.after(createGuideEntry());
  landmarks = createAccountLandmarks({ request: (action, data) => multiplayer.landmarkRequest(action, data), worldId: worldIdFromSearch(location.search) });
  placesUI = setupPlacesUI({ places: [], landmarks, onGo: goToPlace, getPosition: () => walking?.getPosition() ?? null, getYaw: () => walking?.getYaw() ?? 0,
    isOutdoor: position => Boolean(world && walkingEnvironment().isFree(position[0],-position[1]) && !walkingEnvironment().roomAt(position[0],-position[1])) });
  startMultiplayer();
  districtUI = setupDistrictUI({ onArrive: arriveAtStore, onEnter: enterStore, onAtmosphere: updateAtmosphere, describeStore: describeInterior, canEnter: canEnterStore });
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
  registerDiagnosticSource('renderer', () => describeRenderer(renderer, { quality: quality?.stats ?? null, pipeline: pipeline?.stats ?? null, reflections: storefrontReflections?.stats ?? null, softwareAcceptance }));
  registerDiagnosticSource('scene', () => describeScene(scene));
  registerDiagnosticSource('game', gameDiagnostics);
  setScreenshotCapture(capture => { pendingCapture = capture; });
}
$('.loading-report').addEventListener('click', () => window.dispatchEvent(new CustomEvent('river-oaks:report-problem')));

// Where the player is and what the game is doing, for problem reports. Positions
// are rounded to 10 cm; nothing here names another player.
function gameDiagnostics() {
  const pose = walking?.active ? walking.getPose() : null, round = value => Math.round(value * 10) / 10, loadingPanel = $('#loading');
  return {
    worldId: worldIdFromSearch(location.search), loaded: Boolean(world), walking: Boolean(walking?.active),
    position: pose?.position ? pose.position.map(round) : null, yaw: Number.isFinite(pose?.yaw) ? round(pose.yaw) : null,
    room: pose?.roomId ?? walking?.roomId ?? null, flying: Boolean(pose?.flying), riding: Boolean(pose?.riding),
    camera: [camera.position.x, camera.position.y, camera.position.z].map(round),
    place: $('#walking-place')?.textContent?.trim() || null,
    multiplayer: { state: host.dataset.multiplayer ?? null, connected: Boolean(multiplayer?.connected) },
    panels: { sidebar: !document.body.classList.contains('panel-collapsed'), clearView: Boolean(clearView?.active), debugTools: Boolean(debugTools) },
    loading: loadingPanel ? { shown: !loadingPanel.hidden, error: loadingPanel.classList.contains('error') ? loadingPanel.querySelector('p')?.textContent ?? null : null } : null,
    connection: $('#connection')?.textContent?.trim() || null,
  };
}

// The town owns gameplay state from startup through reconnect.
function startMultiplayer() {
  if (multiplayer) return;
  remotePlayers = createRemotePlayers(scene, host);
  buildLayer ??= createSharedBuildLayer(scene);
  buildControls?.hide();
  multiplayer = createMultiplayer({
    creationToolsEnabled,
    getWalking: () => walking,
    onVoiceChange: state => remotePlayers?.setSpeaking(state.speaking),
    getPose: () => officeUI?.pose ?? walking?.getPose(),
    getEnvironment: () => walking?.environment,
    getMeetingPlaces: () => world ? placesOf(world) : [],
    getOwnerHomes: () => world?.stores.filter(store => store.category === 'home' && store.access === 'owner') ?? [],
    getRegionSha256: () => worldRegionSha256,
    onHomeAccess: () => districtUI?.refreshAccess(),
    onSnapshot: snapshot => { ipicScreening?.onSnapshot(snapshot); if (world) community.applyRemote(snapshot);buildLayer?.sync(snapshot.builds??[]);plazaSalon?.userData.rack?.setTaken(snapshot.cycling?.taken ?? []); },
    onCorrection: player => { if (world && player) { walking.applyServerPose(player); plazaBicycle?.sync(); } },
    onPlayers: (players, selfId) => {
      host.dataset.multiplayer = players.length ? 'joined' : 'disconnected';
      remotePlayers.sync(players.filter(p=>!p.office), selfId);
      officeUI?.sync(players,selfId);
      placesUI?.setPlayers(players, selfId);
      if (!players.length) buildLayer?.sync([]);
      const self = players.find(player => player.id === selfId);
      walking?.syncAuthoritativePose(self);
      if (self) cyclingBoard?.setName(self.name);
      playerAvatar?.setSharedIdentity(self);
      if (self?.canBuild) buildControls?.show(); else buildControls?.hide();
      worldPortal?.refreshCapability();
      districtUI?.refreshAccess();
      if (self) void worldPortal?.load();
      if (self) void arriveAtSharedLink();
      buildControls?.sync(players.length ? multiplayer?.snapshot?.builds ?? [] : [], self?.canBuild ? selfId : null);
      if (self?.canBuild) buildControls?.loadInventory(selfId);
      if (self && landmarkAccountId !== selfId) {
        landmarkAccountId = selfId;
        const store = createAccountLandmarks({ request: (action, data) => multiplayer.landmarkRequest(action, data), worldId: worldIdFromSearch(location.search) });
        landmarks = store;
        placesUI?.setLandmarks(store);
        store.load().then(() => { if (landmarks === store) placesUI?.refresh(); })
          .catch(error => { if (landmarks === store) placesUI?.say(error.message, 'error'); });
      } else if (!self && landmarkAccountId !== null) {
        landmarkAccountId = null;
        landmarks = createAccountLandmarks({ request: (action, data) => multiplayer.landmarkRequest(action, data), worldId: worldIdFromSearch(location.search) });
        placesUI?.setLandmarks(landmarks);
      }
    },
  });
  seatingControls=createSharedSeatingControls({host:document.querySelector('.walking-console'),getTown:()=>multiplayer,
    getPose:()=>walking?.getPose(),getEnvironment:()=>walking?.environment,
    request:message=>multiplayer.command(message),onConfirmed:player=>walking.applyServerPose(player),
    getBenches:()=>seatAndWater?.benches()??[],isHeld:key=>seatAndWater?.residentHolds(key)??false,isBusy:()=>seatAndWater?.busy()??false});
  host.dataset.multiplayer = 'connecting';
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
  officeUI?.reset();
  storeIntros?.reset();
  walking?.exit();
  generatedInteriors?.dispose(); generatedInteriors = null;
  storefrontReflections?.dispose(); storefrontReflections = null;
  if (worldGroup) {
    scene.remove(worldGroup);
    worldGroup.remove(buildingMesh);
    buildingMesh?.userData.dispose?.();
    worldGroup.remove(interiorsLayer);
    ipicScreening?.dispose(); storePeople?.userData.dispose?.(); storePeople = null; interiorsLayer = null;
    plazaSalon?.userData.rack?.dispose();
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
  const creatorRegion=data.provenance?.kind==='creator';
  if(creatorRegion) {
    document.title=`${data.title} — Shared worlds`;
    $('.identity .eyebrow').textContent='Creator-authored region';
    $('.identity h1').textContent=data.title;
    $('.district-address').textContent='A place made by Jevica';
    $('.viewport-kicker').textContent='A shared creator world';
    $('#view-name').textContent=data.title;
    $('.view-meta').textContent='Creator-authored · shared with visitors';
    $('#viewport').setAttribute('aria-label',`Explore ${data.title}`);
    host.setAttribute('aria-label',`Walk ${data.title}. WASD moves, drag looks around, E talks to a nearby person.`);
  }
  worldGroup = new THREE.Group();
  // Facades, arcade rails and neon dissolve near the camera, like trees, so a take-off beside the shops never fills the view.
  buildingMesh = seeThroughNearCameraIn(buildDistrictBuildings(data));
  const ground=buildGround(data),roads=buildRoads(data);
  const streetEnvironment=createWalkingEnvironment(data);
  const streetSpace=(x,z)=>streetEnvironment.isFree(x,z)&&!streetEnvironment.roomAt(x,z);
  const sidewalks=buildDesignatedSidewalks(data,streetSpace);
  // Rising terrain must not show through walk-in floors (render only). Roads and
  // sidewalks never rise above a room floor, so only the terrain surface pays for it.
  const lobbyCutout=officeLobbyGroundCutout(data);
  roomGroundClip?.dispose();roomGroundClip=createRoomGroundClip(buildingMesh.userData.rooms??[],{persistent:lobbyCutout?[lobbyCutout]:[]});roomGroundClip.apply(ground.children[0]);
  host.dataset.streetProfile=JSON.stringify(sidewalks.userData.streetProfile);
  const supports=[ground.children[0],roads,...sidewalks.children];
  registerGroundSurfaces(data,supports);
  const furniture=buildStreetFurniture(data,streetSpace);
  seatAndWater?.load(data,streetSpace);
  plazaBicycle?.load(data);
  community.setWorld(data, buildingMesh.userData.rooms ?? []);
  storePeople = buildStorePeople(buildingMesh.userData.rooms ?? [], { reducedMotion, sharedPopulation: true });
  interiorsLayer = new THREE.Group(); interiorsLayer.name = 'Boutique interiors layer';
  interiorsLayer.add(buildingMesh.userData.interiors, storePeople);
  generatedInteriors = createGeneratedInteriorStream(buildingMesh.userData.generatedRooms ?? [], interiorsLayer);
  layers = { ground, roads, buildings: buildingMesh, interiors: interiorsLayer, trees: data.vegetation ? buildObservedFoliage(data) : buildFoliage(data) };
  Object.values(layers).forEach((layer) => worldGroup.add(layer));
  worldGroup.add(seeThroughNearCameraIn(buildDistrictDetail(data)));
  worldGroup.add(sidewalks);
  worldGroup.add(furniture);
  // The Dior-Toulouse plaza furnished as an open-air salon (plaza-salon-plan.js).
  plazaSalon = buildPlazaSalon(data);
  plazaStage?.setWorld(data);
  worldGroup.add(plazaSalon);
  buildingMesh.add(seeThroughNearCameraIn(buildDistrictFantasy(data)));
  document.querySelectorAll('[data-layer]').forEach((input) => { layers[input.dataset.layer].visible = input.checked; });
  scene.add(worldGroup);
  storefrontReflections = createStorefrontReflections({
    renderer, scene, materials: buildingMesh.userData.reflectionMaterials,
    excluded: [...buildingMesh.userData.reflectionExclusions, storePeople,
      ...scene.children.filter(child => child !== worldGroup && !child.isLight)],
  });
  updateAtmosphere();
  document.body.classList.add('district');
  $('#district-source').hidden = creatorRegion;
  $('#district-directory').hidden = false;
  $('#building-layer-label').textContent = creatorRegion?'Buildings & architecture':'Boutiques & architecture';
  districtUI.setStores([...data.stores, ...venueDoorSites(data)], 'Dior');
  $('#view-scale').textContent = creatorRegion?'Explore a creator-built region':'Street level · meet the locals';
  $('#connection').textContent = 'World ready to explore';
  $('#stores-count').textContent = data.stores.length;
  $('#terrain-state').textContent = creatorRegion?'Creator-authored terrain':'Mapped district terrain';
  $('#canopy-state').textContent = data.vegetation ? '2018 LiDAR canopy' : creatorRegion ? 'Creator-authored trees' : 'District trees';
  $('#canopy-source').hidden = !data.vegetation;
  if (data.vegetation) $('#canopy-source').textContent = 'Tree placement follows 2018 LiDAR. Foliage is interpreted; the independent historical canopy comparison does not pass.';
  const limitations = $('#limitations');
  limitations.replaceChildren(...(data.limitations ?? []).map((text) => { const item = document.createElement('li'); item.textContent = text; return item; }));
}

// One walkable-area model per loaded district, shared by arrival checks.
let arrivalEnvironment = null, birdEnvironment = null;
function birdFlightEnvironment() {
  const base=walking?.environment;
  if(!base)return null;
  if(birdEnvironment?.base!==base)birdEnvironment={base,value:treeFlightEnvironment(base,world)};
  return birdEnvironment.value;
}

function walkingEnvironment(includeCreations=true) {
  if (arrivalEnvironment?.world !== world) arrivalEnvironment = { world, environment: createWalkingEnvironment(world,[{contains:(...args)=>buildLayer?.colliders.some(collider=>collider.contains(...args))??false}]), placement:createWalkingEnvironment(world) };
  return includeCreations?arrivalEnvironment.environment:arrivalEnvironment.placement;
}

function enterWalk(position, lookAt, pitch = 0) {
  if (!world || !walking) return;
  walking.enter(world, position, lookAt, pitch);
}

function canEnterStore(store) {
  if (store?.access !== 'owner') return true;
  return Boolean(multiplayer?.connected && (multiplayer.snapshot?.players.find(player => player.id === multiplayer.identity?.id)?.canBuild
    || multiplayer.homeAccess.some(home => home.storeId === store.id)));
}

function enterStore(store) {
  if (!canEnterStore(store)) return { ok: false, message: 'This home is private. Jevica can invite you inside.' };
  districtUI.select(store.id);
  return multiplayer.travel({storeId:store.id,mode:'enter'});
}

function leaveStore(store) {
  return multiplayer.travel({storeId:store.id,mode:'leave'});
}

function describeInterior(store) {
  const room = world ? storeRoomsFor(world).find(item => item.storeId === store.id) : null;
  if (!room) return 'Exterior viewing destination.';
  const { label, staff, guests, mannequins, highlights } = sharedRoomSummary(room);
  const people = store.category === 'home' ? `${guests} resident${guests === 1 ? '' : 's'}`
    : [`${staff} associate${staff === 1 ? '' : 's'}`, `${guests} guest${guests === 1 ? '' : 's'}`, mannequins ? `${mannequins} mannequin${mannequins === 1 ? '' : 's'}` : null].filter(Boolean).join(', ');
  return `${store.access === 'owner' ? 'Invitation-only home · ' : ''}${label} · ${Math.round(room.width)} × ${Math.round(room.depth)} m walk-in floor · ${people} · ${highlights.join(', ')}. Fictional room layout.`;
}

// All destinations are validated by the town before applying their pose.
async function goToPlace(place) {
  if (!world || !walking) return { ok: false, message: 'The district is still loading.' };
  const target = place.kind === 'spot' ? { placeId: place.ref } : place.kind === 'shop' ? { storeId: place.ref, mode: 'arrive' }
    : place.kind === 'peer' ? { peerId: place.ref } : { position: [place.position[0], place.position[1]] };
  const result = await multiplayer.travel(target);
  if (result?.ok && Number.isFinite(place.yaw) && ['landmark', 'link'].includes(place.kind)) walking.setYaw(place.yaw);
  return result;
}

async function arriveAtSharedLink() {
  if(!pendingSharedPlace||sharedPlaceInFlight||!world||!multiplayer?.connected)return;
  const linked=pendingSharedPlace;sharedPlaceInFlight=true;
  try {
    const result=await goToPlace(linked);
    if(result?.ok===false && (!multiplayer.connected||result.message==='Reconnect before taking an action.'))return;
    pendingSharedPlace=null;
    placesUI?.say(result?.ok===false?(result.message??`${linked.name} is not reachable right now.`):`You're at ${linked.name}`,result?.ok===false?'error':'ok');
  } catch(error) {
    pendingSharedPlace=null;placesUI?.say(error.message??'The shared place is unavailable.','error');
  } finally {sharedPlaceInFlight=false;}
}

function arriveAtStore(store) {
  return multiplayer.travel({storeId:store.id,mode:'arrive'});
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
    const worldId=worldIdFromSearch(location.search);
    const manifest=worldId===DEFAULT_WORLD_ID?{template:'river-oaks'}
      :await jsonResponse(`/api/world-data?world=${encodeURIComponent(worldId)}`);
    worldRegionSha256=manifest.regionSha256??null;
    let data;
    if(manifest.template==='region-v1')data=manifest.world;
    else if(manifest.template==='river-oaks') {
      const [district,vegetation,approved]=await Promise.all([
        jsonResponse('/data/district.json'),jsonResponse('/data/district-vegetation.json'),
        jsonResponse('/data/building-interiors/river-oaks-gallery-v2.json'),
      ]);
      district.vegetation=validateVegetation(district,vegetation);
      data=attachDistrictGalleryPlan(district,approved);
    } else throw new Error('This region format is not supported by this client');
    if (data.schema_version !== 1 || data.scene !== 'district' || !Array.isArray(data.bounds_m) || !['roads', 'stores', 'buildings', 'trees'].every(key => Array.isArray(data[key]))) throw new Error('The district data does not match the supported schema.');
    populateWorld(data);
    // Reveal a finished street: stone, asphalt and sky first. Trees, people
    // and interiors keep streaming behind the progress pill. On a slow link
    // every download shares the bandwidth, so the wait is capped.
    $('#loading p').textContent = 'Laying the stone and lighting the sky…';
    await assetProgress?.settled(url => /\/assets\/materials\//.test(url), { timeout: 4000 });
    $('#verification-state').textContent = data.provenance?.kind==='creator'?'A creator-authored region':'A real district, reimagined';
    $('#verification-detail').textContent = data.provenance?.kind==='creator'
      ? 'Terrain, paths, buildings, and places were supplied by the world creator. Residents and encounters are fictional.'
      : `${data.stores.length} real store names on mapped streets, with imagined architecture and fictional encounters. This is an artistic interpretation.`;
    $('#verification-dot').className = 'status-dot pass';
    $('#loading').hidden = true;
    enterWalk(data.walkSpawn, data.walkLookAt);
    if (multiplayer?.snapshot) {
      community.applyRemote(multiplayer.snapshot);
      walking.applyServerPose(multiplayer.snapshot.players.find(player => player.id === multiplayer.identity?.id));
    }
    const places = placesOf(data);
    placesUI?.setPlaces(places);
    placesUI?.setWorld(data);
    placesUI?.setPlayers(multiplayer?.snapshot?.players??[],multiplayer?.identity?.id);
    // A shared link (?place=… or ?at=…) lands its visitor there after arrival.
    const linked = destinationFromSearch(location.search, places, data.bounds_m);
    if (linked) {
      pendingSharedPlace=linked;
      void arriveAtSharedLink();
    } else if(new URLSearchParams(location.search).has('place')) placesUI?.say('That shared place is no longer available in this world.','error');
  } catch (error) {
    showError(`${error.message}. Use reload to try loading the district again.`);
  } finally {
    loading = false;
    $('#reload').disabled = false;
  }
}


function updateStoreLights() {
  roomGroundClip?.setEnabled(Boolean(interiorsLayer?.visible));
  roomGroundClip?.setPersistentEnabled(Boolean(buildingMesh?.visible));
  const positions = interiorsLayer?.visible
    ? [...(buildingMesh?.userData.interiors?.userData.lightPositions ?? []), ...(generatedInteriors?.lightPositions ?? [])] : [];
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
  noteFrame(now);
  const auditStart = renderAudit ? performance.now() : 0;
  clock.update();
  if (lastFrame !== null) quality.sample(now - lastFrame);
  lastFrame = now;
  const delta = Math.min(clock.getDelta(), 0.08);
  const self = multiplayer?.snapshot?.players.find(player => player.id === multiplayer.identity?.id);
  community?.update(delta, now);
  generatedInteriors?.update(camera.position, now, self?.levelId);
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
  // Riding a bird pauses walking; the bird drives the camera below.
  const introRoom = self && multiplayer?.connected && world
    ? storeRoomsFor(world).find(room => room.category !== 'home' && (!self.levelId || room.planId === self.levelId)
      && room.contains(self.position[0], self.position[1], .2)) : null;
  storeIntros?.observe({ room: introRoom, accountId: multiplayer?.identity?.id,
    worldId: worldIdFromSearch(location.search),
    canPlay: Boolean(walking?.active && !loading && !multiplayer?.traveling && !photoMode?.active && !birdCams?.riding && !self?.altitude
      && (!introRoom?.generatedPlan || generatedInteriors?.readyFor(introRoom.planId))),
  });
  if (officeUI?.active || officeUI?.entering || storeIntros?.active || photoMode?.active || birdCams?.riding) walking?.halt();
  else if (multiplayer?.connected && !multiplayer.traveling) walking?.update(delta, now);
  else walking?.halt();
  plazaGames?.update(); plazaDominoes?.update(); plazaHearts?.update(); plazaSpades?.update(); plazaLiarsDice?.update(); plazaBackgammon?.update(); plazaCribbage?.update(); plazaJenga?.update(); plazaYacht?.update(); plazaWinePong?.update(); plazaShuffleboard?.update(); plazaDarts?.update(); ipicDarts?.update(); venueDarts?.update(); axePanel?.update(); plazaMancala?.update(); plazaGo?.update(); plazaChineseCheckers?.update(); plazaXiangqi?.update(); plazaStage?.update();
  if (multiplayer?.connected) birdCams?.update(delta);
  multiplayer?.update(now);
  officeUI?.prepare(now);
  seatingControls?.update(now);
  if (auditCamera) {
    camera.position.copy(auditCamera.position); camera.lookAt(auditCamera.target);
    if (auditCamera.fov && camera.fov !== auditCamera.fov) { camera.fov = auditCamera.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
  }
  photoMode?.update();
  storeIntros?.update(now);
  remotePlayers?.update(now, camera);
  buildLayer?.update(camera.position);
  updateBuilder();
  playerAvatar?.update(now, camera, renderer.getSize(viewportSize).y, Boolean(multiplayer?.connected));
  plazaBicycle?.update(now);
  followSunShadow();
  treeShadows?.hide(); // Shadow proxies show only while the sun draws its map.
  if (!softwareAcceptance && storefrontReflections && environmentAssets) {
    const ground = terrainHeight(world.terrain, camera.position.x, -camera.position.z);
    if (camera.position.y - ground < 18) reflectionPosition.set(camera.position.x, ground + 2.5, camera.position.z);
    else {
      const stop = world.stores.find(store => store.name === 'Dior')?.visit ?? world.stores[0]?.visit ?? world.walkSpawn;
      reflectionPosition.set(stop[0], terrainHeight(world.terrain, stop[0], stop[1]) + 2.5, -stop[1]);
    }
    storefrontReflections.update(now, reflectionPosition);
  }
  debugTools?.update(now);
  // llvmpipe draws both browser clients on CPU. Keep simulation and transport
  // updating every frame while capping only acceptance-profile draw work.
  if (officeUI?.active || !softwareAcceptance || now - lastSoftwareDraw >= 1000) {
    lastSoftwareDraw = now;
    renderer.info.reset();
    const currentRoom = buildingMesh?.userData.generatedRooms?.find(room => room.planId === self?.levelId);
    const generatedRoomActive = !officeUI?.active && interiorsLayer?.visible
      && generatedInteriors?.readyFor(self?.levelId) && currentRoom;
    // Auto uses the approved room's fixed contact layer while the visitor is
    // inside. Keep full GTAO for Sharpest and photo mode, and restore the
    // district's Auto policy on exit.
    pipeline.setOcclusion(debugOcclusion !== 'off' && !softwareAcceptance && quality.stats.occlusion
      && !(quality.mode === 'auto' && generatedRoomActive && !photoMode?.active));
    // The office presentation also calls this pipeline; clear a previous
    // gallery mask before either render path runs.
    pipeline.setOcclusionExteriorMask(generatedRoomActive ? worldGroup : null, interiorsLayer);
    ipicScreening?.update();
    if (!officeUI?.update(now, delta)) {
      if (exteriorCulling && generatedRoomActive && canCullExterior(camera, currentRoom))
        renderWithoutExterior(worldGroup, interiorsLayer, () => pipeline.render(delta));
      else if (exteriorCulling && ipicAuditoriumCull()) {
        const own = ipicOwn();
        if (own) renderOnly(worldGroup, own, () => pipeline.render(delta));
        else renderWithoutExterior(worldGroup, interiorsLayer, () => pipeline.render(delta));
      } else pipeline.render(delta);
    }
    photoMode?.afterRender();
    if (pendingCapture) { const capture = pendingCapture; pendingCapture = null; capture(renderer.domElement); }
  }
  if (now-lastRenderStats>1000) {
    host.dataset.renderStats=JSON.stringify({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});
    host.dataset.reflections = JSON.stringify(storefrontReflections?.stats ?? null);
    host.dataset.pipeline = JSON.stringify(pipeline.stats);
    host.dataset.quality = JSON.stringify(quality.stats);
    lastRenderStats=now;
  }
  renderAudit?.frame(now, performance.now() - auditStart);
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
const BIRD_ACTIVITY = [[/enchant|wish/i, 7], [/chatting|helping|greeting|aid/i, 6], [/seeking cover|turning|walking|on the way|heading/i, 2.5], [/rest|paused|sheltered|at work/i, 1.2]];
function birdInterests() {
  const interests = [];
  for (const local of community?.state?.locals ?? []) {
    if (local.indoor || !Array.isArray(local.position)) continue;
    const status = String(local.status ?? ''), weight = BIRD_ACTIVITY.find(([pattern]) => pattern.test(status))?.[1] ?? 2;
    interests.push({ id: `local:${local.id}`, label: status ? `${local.name} (${status})` : local.name, position: [local.position[0], local.position[1]], weight: local.id === community.state.selectedId ? weight + 3 : weight });
  }
  const me = walking?.getPosition();
  // view: where the player is looking, so the companion bird can circle in front of them.
  const yaw = walking?.getYaw?.() ?? 0;
  if (me) interests.push({ id: 'player', label: playerAvatar?.appearance?.startsWith('jevica') ? 'Jevica' : 'you', position: [me[0], me[1]], view: [-Math.sin(yaw), Math.cos(yaw)], weight: 4 });
  for (const player of multiplayer?.snapshot?.players ?? []) if (player.id !== multiplayer.identity?.id) interests.push({ id: `player:${player.id}`, label: player.name, position: player.position, weight: 4 });
  for (const spot of world?.communityLocations ?? []) interests.push({ id: `spot:${spot.id}`, label: spot.name, position: [spot.position[0], spot.position[1]], weight: 1.5 });
  return interests;
}

function updateBuilder() {
  const builder = buildControls?.builder;
  if (!builder?.active || !world || !walking?.active) { buildLayer?.setGhost(null); builderAim = ''; return; }
  const pose = walking.getPose();
  if (!pose || pose.flying || pose.riding || pose.roomId && !world.stores.some(store=>store.id===pose.roomId && store.category==='home')) {
    buildLayer?.setGhost(null);
    if (builderAim !== 'grounded') { builderAim = 'grounded'; buildControls.aimAt(null, { valid: false, message: 'Stand outside or inside a home to build.' }); }
    return;
  }
  let ray = null;
  if (builderPointer.at) {
    builderPointer.ray.setFromCamera(builderPointer.at, camera);
    ray = { origin: builderPointer.ray.ray.origin.toArray(), direction: builderPointer.ray.ray.direction.toArray() };
  }
  const target = builderTarget(pose, ray, {grid:builder.grid}), kindId = builder.moving?.kind ?? builder.kind, kind = buildGeometry({kind:kindId,assembly:builder.assembly});
  if(!kind){buildLayer?.setGhost(null);buildControls.aimAt(null,{valid:false,message:'Fix the object parts before placing.'});return;}
  if (world !== builderRoads?.world) builderRoads = { world, roads: buildSiteRoads(world) };
  const snapshot = multiplayer?.snapshot;
  const key = JSON.stringify([target, kindId, builder.finish, builder.assembly, builder.yaw, builder.moving?.id, snapshot?.revision, pose.position.map(v => Math.round(v * 10))]);
  if (key === builderAim) return;
  builderAim = key;
  const verdict = evaluatePlacement({ environment: walkingEnvironment(false), roads: builderRoads.roads, kind, assembly:builder.assembly, yaw:builder.yaw, position: target, feet: poseFeet(pose),
    builds: snapshot?.builds ?? [], players: snapshot?.players ?? [], locals: snapshot?.locals ?? [], selfId: multiplayer?.identity?.id, moving: builder.moving });
  buildLayer?.setGhost({ kind: kindId, finish: builder.moving?.finish ?? builder.finish, assembly:builder.assembly, position: target, ground: verdict.ground, yaw: builder.yaw, valid: verdict.valid });
  buildControls.aimAt(target, verdict);
}
document.addEventListener('keydown', event => {
  if (!buildControls?.builder.active || !isGameplayKey(event) || event.target.closest?.('button')) return;
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
  const pose = walking.getPose();
  const id = pickPerson(raycaster, [storePeople, playerAvatar?.carriage.driver].filter(Boolean),
    [buildingMesh, buildingMesh?.userData.interiors, playerAvatar?.carriage.object].filter(Boolean),
    id => !walking.active || withinTalkingReach((community.state?.locals ?? []).find(local => local.id === id), pose, (point,eyeHeight) => walking.canSee(point,eyeHeight)));
  if (id) community.selectLocal(id);

});

// Debug tools (colliders, walkable grid, ground triangles, source map, polygon
// inspector) load on demand: F3, ?debug=1, the desktop View menu, or reopening
// with the panel left open. They ship in every build so the desktop app has them.
function openDebugTools(force) {
  if (debugTools) return debugTools.toggle(force);
  debugLoading ??= import('./debug-tools.js').then(({ createDebugTools }) => {
    debugTools = createDebugTools({ scene, camera, host, renderer, getWorld: () => world, getNavigation: () => playerAvatar?.carriage.prince.navigationDebug ?? null, getEnvironment: () => walking?.environment ?? null,
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
if (import.meta.env.DEV) window.__riverGeneratedInteriors = () => generatedInteriors?.debug() ?? [];
if (import.meta.env.DEV) window.__riverExteriorCull = () => {
  const self = multiplayer?.snapshot?.players.find(player => player.id === multiplayer.identity?.id);
  const room = buildingMesh?.userData.generatedRooms?.find(item => item.planId === self?.levelId);
  return { camera: camera.position.toArray(), player: self?.position, levelId: self?.levelId,
    room: room && { floor: room.floor, height: room.height, local: room.toLocal(camera.position.x, -camera.position.z) },
    direction: camera.getWorldDirection(new THREE.Vector3()).toArray(),
    front: room && [room.aMin, room.aMax].map(a => { const [east, north] = room.toWorld(a, 0);
      return new THREE.Vector3(east, room.floor + room.height / 2, -north).project(camera).toArray(); }),
    cull: canCullExterior(camera, room), ipic: ipicAuditoriumCull() };
};
// Read-only bird cam state for development and browser acceptance runs.
// Each bird also reports how it appears in the current view: inside the frame,
// unobstructed by buildings, and its wingspan in CSS pixels.
if (import.meta.env.DEV) window.__riverBirds = () => {
  if (!birdCams) return null;
  const state = birdCams.state, point = new THREE.Vector3(), ray = new THREE.Raycaster();
  const scale = host.clientHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return { ...state, camera: camera.position.toArray(), walking: walking?.active ?? false, birds: state.birds.map(bird => {
    point.fromArray(bird.position);
    const distance = point.distanceTo(camera.position), ndc = point.clone().project(camera), inFrame = ndc.z < 1 && Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1;
    let blocked = false;
    if (inFrame && buildingMesh) { ray.set(camera.position, point.clone().sub(camera.position).normalize()); ray.far = Math.max(0, distance - .5); blocked = ray.intersectObject(buildingMesh, true).length > 0; }
    return { ...bird, distance: +distance.toFixed(1), inFrame, visible: inFrame && !blocked, wingspanPx: +(BIRD_WINGSPAN / distance * scale).toFixed(1), screen: [Math.round((ndc.x + 1) / 2 * host.clientWidth), Math.round((1 - ndc.y) / 2 * host.clientHeight)] };
  }) };
};
try {
  if (new URLSearchParams(location.search).get('debug') === '1') void openDebugTools(true);
  else if (JSON.parse(localStorage.getItem('river-oaks-debug') ?? '{}').open) void openDebugTools(true);
} catch { /* storage unavailable */ }

// Explicit development capacity audit camera and timing; absent from production.
if (import.meta.env.DEV && renderAudit) {
  window.__riverRenderAudit = {
    start: () => renderAudit.start(), stop: () => renderAudit.stop(),
    exteriorCulling(enabled) { exteriorCulling = Boolean(enabled); },
    crowdView() {
      const players = multiplayer?.snapshot?.players ?? [];
      if (!players.length) throw new Error('Join the shared world before framing its crowd.');
      const target = new THREE.Vector3();
      for (const player of players) target.add(new THREE.Vector3(player.position[0], player.position[2] + 1, -player.position[1]));
      target.divideScalar(players.length);
      const radius = Math.max(6, ...players.map(player => Math.hypot(player.position[0] - target.x, -player.position[1] - target.z) + 2));
      const distance = radius / Math.tan(camera.fov * Math.PI / 360) * Math.max(1, 1 / camera.aspect) * 1.3;
      auditCamera = { target, position: target.clone().add(new THREE.Vector3(0, distance * .55, distance)) };
    },
    // A fixed review pose for camera-manifest captures (#364): Three.js world
    // position and target, and optional FOV. release() hands the camera back.
    view({ position, target, fov }) { auditCamera = { position: new THREE.Vector3(...position), target: new THREE.Vector3(...target), fov, restoreFov: auditCamera?.restoreFov ?? camera.fov }; },
    release() { if (auditCamera?.fov) { camera.fov = auditCamera.restoreFov; camera.updateProjectionMatrix(); } auditCamera = null; },
    graphics() {
      const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        viewport: renderer.getSize(new THREE.Vector2()).toArray(), buffer: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
        quality: quality.stats, pipeline: pipeline.stats, render: { ...renderer.info.render }, memory: { ...renderer.info.memory } };
    },
  };
}

// Read-only diagnostics for browser acceptance runs; absent from production.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('motion-debug') === '1') {
  window.__riverOffice = () => officeUI?.inspect() ?? null;
  window.__riverPlazaGames = () => {
    if (!plazaGames) return null;
    const state = plazaGames.debug();
    return { ...state, mirror: state.tableId ? plazaSalon?.userData.chess?.board(state.tableId) ?? null : null,
      four: state.tableId ? { visible: plazaSalon?.userData.connectFour?.visible(state.tableId) ?? null, discs: plazaSalon?.userData.connectFour?.discs(state.tableId) ?? null } : null,
      morris: state.tableId ? { visible: plazaSalon?.userData.morris?.visible(state.tableId) ?? null, pieces: plazaSalon?.userData.morris?.pieces(state.tableId) ?? null } : null };
  };
  window.__riverPlazaStage = () => ({ live: plazaSalon?.userData.stage?.live ?? null, action: plazaStage?.interaction()?.label ?? null,
    // Travel to open pavement in front of the stage, toward the salon.
    async goNear() {
      const stage = world && plazaSalonPlan(world)?.stage;
      if (!stage) return { ok: false };
      const environment = walkingEnvironment(), free = ([x, north]) => environment.isFree(x, -north) && !environment.roomAt(x, -north);
      for (const angle of [0, 0.5, -0.5, 1, -1]) {
        const position = [stage.x + Math.sin(stage.heading + angle) * (stage.radius + 0.8), stage.north - Math.cos(stage.heading + angle) * (stage.radius + 0.8)];
        if (!free(position)) continue;
        const result = await goToPlace({ kind: 'landmark', name: 'Nearby', position });
        if (result?.ok) return { ok: true, position };
      }
      return { ok: false };
    } });
  window.__riverPlazaDominoes = () => plazaDominoes ? { ...plazaDominoes.debug(), table: plazaSalon?.userData.dominoes?.count() ?? null,
    deal: (seed, players) => plazaDominoes.deal(seed, players) } : null;
  window.__riverPlazaChineseCheckers = () => plazaChineseCheckers ? { ...plazaChineseCheckers.debug(), groveGame, table: plazaSalon?.userData.chineseCheckers?.count() ?? null,
    starShown: plazaSalon?.userData.chineseCheckers?.visible() ?? null, xiangqiShown: plazaSalon?.userData.xiangqi?.visible() ?? null, mancalaShown: plazaSalon?.userData.mancala?.visible() ?? null, gobanShown: plazaSalon?.userData.go?.visible() ?? null,
    reset: () => plazaChineseCheckers.reset() } : null;
  window.__riverPlazaXiangqi = () => plazaXiangqi ? { ...plazaXiangqi.debug(), groveGame, table: plazaSalon?.userData.xiangqi?.count() ?? null,
    boardShown: plazaSalon?.userData.xiangqi?.visible() ?? null, starShown: plazaSalon?.userData.chineseCheckers?.visible() ?? null, mancalaShown: plazaSalon?.userData.mancala?.visible() ?? null, gobanShown: plazaSalon?.userData.go?.visible() ?? null,
    reset: () => plazaXiangqi.reset() } : null;
  window.__riverPlazaGo = () => plazaGo ? { ...plazaGo.debug(), groveGame, table: plazaSalon?.userData.go?.count() ?? null, goban: plazaSalon?.userData.go?.visible() ?? null,
    mancalaBoard: plazaSalon?.userData.mancala?.visible() ?? null, reset: () => plazaGo.reset() } : null;
  window.__riverPlazaMancala = () => plazaMancala ? { ...plazaMancala.debug(), table: plazaSalon?.userData.mancala?.count() ?? null, reset: () => plazaMancala.reset() } : null;
  window.__riverAxes = () => axePanel ? { ...axePanel.debug(), stuck: Object.fromEntries(AXE_LANES.map(lane => [lane.id, buildingMesh?.userData.interiors?.userData.axeVenue?.axeLanes?.[lane.id]?.count() ?? null])),
    holdAt: mm => axePanel.holdAt(mm), open: () => axePanel.open() } : null;
  window.__riverVenueDarts = () => venueDarts ? { ...venueDarts.debug(), board: buildingMesh?.userData.interiors?.userData.axeVenue?.venueDarts?.count() ?? null,
    holdAt: mm => venueDarts.holdAt(mm), open: () => venueDarts.open() } : null;
  window.__riverIpicDarts = () => ipicDarts ? { ...ipicDarts.debug(), board: buildingMesh?.userData.interiors?.userData.dartboards?.[0]?.count() ?? null,
    hold: value => ipicDarts.hold(value), holdAt: mm => ipicDarts.holdAt(mm), open: () => ipicDarts.open() } : null;
  window.__riverPlazaDarts = () => plazaDarts ? { ...plazaDarts.debug(), board: plazaSalon?.userData.darts?.count() ?? null,
    hold: value => plazaDarts.hold(value), holdAt: mm => plazaDarts.holdAt(mm), reset: seed => plazaDarts.reset(seed),
    // Walk to the throwing line and face the board.
    async goTo() {
      const board = world && plazaSalonPlan(world)?.darts;
      if (!board) return { ok: false };
      const spot = [board.x + Math.sin(board.heading) * 2.37, board.north + Math.cos(board.heading) * 2.37];
      const result = await goToPlace({ kind: 'landmark', name: 'Darts line', position: spot });
      if (result?.ok) walking?.lookAt([board.x, board.north, groundSurfaceHeight(world, board.x, -board.north) + 1.73], 0.9);
      return { ok: Boolean(result?.ok) };
    } } : null;
  window.__riverPlazaWinePong = () => plazaWinePong ? { ...plazaWinePong.debug(), table: plazaSalon?.userData.winePong?.glasses() ?? null, ball: plazaSalon?.userData.winePong?.ballVisible() ?? null,
    hold: value => plazaWinePong.hold(value), deal: seed => plazaWinePong.deal(seed),
    // Walk to one end of the table (0 west, 1 east) and face down it.
    async goTo(side) {
      const spot = plazaSalon?.userData.winePong?.stand(side), table = world && plazaSalonPlan(world)?.winePong;
      if (!spot || !table) return { ok: false };
      const result = await goToPlace({ kind: 'landmark', name: 'Wine pong', position: spot });
      if (result?.ok) walking?.lookAt([table.x, table.north, groundSurfaceHeight(world, table.x, -table.north) + 0.8], 0.9);
      return { ok: Boolean(result?.ok) };
    } } : null;
  window.__riverPlazaYacht = () => plazaYacht ? { ...plazaYacht.debug(), benchGame, table: plazaSalon?.userData.yacht?.dice() ?? null,
    diceShown: plazaSalon?.userData.yacht?.visible() ?? null, towerShown: plazaSalon?.userData.jenga?.visible() ?? null, deal: seed => plazaYacht.deal(seed) } : null;
  window.__riverPlazaShuffleboard = () => plazaShuffleboard ? { ...plazaShuffleboard.debug(), longTableGame, table: plazaSalon?.userData.shuffleboard?.count() ?? null,
    pucksShown: plazaSalon?.userData.shuffleboard?.visible() ?? null, glassesShown: plazaSalon?.userData.winePong?.visible() ?? null,
    hold: value => plazaShuffleboard.hold(value), reset: () => plazaShuffleboard.reset() } : null;
  window.__riverPlazaJenga = () => plazaJenga ? { ...plazaJenga.debug(), table: plazaSalon?.userData.jenga?.count() ?? null, towerFallen: plazaSalon?.userData.jenga?.fallen() ?? null,
    aim: at => plazaJenga.aim(at), deal: seed => plazaJenga.deal(seed) } : null;
  window.__riverPlazaCribbage = () => plazaCribbage ? { ...plazaCribbage.debug(), walnutGame, pegs: plazaSalon?.userData.cribbage?.pegs() ?? null, board: plazaSalon?.userData.cribbage?.visible() ?? null,
    checkers: plazaSalon?.userData.backgammon?.visible() ?? null, deal: seed => plazaCribbage.deal(seed) } : null;
  window.__riverPlazaBackgammon = () => plazaBackgammon ? { ...plazaBackgammon.debug(), table: plazaSalon?.userData.backgammon?.count() ?? null,
    deal: seed => plazaBackgammon.deal(seed) } : null;
  window.__riverPlazaDice = () => plazaLiarsDice ? { ...plazaLiarsDice.debug(), cafeGame, table: plazaSalon?.userData.dice?.count() ?? null, cards: plazaSalon?.userData.cards?.count()?.backs ?? null, deal: seed => plazaLiarsDice.deal(seed) } : null;
  window.__riverPlazaSpades = () => plazaSpades ? { ...plazaSpades.debug(), cafeGame, table: plazaSalon?.userData.cards?.count() ?? null, deal: seed => plazaSpades.deal(seed) } : null;
  window.__riverPlazaHearts = () => plazaHearts ? { ...plazaHearts.debug(), cafeGame, table: plazaSalon?.userData.cards?.count() ?? null,
    deal: (seed, hand) => plazaHearts.deal(seed, hand) } : null;
  window.__riverCyclingBoard = () => cyclingBoard ? { ...cyclingBoard.debug(), mine: cyclingBoard.mine(), open: open => { cyclingBoard.panel.open = open; }, refresh: () => cyclingBoard.refresh() } : null;
  window.__riverCycling = () => plazaBicycle ? { riding: plazaBicycle.riding, slotId: plazaBicycle.slotId, rideMeters: plazaBicycle.rideMeters, lastRideMeters: plazaBicycle.lastRideMeters, yaw: plazaBicycle.placement?.yaw ?? null, prompt: plazaBicycle.prompt()?.kind ?? null,
    taken: multiplayer?.snapshot?.cycling?.taken ?? [], parked: plazaSalon?.userData.rack?.parked() ?? null,
    // Arrive at a slot's approach by the normal travel path.
    // Arrive at a slot's approach by the normal travel path. Like the seats' goNear, a
    // refused travel (a cooldown, or a spot briefly taken) is retried after a pause, then
    // nearby paving is tried, so a loaded machine does not fail the journey at the rack.
    async goNear(slotId) {
      const slot = world ? plazaSalonRack(world).find(item => item.id === slotId) : null;
      if (!slot) return { ok: false };
      const environment = walkingEnvironment(), free = ([x, north]) => environment.isFree(x, -north) && !environment.roomAt(x, -north);
      const around = [0.6, 1.1].flatMap(radius => Array.from({ length: 8 }, (_, i) => [slot.approach[0] + Math.sin(i * Math.PI / 4) * radius, slot.approach[1] + Math.cos(i * Math.PI / 4) * radius]));
      for (const position of [slot.approach, slot.approach, slot.approach, ...around].filter(point => free(point))) {
        const result = await goToPlace({ kind: 'landmark', name: 'Bike rack', position });
        if (result?.ok) return { ok: true, position };
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
      return { ok: false };
    } } : null;
  window.__riverSeatAndWater = () => seatAndWater ? {
    seated: walking?.getPose()?.sitting ? `${walking.getPose().sitting.buildId}:${walking.getPose().sitting.slot}` : null, interaction: seatAndWater.interaction()?.kind ?? null, offered: seatAndWater.interaction()?.targetId ?? null, ...seatAndWater.sites(),
    // Arrive on open pavement beside a seat or planter, by the normal travel path.
    async goNear(id) {
      const { seats, planters } = seatAndWater.sites(), site = [...seats, ...planters].find(item => item.id === id);
      if (!site || !world) return { ok: false };
      const environment = walkingEnvironment(), free = ([x, north]) => environment.isFree(x, -north) && !environment.roomAt(x, -north);
      const around = [1.1, 1.5].flatMap(radius => Array.from({ length: 8 }, (_, i) => [site.x + Math.sin(i * Math.PI / 4) * radius, site.north + Math.cos(i * Math.PI / 4) * radius]));
      for (const position of [site.approach, ...around].filter(point => point && free(point))) {
        const result = await goToPlace({ kind: 'landmark', name: 'Nearby', position });
        if (result?.ok) return { ok: true, position };
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
      return { ok: false };
    },
    face(x, north) { walking?.lookAt([x, north, groundSurfaceHeight(world, x, -north)], 0.9); },
    goTo(x, north) { return goToPlace({ kind: 'landmark', name: 'Spot', position: [x, north] }); },
  } : null;
  window.__riverVoice = () => multiplayer?.voice.debug() ?? null;
  window.__riverScreening = () => ipicScreening?.inspect() ?? null;
  // Development-only: send a raw command, as a modified client could, to prove the server refuses it.
  window.__riverMultiplayerCommand = message => multiplayer?.command(message);
  window.__riverMultiplayer = () => ({ connected: multiplayer?.connected ?? false, selfId: multiplayer?.identity?.id, snapshot: multiplayer?.snapshot, remotes: remotePlayers?.stats(), voice: multiplayer?.voice.debug() ?? null,creations:buildLayer?.stats(),birds:birdCams?.state,builder:buildControls?{...buildControls.builder,ghost:buildLayer?.ghost?{position:buildLayer.ghost.position.toArray(),visible:buildLayer.ghost.visible}:null,hint:document.querySelector('#build-hint')?.textContent,valid:document.querySelector('#build-hint')?.dataset.valid}:null });
  window.__riverPlayerAttention=()=>{
    const rig=playerAvatar?.rig;if(!rig)return null;
    rig.model.updateWorldMatrix(true,true);
    return {...playerAvatar.attention,position:playerAvatar.object.position.toArray(),bodyYaw:playerAvatar.object.rotation.y,
      head:rig.model.getObjectByName('head').getWorldQuaternion(new THREE.Quaternion()).toArray(),
      feet:playerAvatar.feet.map(leg=>({contact:leg.contact,error:leg.error,target:leg.target?.toArray(),actual:leg.foot.getWorldPosition(new THREE.Vector3()).toArray()})),
      eyes:rig.eyes.pose.map(p=>{const b=rig.model.getObjectByName(p.name);return {...p,position:b.getWorldPosition(new THREE.Vector3()).toArray(),forward:new THREE.Vector3(0,0,1).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion())).toArray()};})};
  };
  window.__riverConversation=(id=community?.state?.selectedId)=>{
    if(!id)return {id:null,speaking:false};
    const station=storePeople?.userData.figures.find(p=>p.id===id);
    const rig=station?.avatar,head=rig?.model.getObjectByName('head');
    return {id,speaking:Boolean(id&&community?.speakingId===id),nod:station?.conversation.pose,face:station?.face.pose,mouth:rig?.speechPose,eyes:rig?.eyes.pose,head:head?.quaternion.toArray()};
  };
  window.__riverCreatorObjects=()=>({resources:buildLayer?.stats(),rendered:(buildLayer?.object.children??[]).filter(entry=>entry.userData.build).map(entry=>({id:entry.userData.build.id,parts:entry.children.filter(child=>child.isMesh).map(child=>({color:child.material.color.getHexString(),transmission:child.material.transmission??0,position:child.position.toArray(),size:child.scale.toArray()}))}))});
  window.__riverCarriage = () => ({camera:{view:walking?.cameraView,position:camera.position.toArray()},vehicle:playerAvatar?.carriage.kind,chauffeur:playerAvatar?.carriage.chauffeur,companion:playerAvatar?.carriage.prince.companion,princePosition:playerAvatar?.carriage.prince.object.position.toArray(),princeVisible:playerAvatar?.carriage.prince.object.visible,wingsVisible:playerAvatar?.carriage.prince.object.getObjectByName('Jev’s angel wings')?.visible,placement:playerAvatar?.carriage.placement,unicorns:playerAvatar?.carriage.unicorns,spinners:playerAvatar?.carriage.spinners?.map(spinner=>({rotation:spinner.rotation.z})),visible:playerAvatar?.carriage.object.visible,riding:playerAvatar?.carriage.riding,tyreClearances:playerAvatar?.carriage.tyreClearances,pose:walking.getPose(),rider:playerAvatar?.object.position.toArray(),riderYaw:playerAvatar?.object.rotation.y});
  window.__riverPeople = (bone = 'head') => [...[playerAvatar?.carriage.driver].filter(p=>p?.userData.avatar).map(person => ({id:person.userData.localId,holder:person})), ...(storePeople?.userData.figures ?? [])]
    .filter(person => person.id&&(community.state?.locals ?? []).some(local=>local.id===person.id)).map(person => {
      person.holder.updateWorldMatrix(true,true);
      const bounds = new THREE.Box3().setFromObject(person.holder), point = bounds.getCenter(new THREE.Vector3());
      point.y = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.86;
      // A rig landmark stays on the body as swinging limbs change its bounds.
      const landmark = person.holder.getObjectByName(bone);
      if (landmark) { landmark.getWorldPosition(point); if (bone === 'head') point.y += 0.07; }
      point.project(camera);
      const rect = host.getBoundingClientRect();
      const local=(community.state?.locals ?? []).find(local=>local.id===person.id);
      return {id:person.id, position:[...local.position], renderedPosition:person.holder.getWorldPosition(new THREE.Vector3()).toArray(), role:person.role??local.role, task:person.task?{kind:person.task.kind,docked:person.task.docked,contacts:person.task.contacts}:null, seated:Boolean(person.seatedFeet), feet:person.seatedFeet?.map(leg=>({error:leg.error,target:leg.target.toArray(),actual:leg.foot.getWorldPosition(new THREE.Vector3()).toArray()})), attention:person.attention, workTime:person.workTime,
        reachable:withinTalkingReach(local,walking.getPose(),(point,eyeHeight)=>walking.canSee(point,eyeHeight)), visible:visibleInScene(person.holder), screen:[rect.left+(point.x+1)*rect.width/2,rect.top+(1-point.y)*rect.height/2], depth:point.z};
    });
  // Every resident and shop figure with an id, and its model.
  const peopleModels = () => [...(storePeople?.userData.figures ?? []).filter(person=>person.id).map(person=>({id:person.id,holder:person.holder,model:person.avatar.model}))];
  // Each person's baked face recipe (resident-face.js) and any face morphs left unbaked.
  window.__riverFaces = () => peopleModels().map(({ id, model }) => {
    let idleMorphs = 0;
    model?.traverse(item => { for (const name of Object.keys(item.morphTargetDictionary ?? {})) if (FACE_SHAPES.includes(name)) idleMorphs++; });
    return { id, face: model?.userData.face ?? null, idleMorphs };
  });
  window.__riverWishes = () => peopleModels()
    .map(person => {
      const local=(community.state?.locals ?? []).find(local=>local.id===person.id),effect=person.holder.getObjectByName('Wish effects');
      let skin=0,clothes=0;
      person.model?.traverse(item=>{if(item.isMesh && item.visible){if(/^(young|middleage|old)_/.test(item.material?.name ?? ''))skin++;else clothes++;}});
      return {id:person.id,wish:local?.wish,disrupted:Boolean(local?.wishDisruption),modelReady:Boolean(person.model),bodyVisible:person.model?.visible,height:person.holder.position.y-local.position[2],skin,clothes,props:effect?.children.filter(child=>child.visible).map(child=>child.name) ?? []};
    });

}

try {
  assetProgress = mountAssetProgress({ viewport: $('#viewport'), overlay: $('#loading'), manager: THREE.DefaultLoadingManager, reducedMotion });
  initializeRenderer();
  loadWorld();
} catch (error) {
  showError(`WebGL could not initialize: ${error.message}`);
}
