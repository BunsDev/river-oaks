import {placementCoordinate} from './placement-coordinate.js';
import * as THREE from 'three';
import { terrainHeight } from './geometry.js';
import { groundSurfaceTriangles } from './world-surface.js';
import { createWalkingEnvironment } from './walking.js';
import { storeRoomsFor } from './store-rooms.js';
import { colliderSegments, colliderWalls, describeObject, heaviestMeshes, ringSegments, ringToScene, roadSegments, roofRings, roomRings, storeMarkers, walkableSamples } from './debug-geometry.js';
import { fillTermList } from './term-list.js';
import './debug-tools.css';

// In-game debugging for the browser and desktop builds: collision, ground,
// source-map alignment, rooms, flight limits, skeletons and a polygon viewer.
// Every overlay lives under one group and is built only while it is shown.

export const DEBUG_LAYERS = [
  { id: 'colliders', label: 'Building colliders', hint: 'Walls the walking model blocks (red)' },
  { id: 'walkable', label: 'Walkable grid', hint: 'Sampled isFree around you: green free, red blocked' },
  { id: 'ground', label: 'Ground triangles', hint: 'Surfaces feet and wheels stand on' },
  { id: 'source', label: 'Source map', hint: 'Mapped roads, footprints, doors and visit points' },
  { id: 'rooms', label: 'Store rooms', hint: 'Interior pockets (blue) and fixtures (orange)' },
  { id: 'flight', label: 'Flight clearance', hint: 'Roof limits the bubble stays above' },
  { id: 'navigation', label: 'Jev routes & sensing', hint: 'Cyan route; green clear probes; red blocked probes, including momentum' },
  { id: 'skeletons', label: 'Skeletons', hint: 'Bones of people within 40 m' },
  { id: 'wireframe', label: 'Wireframe scene', hint: 'Every mesh as polygons' },
  { id: 'xray', label: 'X-ray overlays', hint: 'Draw overlays through walls and floors' },
  { id: 'inspector', label: 'Polygon inspector', hint: 'Click a surface to inspect its mesh' },
];
const STORAGE_KEY = 'river-oaks-debug';
const LOCAL_RADIUS = 24;
const COLORS = { collider: '#ff4d4d', ground: '#39d0ff', road: '#ffd84a', centre: '#fff6c9', footprint: '#ff5fd2', store: '#4ff0d2', room: '#5b8cff', obstacle: '#ffa53d', roof: '#ff8a3d', select: '#ffe14d', face: '#ff3df2' };

const readSaved = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; } };
const save = value => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* private window */ } };
const fmt = (value, digits = 2) => Number.isFinite(value) ? value.toFixed(digits) : '–';

