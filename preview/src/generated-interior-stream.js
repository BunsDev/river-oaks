import * as THREE from 'three';
import { buildStoreInteriors } from './store-interiors.js';

const PREPARE_RADIUS = 14;
const EVICT_RADIUS = 36;
const EVICT_DELAY_MS = 12000;

function previewShell(room) {
  const group = new THREE.Group(); group.name = `Ready shell ${room.planId}`;
  group.position.set(room.facade[0], room.floor, -room.facade[1]);
  group.rotation.y = Math.atan2(room.outward[0], -room.outward[1]);
  const floor = new THREE.MeshStandardMaterial({ color: '#c9c8c4', roughness: 0.9 });
  const wall = new THREE.MeshStandardMaterial({ color: '#e5dfd4', roughness: 0.95 });
  const box = (material, a, d, y, w, h, length) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, length), material);
    mesh.position.set(a, y, -d); mesh.receiveShadow = true; group.add(mesh);
  };
  const front = room.frontInset, length = room.depth - front, mid = (room.depth + front) / 2;
  box(floor, room.center, mid, 0, room.width, 0.05, length);
  if ((room.generatedPlan?.index ?? 0) === 0) box(floor, 0, front / 2, 0, 1.7, 0.05, front);
  box(wall, room.center, room.depth - 0.07, room.height / 2, room.width, room.height, 0.14);
  for (const a of [room.aMin + 0.07, room.aMax - 0.07]) box(wall, a, mid, room.height / 2, 0.14, room.height, length);
  group.userData.dispose = () => {
    group.traverse(item => { item.geometry?.dispose(); item.material?.dispose(); });
  };
  return group;
}

/** Keep collision-ready shells present, prepare finished geometry near the visitor, then evict it. */
export function createGeneratedInteriorStream(rooms, parent, {
  build = room => buildStoreInteriors([room]),
  schedule = callback => setTimeout(callback, 0),
  cancel = handle => clearTimeout(handle),
} = {}) {
  const entries = rooms.map(room => {
    const shell = previewShell(room); parent.add(shell);
    return { room, shell, detail: null, pending: null, farSince: null, retryAt: 0 };
  });
  let disposed = false;
  const removeDetail = entry => {
    if (!entry.detail) return;
    parent.remove(entry.detail);
    entry.detail.userData.dispose?.();
    entry.detail = null; entry.shell.visible = true;
  };
  return {
    update(position, now, activeLevelId = null) {
      if (disposed || !position) return;
      const current = entries.find(entry => entry.room.planId === activeLevelId);
      for (const entry of entries) {
        const [east, north] = entry.room.facade;
        const distance2 = (position.x - east) ** 2 + (position.z + north) ** 2;
        const sameBuilding = current?.room.buildingId && current.room.buildingId === entry.room.buildingId;
        const eligible = sameBuilding
          ? entry === current || current.room.generatedPlan?.portals?.some(portal => portal.toLevelId === entry.room.planId)
          : (entry.room.generatedPlan?.index ?? 0) === 0;
        if (eligible && distance2 <= PREPARE_RADIUS ** 2) {
          entry.farSince = null;
          if (entry.detail || entry.pending !== null || now < entry.retryAt) continue;
          entry.pending = schedule(() => {
            entry.pending = null;
            if (disposed) return;
            let detail;
            try { detail = build(entry.room); }
            catch { entry.retryAt = now + 5000; return; }
            if (disposed) { detail.userData.dispose?.(); return; }
            entry.detail = detail; parent.add(detail); entry.shell.visible = false;
          });
        } else if (!eligible || distance2 >= EVICT_RADIUS ** 2) {
          if (entry.pending !== null) { cancel(entry.pending); entry.pending = null; }
          entry.farSince ??= now;
          if (now - entry.farSince >= EVICT_DELAY_MS) removeDetail(entry);
        } else entry.farSince = null;
      }
    },
    get lightPositions() { return entries.flatMap(entry => entry.detail?.userData.lightPositions ?? []); },
    readyFor(levelId) { return entries.some(entry => entry.room.planId === levelId && Boolean(entry.detail)); },
    debug() { return entries.map(entry => ({ levelId: entry.room.planId, ready: Boolean(entry.detail),
      pending: entry.pending !== null, shellVisible: entry.shell.visible })); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries) {
        if (entry.pending !== null) cancel(entry.pending);
        removeDetail(entry); parent.remove(entry.shell); entry.shell.userData.dispose();
      }
    },
  };
}
