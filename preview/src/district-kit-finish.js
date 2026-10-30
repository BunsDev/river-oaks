// Kit finishes for the original District (#740 under #738): the shared city-kit finish names
// (shared/city-kit/catalog.js KIT_FINISHES) mapped onto the District's generic facade kit
// (district.js buildDistrictBuildings), the street furniture (street-furniture.js) and the
// storefront benches (district.js buildDistrictDetail).
//
// Render-only, like the Gardens campus table (garden-campus-kit-finish.js). A finish replaces
// colours of materials the District already builds. Roughness, metalness and every other
// shading field stay, so each plain-colour batch keeps its finishKey (material-finish.js). It
// adds a few accent materials cloned from their base, so pink speed lines and valances draw in
// their base batch with a per-instance colour. It never adds, moves or removes a part:
// footprints, doors, routes, IDs, breakable glass and collision are identical under every
// finish. `classic` is the default and changes nothing. The client opts in with
// render-quality.js readFinishPreference (`?finish=pink-jet-age` or localStorage).
//
// Out of scope, so classic under every finish:
// - the reference-photographed frontages (reference-facades.js, reference-blocks.js,
//   harry-winston-facade.js) keep their real stores' look. So does everything the shared kit
//   draws at a reference doorway (door pulls and rails, threshold, entrance planters);
// - named-venue details: Cartier and Van Cleef gold, Le Colonial and Harry Winston navy,
//   the Steak 48 slats and the Van Cleef ceramic field;
// - storefront glass (already a pale mint thin sheet), display rooms, interiors and lights;
// - roofs, green roofs, roads, sidewalks, crossings, tactile paving, lamp glow and grates.
import { PINK_JET_AGE as P } from '../../shared/city-kit/pink-jet-age.js';
export { applyKitFields } from './garden-campus-kit-finish.js';

export const DISTRICT_KIT_FINISHES = Object.freeze({
  classic: Object.freeze({
    label: 'Classic', stone: null, facade: Object.freeze({}), keep: Object.freeze([]), accents: null, sign: null,
    street: Object.freeze({}), detail: Object.freeze({}),
  }),
  'pink-jet-age': Object.freeze({
    label: 'Pink Jet-Age',
    // The cut-stone ceramic's base colour. It is a constant in that shader, so a new colour is
    // a new program cache key; classic keeps its source and key.
    stone: P.ivory,
    // district.js facade-<name> materials: colour only.
    facade: Object.freeze({
      dark: { color: P.chrome }, // mullions, transoms, door frames and pulls, awning rods
      bronzeFrame: { color: P.chrome }, // glazing frames, heads and sills
      bulkhead: { color: P.chrome }, // the enamel fascia behind the signs and the parapet band
      upperGlass: { color: P.mintGlass }, // upper-storey windows: still opaque and reflective, never black
      reveal: { color: P.ink }, // shadow reveals and window frames
      plant: { color: P.chrome }, // rooftop plant
      canvas: { color: P.ivory }, // fabric awnings
      planter: { color: P.ivory },
      hedge: { color: P.garden },
    }),
    // Materials a reference doorway shares with the generic kit: it keeps a classic copy of each.
    keep: Object.freeze(['dark', 'bulkhead', 'planter', 'hedge']),
    // Pink stays an accent: the three speed lines over the shopfronts, the kickplates under the
    // glazing and the awning valances. Never a wall, fascia or awning field.
    accents: Object.freeze({ speedLine: P.pink, kickplate: P.pink, valance: P.pink }),
    // Generic tenant signs: ivory lettering on an ink plaque with a pink keyline.
    sign: Object.freeze({ plaque: P.ink, edge: P.pink, ink: P.ivory }),
    // street-furniture.js: lamp columns, planter bands and bins chrome; the lamps' orbital ring
    // and collar and the planter rims pink; the cast-stone planters and lamp discs ivory.
    street: Object.freeze({ bronze: { color: P.chrome }, brass: { color: P.pink }, stoneCast: { color: P.ivory } }),
    // district.js buildDistrictDetail: storefront bench frames and posts chrome, slats ivory.
    detail: Object.freeze({ bronze: { color: P.chrome }, timber: { color: P.ivory } }),
  }),
});

/** The District finish name for an untrusted preference: unknown or malformed is classic. */
export const districtKitFinishName = name => typeof name === 'string' && Object.hasOwn(DISTRICT_KIT_FINISHES, name) ? name : 'classic';

/** The finish spec for an untrusted preference; never throws. */
export const districtKitFinish = name => DISTRICT_KIT_FINISHES[districtKitFinishName(name)];
