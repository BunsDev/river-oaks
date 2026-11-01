// Kit finishes for Jevica's penthouse office (#744 under #738): the shared city-kit finish
// names (shared/city-kit/catalog.js KIT_FINISHES) mapped onto the materials the office already
// builds, as the District, Gardens, IPIC and workplace tables do.
//
// Render-only. A finish replaces colour, roughness and metalness fields of the furnishings'
// one-material-per-finish set (office-penthouse-furnishings.js createPenthouseFinishes) and of
// the shell's own materials (office-penthouse-graybox.js). Material names stay, so every mesh
// keeps its name, plan zone, footprint, instance count, shadow role and light; the server's
// collision and the review cameras are untouched. The per-vertex tints (walnut, boucle, blush)
// are geometry and stay as authored: the penthouse's selective pink is already there, in the
// blush seats and the one TypeSafe-pink accent, and stays under a twentieth of the surface
// under every finish. `classic` is the default and changes nothing.
//
// Privacy is unchanged by any finish: SCREEN_DYNAMIC (the idle displays) is never listed, so no
// finish can brighten, tint or texture a screen; it stays dark glass with no content (#362).
import { PINK_JET_AGE as P } from '../../shared/city-kit/pink-jet-age.js';

const freeze = value => Object.freeze(value);

export const OFFICE_KIT_FINISHES = freeze({
  classic: freeze({ label: 'Classic', materials: freeze({}), shell: freeze({}) }),
  'pink-jet-age': freeze({
    label: 'Pink Jet-Age',
    // Furnishings: office-penthouse-furnishings.js FINISHES keys. Colour-like fields are set on
    // the existing THREE.Color; numbers replace the field. Tinted finishes (wood, upholstery,
    // foliage, objects, wool, organic) keep their white base so their vertex tints stay exact.
    materials: freeze({
      bronze: { color: P.chrome, metalness: 0.5, roughness: 0.3 }, // lamps, reveals, pulls, rails: satin chrome, not champagne
      graphite: { color: '#a3abae', metalness: 0.5, roughness: 0.35 }, // chair frames, casters and display stands: brushed steel, not black
      shade: { color: '#f7f1e8' }, // lamp shades: ivory linen (the glow is unchanged)
    }),
    // Shell: office-penthouse-graybox.js material names. The travertine floors keep their stone
    // map and tone; the mezzanine slab, treads and ceiling stay as drawn.
    shell: freeze({
      bronze: { color: P.chrome, metalness: 0.5, roughness: 0.3 }, // mullions, sills, heads, guard rail, lift platform and frame
      glass: { color: '#e3f3ef' }, // the mezzanine guard and terrace rails: mint glass, same opacity
      wall: { color: P.ivory }, // the arrival core and back wall
    }),
  }),
});

/** The office finish name for an untrusted preference: unknown or malformed is classic. */
export const officeKitFinishName = name => typeof name === 'string' && Object.hasOwn(OFFICE_KIT_FINISHES, name) ? name : 'classic';

/** The finish spec for an untrusted preference; never throws. */
export const officeKitFinish = name => OFFICE_KIT_FINISHES[officeKitFinishName(name)];

/** Applies one finish table's field overrides to a material in place (colours set, numbers replaced). */
export function applyKitFinish(material, fields = {}) {
  for (const [field, value] of Object.entries(fields)) {
    if (material[field]?.isColor) material[field].set(value); else material[field] = value;
  }
  return material;
}
