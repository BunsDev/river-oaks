// Kit finishes for World Studio's furnished spaces (#744 under #738): the shared city-kit
// finish names (shared/city-kit/catalog.js KIT_FINISHES) mapped onto the finish catalog
// space-scene.js draws documents with, as the District, Gardens, IPIC and office tables do.
//
// Render-only, document-free and editor-only. A space document names a finish per object
// ('oak', 'fabric', 'brass' …); a kit finish changes only what a few of those names look like in
// the Studio viewport, never the document, so every saved v1 file, template, object ID,
// dimension, placement override, route profile, collision polygon and editing control is
// identical under every finish, and a file saved under one finish opens the same under another.
//
// space-scene.js itself is never changed: it is a reviewed asset of every approved space
// (approved-spaces.js pins its digest), and an approved space in town draws exactly as Val
// approved it, under any finish. The finish is a pass over a built Studio scene instead: it
// recolours each material still showing a listed classic catalog entry (`from`, the
// space-scene.js FINISHES values) to the finish's entry. Floors, glass, special materials, the
// arrival marker and the lighting presets (SPACE_LIGHT) are not part of a finish. `classic` is
// the default and changes nothing. The studio opts in with render-quality.js
// readFinishPreference (`?finish=pink-jet-age` on studio.html, or the stored choice).
import * as THREE from 'three';
import { PINK_JET_AGE as P } from '../../../shared/city-kit/pink-jet-age.js';

const freeze = value => Object.freeze(value);

/** The classic catalog entries a finish may replace, [colour, roughness, metalness], as space-scene.js draws them. */
export const SPACE_CLASSIC_FINISHES = freeze({
  plaster: freeze(['#e5dfd2', 0.92, 0]), brass: freeze(['#bda36d', 0.28, 0.82]), fabric: freeze(['#e6d8bd', 1, 0]),
});

export const SPACE_KIT_FINISHES = freeze({
  classic: freeze({ label: 'Classic', finishes: freeze({}) }),
  'pink-jet-age': freeze({
    label: 'Pink Jet-Age',
    // Names left out keep their classic entry: oak and walnut, limestone, concrete and terracotta,
    // sage, linen, white and charcoal (the frames, appliances and shadow gaps stay dark technology).
    finishes: freeze({
      plaster: freeze([P.ivory, 0.92, 0]), // walls: warm ivory
      brass: freeze([P.chrome, 0.3, 0.5]), // pulls, pendants, taps, dials: satin chrome
      fabric: freeze(['#f2cfd6', 1, 0]), // the default upholstery and rugs: a pale rose; sage, linen and terracotta textiles stay
    }),
  }),
});

/** The space finish name for an untrusted preference: unknown or malformed is classic. */
export const spaceKitFinishName = name => typeof name === 'string' && Object.hasOwn(SPACE_KIT_FINISHES, name) ? name : 'classic';

/** The finish spec for an untrusted preference; never throws. */
export const spaceKitFinish = name => SPACE_KIT_FINISHES[spaceKitFinishName(name)];

const near = (a, b) => Math.abs(a - b) < 1e-6;
/**
 * Applies a kit finish to a built Studio space scene (space-scene.js createSpaceScene) in place.
 * A material changes only if it still shows a listed classic entry exactly: a plain material by
 * colour, roughness and metalness; a textile (sheen) by colour, keeping its weave and taking a
 * highlight from its new colour as space-scene.js derives it. Returns the group.
 */
export function applySpaceKitFinish(group, finish) {
  const name = spaceKitFinishName(finish), entries = Object.entries(spaceKitFinish(name).finishes);
  group.userData.kitFinish = name;
  if (!entries.length) return group;
  const from = entries.map(([key, to]) => ({ color: new THREE.Color(SPACE_CLASSIC_FINISHES[key][0]), roughness: SPACE_CLASSIC_FINISHES[key][1], metalness: SPACE_CLASSIC_FINISHES[key][2], to }));
  const seen = new Set();
  group.traverse(node => {
    if (!node.isMesh) return;
    for (const material of [node.material].flat()) {
      if (!material?.color || seen.has(material)) continue;
      seen.add(material);
      const textile = material.sheen > 0;
      const match = from.find(entry => material.color.equals(entry.color) && (textile || (near(material.roughness, entry.roughness) && near(material.metalness, entry.metalness))));
      if (!match) continue;
      const [color, roughness, metalness] = match.to;
      material.color.set(color);
      if (textile) material.sheenColor?.copy(material.color).lerp(new THREE.Color('#ffffff'), 0.4);
      else Object.assign(material, { roughness, metalness });
    }
  });
  return group;
}