export function createDebugTools({ scene, camera, host, renderer, getWorld, getEnvironment = () => null, getFocus = () => null, getNavigation = () => null }) {
  const root = new THREE.Group(); root.name = 'Debug overlays'; root.renderOrder = 10; scene.add(root);
  // Overlays must never shade the scene: keep them out of the ambient-occlusion geometry pass.
  root.userData.aoExclude = true;
  const saved = readSaved();
  const state = Object.fromEntries(DEBUG_LAYERS.map(layer => [layer.id, Boolean(saved.layers?.[layer.id])]));
  const overlays = new Map(), wireframed = new Map();
  let world = null, fallbackEnvironment = null, localCentre = null, lastLocal = 0, lastSkeletons = 0, lastWireframe = 0, lastStats = 0, lastNavigation = 0;
  let selection = null, cursor = null, open = Boolean(saved.open), counts = {};

  const panel = document.createElement('section');
  panel.className = 'debug-panel'; panel.setAttribute('aria-label', 'Debug tools'); panel.hidden = !open;
  panel.innerHTML = `<header><strong>Debug</strong><span>F3</span><button type="button" data-debug-close aria-label="Close debug tools">×</button></header>
    <fieldset>${DEBUG_LAYERS.map(layer => `<label title="${layer.hint}"><input type="checkbox" data-debug-layer="${layer.id}"> ${layer.label}</label>`).join('')}</fieldset>
    <dl class="debug-readout" data-debug-cursor><dt>Cursor</dt><dd>Move over the scene</dd></dl>
    <button type="button" data-debug-copy>Copy placement coordinates</button><p data-debug-copy-status role="status"></p>
    <dl class="debug-readout" data-debug-selection hidden></dl>
    <details data-debug-heavy><summary>Heaviest meshes</summary><ol></ol></details>
    <p class="debug-stats" data-debug-stats></p>`;
  // Outside the canvas host so drag-to-look and click-to-talk never see panel input.
  document.body.append(panel);
  for (const type of ['pointerdown', 'pointerup', 'click', 'wheel']) panel.addEventListener(type, event => event.stopPropagation());
  const $ = selector => panel.querySelector(selector);
  for (const input of panel.querySelectorAll('[data-debug-layer]')) {
    input.checked = state[input.dataset.debugLayer];
    input.addEventListener('change', () => set(input.dataset.debugLayer, input.checked));
  }
  $('[data-debug-close]').addEventListener('click', () => toggle(false));
  $('[data-debug-heavy]').addEventListener('toggle', () => renderHeavy());
  $('[data-debug-copy]').addEventListener('click', async () => {
    const status=$('[data-debug-copy-status]');
    if(!cursor){status.textContent='Point at the ground first.';return;}
    const value=JSON.stringify(placementCoordinate(environment(),cursor.x,cursor.z));
    try{await navigator.clipboard.writeText(value);status.textContent='Copied '+value;}
    catch{status.textContent=value;}
  });

  const environment = () => getEnvironment() ?? (fallbackEnvironment?.world === world ? fallbackEnvironment.value : (fallbackEnvironment = { world, value: createWalkingEnvironment(world) }).value);
  const groundAt = (x, z) => environment().groundAt(x, z);
  const terrainAt = (x, z) => terrainHeight(world.terrain, x, -z);
  const persist = () => save({ open, layers: state });

  // Markers that must always read on top (cursor, selection, bones) keep depthTest off whatever X-ray says.
  const onTop = material => { material.depthTest = false; material.userData.alwaysOnTop = true; return material; };
  const lineMaterial = (color, opacity = 0.95) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: !state.xray, depthWrite: false });
  const lines = (positions, color, name, opacity) => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const object = new THREE.LineSegments(geometry, lineMaterial(color, opacity)); object.name = name; object.frustumCulled = false; object.renderOrder = 10;
    return object;
  };
  const group = (name, ...children) => { const item = new THREE.Group(); item.name = name; item.add(...children.filter(Boolean)); return item; };
  const dispose = object => object?.traverse(item => { item.geometry?.dispose(); [item.material].flat().forEach(material => material?.dispose()); });
  const replace = (id, object) => { const old = overlays.get(id); if (old) { old.removeFromParent(); dispose(old); } if (object) { root.add(object); overlays.set(id, object); } else overlays.delete(id); };

  const builders = {
    navigation() {
      const nav=getNavigation(),route=[],clear=[],blocked=[];
      if(!nav)return group('Jev navigation');
      let from=nav.position;
      for(const p of nav.route?.path?.length?nav.route.path:nav.route?.target?[nav.route.target]:[]) {
        const to=[p[0],groundAt(p[0],-p[1])+.15,-p[1]];route.push(...from,...to);from=to;
      }
      if(nav.sensing){
        route.push(...nav.sensing.origin,...nav.sensing.target);
        for(const ray of nav.sensing.rays)(ray.clear?clear:blocked).push(...nav.sensing.origin,...ray.end);
      }
      counts.navigationProbes=nav.sensing?.rays.length??0;
      return group('Jev navigation',lines(route,'#39d0ff','Jev route'),lines(clear,'#4ee37a','Clear sensing'),lines(blocked,'#ff4d4d','Blocked sensing'));
    },
    colliders() {
      const rings = (world.collisionPolygons ?? []).map(ringToScene);
      const walls = new THREE.BufferGeometry(); walls.setAttribute('position', new THREE.Float32BufferAttribute(colliderWalls(rings, groundAt, 3), 3));
      const wallMesh = new THREE.Mesh(walls, new THREE.MeshBasicMaterial({ color: COLORS.collider, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthTest: !state.xray, depthWrite: false }));
      wallMesh.frustumCulled = false; wallMesh.renderOrder = 10;
      counts.colliders = rings.length;
      return group('Colliders', wallMesh, lines(colliderSegments(rings, groundAt, 3), COLORS.collider, 'Collider outlines'));
    },
    source() {
      const { centre, edges } = roadSegments(world.roads ?? [], (x, z) => terrainAt(x, z) + 0.35);
      const footprints = (world.buildings ?? []).filter(b => b.ring?.length).flatMap(b => ringSegments(ringToScene(b.ring), (x, z) => terrainAt(x, z) + 0.3));
      counts.roads = world.roads?.length ?? 0; counts.footprints = (world.buildings ?? []).length; counts.stores = world.stores?.length ?? 0;
      return group('Source map', lines(centre, COLORS.centre, 'Road centrelines', 0.8), lines(edges, COLORS.road, 'Road edges'),
        lines(footprints, COLORS.footprint, 'Building footprints'), lines(storeMarkers(world.stores ?? [], groundAt), COLORS.store, 'Doors and visit points'));
    },
    rooms() {
      const items = roomRings(storeRoomsFor(world));
      counts.rooms = items.filter(item => item.kind === 'room').length;
      const draw = kind => items.filter(item => item.kind === kind).flatMap(item => ringSegments(item.ring, () => item.y));
      return group('Store rooms', lines(draw('room'), COLORS.room, 'Room footprints'), lines(draw('obstacle'), COLORS.obstacle, 'Room fixtures'));
    },
    flight() {
      const roofs = roofRings(world, terrainAt);
      return group('Flight clearance', lines(roofs.flatMap(roof => ringSegments(roof.ring, () => roof.top)), COLORS.roof, 'Roof clearance', 0.8));
    },
    walkable() {
      const [cx, cz] = localCentre;
      const grid = walkableSamples(environment(), cx, cz, LOCAL_RADIUS, 0.5);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(grid.positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(grid.colors, 3));
      const cloud = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true, depthTest: !state.xray, depthWrite: false, transparent: true, opacity: 0.85 }));
      cloud.name = 'Walkable samples'; cloud.frustumCulled = false; cloud.renderOrder = 10;
      counts.free = grid.free; counts.blocked = grid.blocked;
      return cloud;
    },
    ground() {
      const [cx, cz] = localCentre, positions = [];
      const triangles = groundSurfaceTriangles(world, cx, cz, LOCAL_RADIUS);
      for (const [a, b, c] of triangles) positions.push(...a, ...b, ...b, ...c, ...c, ...a);
      for (let i = 1; i < positions.length; i += 3) positions[i] += 0.02;
      counts.groundTriangles = triangles.length;
      return lines(positions, COLORS.ground, 'Ground triangles', 0.7);
    },
    skeletons() {
      const [cx, cz] = localCentre ?? [camera.position.x, camera.position.z], seen = new Set(), helpers = [];
      scene.traverseVisible(object => {
        if (!object.isSkinnedMesh || object === root) return;
        const owner = object.skeleton.bones[0]?.parent ?? object.parent;
        if (!owner || seen.has(owner)) return;
        const at = owner.getWorldPosition(new THREE.Vector3());
        if (Math.hypot(at.x - cx, at.z - cz) > 40) return;
        seen.add(owner);
        const helper = new THREE.SkeletonHelper(owner); onTop(helper.material); helper.material.transparent = true; helper.renderOrder = 11;
        helpers.push(helper);
      });
      counts.skeletons = helpers.length;
      return group('Skeletons', ...helpers);
    },
  };
  const LOCAL = new Set(['walkable', 'ground']);

  function rebuild(id) {
    if (!world || !state[id] || !builders[id]) return replace(id, null);
    if ((LOCAL.has(id) || id === 'skeletons') && !localCentre) localCentre = focusPoint();
    replace(id, builders[id]());
  }
  function focusPoint() {
    const focus = getFocus();
    return focus ? [focus[0], focus[1]] : [camera.position.x, camera.position.z];
  }

  function applyWireframe(on) {
    if (!on) { for (const [material, value] of wireframed) material.wireframe = value; wireframed.clear(); return; }
    scene.traverse(object => {
      if (!object.isMesh || isOverlay(object)) return;
      for (const material of [object.material].flat()) if (material && 'wireframe' in material && !wireframed.has(material)) { wireframed.set(material, material.wireframe); material.wireframe = true; }
    });
  }
  const isOverlay = object => { for (let node = object; node; node = node.parent) if (node === root) return true; return false; };
  const visibleChain = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true; };

  function set(id, on) {
    state[id] = on; persist();
    const input = panel.querySelector(`[data-debug-layer="${id}"]`); if (input) input.checked = on;
    if (id === 'wireframe') return applyWireframe(on);
    if (id === 'xray') { root.traverse(item => [item.material].flat().forEach(material => { if (material && !material.userData.alwaysOnTop) { material.depthTest = !on; material.needsUpdate = true; } })); return; }
    if (id === 'inspector') { host.classList.toggle('debug-inspecting', on); if (!on) select(null); return; }
    rebuild(id);
  }

  function toggle(value = !open) {
    open = value; panel.hidden = !open; persist();
    root.visible = open;
    if (open) { for (const layer of DEBUG_LAYERS) if (state[layer.id] && builders[layer.id]) rebuild(layer.id); if (state.wireframe) applyWireframe(true); host.classList.toggle('debug-inspecting', state.inspector); }
    else { applyWireframe(false); host.classList.remove('debug-inspecting'); }
    return open;
  }

  // Polygon inspector: the picked mesh as wireframe, its bounds and the face under the cursor.
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function pick(event) {
    const rect = host.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const targets = scene.children.filter(child => child !== root && child.visible);
    return raycaster.intersectObjects(targets, true).find(hit => hit.object.isMesh && visibleChain(hit.object) && !isOverlay(hit.object)) ?? null;
  }
  function select(hit) {
    replace('selection', null);
    selection = hit ? { object: hit.object, instanceId: hit.instanceId ?? null, face: hit.face, point: hit.point.clone(), faceIndex: hit.faceIndex } : null;
    const box = $('[data-debug-selection]');
    if (!selection) { box.hidden = true; return; }
    const { object, instanceId } = selection, info = describeObject(object, instanceId);
    const matrix = object.matrixWorld.clone();
    if (object.isInstancedMesh && instanceId !== null) { const instance = new THREE.Matrix4(); object.getMatrixAt(instanceId, instance); matrix.multiply(instance); }
    const parts = [];
    if (!object.isSkinnedMesh && info.triangles <= 250000) {
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(object.geometry), lineMaterial(COLORS.select, 0.6));
      wire.matrixAutoUpdate = false; wire.matrix.copy(matrix); wire.name = 'Selection wireframe'; parts.push(wire);
    }
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox.clone().applyMatrix4(matrix);
    const boxHelper = new THREE.Box3Helper(bounds, COLORS.select); onTop(boxHelper.material); parts.push(boxHelper);
    let faceText = '–';
    if (selection.face && object.geometry.attributes.position) {
      const position = object.geometry.attributes.position, { a, b, c } = selection.face;
      const corners = [a, b, c].map(index => new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(matrix));
      // Outline plus normal arrow: a filled face would also darken the scene's ambient occlusion.
      const outline = lines([0, 1, 1, 2, 2, 0].flatMap(i => corners[i].toArray()), COLORS.face, 'Selection face');
      onTop(outline.material); outline.renderOrder = 12; parts.push(outline);
      const normal = selection.face.normal.clone().transformDirection(matrix);
      const centre = corners[0].clone().add(corners[1]).add(corners[2]).divideScalar(3);
      const arrow = new THREE.ArrowHelper(normal, centre, 1.2, COLORS.face, 0.3, 0.15); arrow.name = 'Selection normal';
      arrow.traverse(item => { if (item.material) { onTop(item.material); item.renderOrder = 12; } }); parts.push(arrow);
      const area = new THREE.Triangle(...corners).getArea();
      faceText = `#${selection.faceIndex} · normal ${fmt(normal.x)} ${fmt(normal.y)} ${fmt(normal.z)}`;
      faceText += ` · ${fmt(area)} m²`;
    }
    replace('selection', group('Selection', ...parts));
    const size = bounds.getSize(new THREE.Vector3());
    box.hidden = false;
    // Object and material names come from loaded models and creator regions, so
    // they are written as text, never parsed as markup.
    fillTermList(box, [
      ['Selected', info.path, info.path],
      ['Type', `${info.type}${info.skinned ? ' (skinned)' : ''}${instanceId !== null ? ` · instance ${instanceId} of ${info.instances}` : ''}`],
      ['Polygons', `${info.triangles.toLocaleString()} tris · ${info.vertices.toLocaleString()} verts${info.instances > 1 ? ` · ${info.drawnTriangles.toLocaleString()} drawn` : ''}`],
      ['Materials', info.materials.join(', ') || '–'],
      ['Bounds', `${fmt(size.x)} × ${fmt(size.y)} × ${fmt(size.z)} m`],
      ['Face', faceText],
      ['Hit', `E ${fmt(selection.point.x)} · N ${fmt(-selection.point.z)} · up ${fmt(selection.point.y)}`],
    ]);
  }
  // Capture phase: while inspecting, a click selects geometry instead of starting a conversation.
  const onPointerDown = event => { if (!open || !state.inspector || event.button !== 0 || !host.contains(event.target) || panel.contains(event.target)) return; event.stopPropagation(); event.preventDefault(); select(pick(event)); };
  const onClick = event => { if (open && state.inspector && !panel.contains(event.target)) { event.stopPropagation(); event.preventDefault(); } };
  host.addEventListener('pointerdown', onPointerDown, true);
  host.addEventListener('click', onClick, true);

  // Cursor readout: march the view ray over the game's own ground model.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.35, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, depthTest: false, transparent: true }));
  onTop(marker.material); marker.rotation.x = -Math.PI / 2; marker.renderOrder = 12; marker.name = 'Cursor'; marker.visible = false; root.add(marker);
  let lastMove = 0;
  const onPointerMove = event => {
    if (!open || !world || panel.contains(event.target) || event.timeStamp - lastMove < 50) return;
    lastMove = event.timeStamp;
    const rect = host.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    cursor = groundHit(raycaster.ray);
    paintCursor();
  };
  host.addEventListener('pointermove', onPointerMove);
  function groundHit(ray) {
    const env = environment(), point = new THREE.Vector3();
    let previous = 0;
    for (let t = 0.5; t < 600; t += t < 40 ? 0.5 : 2) {
      ray.at(t, point);
      if (point.y <= env.groundAt(point.x, point.z)) {
        let lo = previous, hi = t;
        for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; ray.at(mid, point); if (point.y <= env.groundAt(point.x, point.z)) hi = mid; else lo = mid; }
        ray.at(hi, point);
        const room = env.roomAt?.(point.x, point.z);
        return { x: point.x, z: point.z, ground: env.groundAt(point.x, point.z), terrain: terrainAt(point.x, point.z), free: env.isFree(point.x, point.z), room: room ? (world.stores?.find(store => store.id === room.storeId)?.name ?? room.storeId ?? 'room') : null };
      }
      previous = t;
    }
    return null;
  }
  function paintCursor() {
    const box = $('[data-debug-cursor]');
    if (!cursor) { marker.visible = false; box.innerHTML = '<dt>Cursor</dt><dd>No ground under the cursor</dd>'; return; }
    marker.visible = true; marker.position.set(cursor.x, cursor.ground + 0.03, cursor.z);
    marker.material.color.set(cursor.free ? '#4ee37a' : '#ff4d4d');
    fillTermList(box, [
      ['Cursor', `E ${fmt(cursor.x)} · N ${fmt(-cursor.z)}`],
      ['Ground', `${fmt(cursor.ground)} m (terrain ${fmt(cursor.terrain)}, ${cursor.ground - cursor.terrain >= 0 ? '+' : ''}${fmt(cursor.ground - cursor.terrain)})`],
      ['Walk', `${cursor.free ? 'free' : 'blocked'}${cursor.room ? ` · inside ${cursor.room}` : ''}`],
    ]);
    box.lastElementChild.className = cursor.free ? 'is-free' : 'is-blocked';
  }

  function renderHeavy() {
    const list = $('[data-debug-heavy] ol'); if (!$('[data-debug-heavy]').open) return;
    const rows = heaviestMeshes(scene, 12, object => !isOverlay(object) && visibleChain(object));
    list.replaceChildren(...rows.map((row, i) => {
      const item = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.textContent = `${row.drawnTriangles.toLocaleString()} · ${row.path}`; button.title = `${row.type} · ${row.materials.join(', ')} · click to inspect`;
      button.addEventListener('click', () => { const mesh = row.object; if (mesh) select({ object: mesh, point: mesh.getWorldPosition(new THREE.Vector3()), face: null, faceIndex: null }); });
      item.append(button); return item;
    }));
  }

  function update(now) {
    const current = getWorld();
    if (current !== world) {
      world = current; fallbackEnvironment = null; localCentre = null; select(null);
      if (open) for (const layer of DEBUG_LAYERS) if (state[layer.id] && builders[layer.id]) rebuild(layer.id);
    }
    if (!open || !world) return;
    const focus = focusPoint();
    if ((state.walkable || state.ground) && now - lastLocal > 250 && (!localCentre || Math.hypot(focus[0] - localCentre[0], focus[1] - localCentre[1]) > 3)) {
      localCentre = focus; lastLocal = now;
      if (state.walkable) rebuild('walkable');
      if (state.ground) rebuild('ground');
    }
    if (state.navigation && now-lastNavigation>120) {lastNavigation=now;rebuild('navigation');}
    if (state.skeletons && now - lastSkeletons > 2000) { lastSkeletons = now; localCentre ??= focus; rebuild('skeletons'); }
    if (state.wireframe && now - lastWireframe > 2000) { lastWireframe = now; applyWireframe(true); }
    if (now - lastStats > 500) {
      lastStats = now;
      const info = renderer?.info, parts = [];
      if (info) parts.push(`${info.render.calls} calls`, `${info.render.triangles.toLocaleString()} tris`, `${info.memory.geometries} geometries`);
      if (state.colliders) parts.push(`${counts.colliders} colliders`);
      if (state.walkable) parts.push(`${counts.free} free / ${counts.blocked} blocked`);
      if (state.ground) parts.push(`${counts.groundTriangles} ground tris`);
      if (state.rooms) parts.push(`${counts.rooms} rooms`);
      if (state.skeletons) parts.push(`${counts.skeletons} skeletons`);
      $('[data-debug-stats]').textContent = parts.join(' · ');
      renderHeavy();
    }
  }

  toggle(open);
  return {
    panel, root, update, toggle, set, select,
    get open() { return open; },
    get state() { return { ...state }; },
    get counts() { return { ...counts }; },
    get cursor() { return cursor; },
    get selection() { return selection && describeObject(selection.object, selection.instanceId); },
    pickAt(clientX, clientY) { const hit = pick({ clientX, clientY }); select(hit); return this.selection; },
    dispose() {
      applyWireframe(false); for (const id of [...overlays.keys()]) replace(id, null);
      host.removeEventListener('pointerdown', onPointerDown, true); host.removeEventListener('click', onClick, true); host.removeEventListener('pointermove', onPointerMove);
      dispose(marker); root.removeFromParent(); panel.remove(); host.classList.remove('debug-inspecting');
    },
  };
}
