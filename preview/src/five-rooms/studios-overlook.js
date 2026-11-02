// Studios + Overlook (#839): the Gardens E2 threshold (P2) and the three public roof decks. It
// retires no tenant and builds no massing in the parcel: two chrome jet-bridge hoops frame the
// threshold under an ivory saucer with a pink rim, and an Overlook lantern stands on each deck
// (the landmark pink light at night). Roof form: saucer. Entrance: twin hoops, open. Glazing:
// none; an open threshold.
import * as THREE from 'three';
import { campusSurfacesAt, campusToScene } from '../../../shared/garden-campus-layout.js';
import { columnGeometry, hoopGeometry, ringGeometry, saucerGeometry } from '../jet-age-forms.js';
import { capsulePlate, placeLocal } from './shells.js';

export const STUDIOS_OVERLOOK_FORM = Object.freeze({ roof: 'saucer on twin hoops', entrance: 'open twin hoops', glazing: 'open threshold' });
export const OVERLOOK_LANTERN = Object.freeze({ globe: 0.22, cap: 0.36, stem: 0.25 });

export function buildStudiosOverlook(kit, frame) {
  kit.begin(frame.venue, frame, STUDIOS_OVERLOOK_FORM);
  const { x0, x1, depth, front } = frame, width = x1 - x0 - 0.2, legHeight = 3.2, crownRise = 0.9, mid = (x0 + x1) / 2;
  // Hoops just inside the threshold's front and back edges; the legs stand inside its width.
  for (const z of [front - 0.3, front - depth + 0.3]) kit.add('chrome', placeLocal(hoopGeometry({ width, legHeight, crownRise, segments: 16 }, 0.09, 8), mid, 0, z));
  // The saucer rests on the hoop crowns, stretched to the threshold's plan.
  const saucer = saucerGeometry({ radius: 1, rim: 0.06, dome: 0.18, belly: 0.08 }, 48), zc = front - depth / 2, y = legHeight + crownRise + 0.05;
  saucer.scale(width / 2, 1.4, depth / 2 - 0.05);
  kit.add('ivory', placeLocal(saucer, mid, y, zc));
  const rim = ringGeometry(1, 0.035, 6, 48);
  rim.scale(width / 2 + 0.01, 1, depth / 2 - 0.04);
  kit.add('pink', placeLocal(rim, mid, y + 0.08 * 1.4 + 0.03, zc));
  const sign = frame.attachments.get('sign');
  if (sign) {
    const [x, h, z] = frame.toLocal(sign.position), w = 1.0, clamped = Math.max(x0 + w / 2 + 0.1, Math.min(x1 - w / 2 - 0.1, x));
    kit.add('pink', capsulePlate(clamped, h, w, 0.4, z + 0.12, z + 0.18));
  }
  for (const [id, lantern] of frame.attachments) if (lantern.role === 'lantern') overlookLantern(kit, id, lantern);
}

// A lantern on the roof deck under its campus-frame anchor: a chrome column from the deck up to
// the lit globe, an ivory saucer cap above it. The anchor is the globe's centre.
function overlookLantern(kit, id, lantern) {
  if (lantern.frame !== 'campus') throw new Error(`five rooms: ${id} is not in the campus frame`);
  const [u, v, z] = lantern.position, decks = campusSurfacesAt(u, v).filter(surface => surface.z < z);
  if (!decks.length) throw new Error(`five rooms: ${id} has no deck under it`);
  const deck = decks.at(-1).z, [x, y, sz] = campusToScene([u, v, z]), [, ground] = campusToScene([u, v, deck]), L = OVERLOOK_LANTERN;
  const column = columnGeometry({ height: y - L.globe - ground, foot: 0.07, head: 0.09, capital: 0.03 }, 12);
  kit.add('chrome', placeLocal(column, x, ground, sz), { scene: true });
  kit.add('glow-landmark', placeLocal(new THREE.SphereGeometry(L.globe, 16, 12), x, y, sz), { scene: true });
  kit.add('ivory', placeLocal(saucerGeometry({ radius: L.cap, rim: 0.03, dome: 0.08, belly: 0.03 }, 24), x, y + L.globe - 0.02, sz), { scene: true });
}
