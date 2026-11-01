// Kit finishes for the Gardens campus (#741 under #738): the shared city-kit finish names
// (shared/city-kit/catalog.js KIT_FINISHES) mapped onto the campus's own material tables.
//
// Not the #511 "finish pass" (garden-campus-finish.js FINISH), which places geometry. A kit
// finish is render-only: it replaces colour, roughness and metalness fields of materials the
// campus already builds. It never adds, moves or removes a part, so every instance, level,
// suite and bridge ID, support, clearance, collision rect and lease is the same under each
// finish. The one exception is `forms` (Pink Jet-Age), which reshapes parts inside the same
// contract envelopes (garden-campus-jet-age.js) and still moves no surface, rect or ID. `classic` is the default and changes nothing; the client opts in with
// render-quality.js readFinishPreference (`?finish=pink-jet-age` or localStorage).
//
// The palette comes from its own dependency-free module (catalog.js re-exports it), so the kit
// catalog stays out of the main bundle: the campus is built with the district, eagerly.
import { PINK_JET_AGE as P } from '../../shared/city-kit/pink-jet-age.js';

// Each finish names, per table, the fields it replaces on a material key. Keys a finish leaves
// out keep their classic spec (the lawn and paving stay the district's own ground, the water,
// soil and luminaires stay as they are, and the desk screens stay one dark neutral so nothing
// private ever reads on them).
export const CAMPUS_KIT_FINISHES = Object.freeze({
  classic: Object.freeze({ label: 'Classic', campus: Object.freeze({}), trim: null, emerald: Object.freeze({}), fitout: Object.freeze({}), ceiling: Object.freeze({}), forms: null }),
  'pink-jet-age': Object.freeze({
    label: 'Pink Jet-Age',
    // garden-campus.js materials. Ivory shells and bands, mint glass, satin chrome hardware.
    campus: Object.freeze({
      slab: { color: P.ivory }, // the floor bands at every slab edge and the skywalk decks
      stone: { color: P.ivory }, // slab bands, plinths, parapets, headhouses, roof and bridge floors
      core: { color: '#eadbd0' }, // lift and stair shafts: a warm shaded ivory behind the glass, never a pink field
      // Mullions, fins, jambs, caps and troughs: restrained satin chrome. White here so the
      // per-instance trim colours below are exact (instance colour multiplies the material's).
      bronze: { color: '#ffffff', metalness: 0.35, roughness: 0.35 },
      timber: { color: '#e8d9cc' }, // soffits, canopies, decks, pergola and bench tops: pale sand
      // Mint glass lifted almost to white, as classic lifts its pink: same opacity, same
      // see-through floors, so a pane reads as glass exactly where it did before.
      glass: { color: '#e3f3ef' },
      guard: { color: '#f1faf8' },
      planting: { color: P.garden },
      interior: { color: '#efe7dd' },
      partition: { color: P.ivory },
      // Suite doors are the readable pink accent along each gallery.
      door: { color: P.pink, roughness: 0.5 },
    }),
    // The hardware batch splits by instance colour: rails (skywalk edges, terrace guards), parapet
    // copings, entrance-canopy edges and the café fascia take TypeSafe pink; everything else in
    // that batch (mullions, fins, door jambs, headhouse caps, troughs, furniture legs) is chrome.
    trim: Object.freeze({ body: P.chrome, accent: P.pink }),
    // The emerald-cut panes' uniforms only (garden-campus.js applyEmeraldCut): collet chrome, the
    // lip and warmth ivory, the downward facets a breath of pink. The shader source is unchanged.
    emerald: Object.freeze({ bronze: P.chrome, champagne: P.ivory, blush: P.pink }),
    // garden-campus-fitout-render.js materials.
    fitout: Object.freeze({
      walnut: { color: '#dccbb9' }, oak: { color: '#eadfd2' }, frame: { color: P.chrome },
      fabric: { color: '#f2c4cf' }, stone: { color: P.ivory },
    }),
    // garden-campus-ceilings.js: an ivory plaster with the same faint bounce.
    ceiling: Object.freeze({ color: P.ivory, emissive: P.ivory }),
    // Jet-Age architecture (garden-campus-jet-age.js): the shapes, not only the colours. Saucer
    // crowns, rounded headhouses, boomerang canopies, skywalk hoops, a vaulted pergola, hall
    // starbursts and ring lights, and bullnosed slab bands, in these three roles.
    forms: Object.freeze({ ivory: P.ivory, chrome: P.chrome, pink: P.pink }),
  }),
});

/** The campus finish name for an untrusted preference: unknown or malformed is classic. */
export const campusKitFinishName = name => typeof name === 'string' && Object.hasOwn(CAMPUS_KIT_FINISHES, name) ? name : 'classic';

/** The finish spec for an untrusted preference; never throws. */
export const campusKitFinish = name => CAMPUS_KIT_FINISHES[campusKitFinishName(name)];

/** Replace a material's listed fields (colour and emissive as colours, numbers as numbers). */
export function applyKitFields(material, fields = {}) {
  for (const [key, value] of Object.entries(fields)) {
    if (material[key]?.isColor) material[key].set(value);
    else material[key] = value;
  }
  return material;
}
