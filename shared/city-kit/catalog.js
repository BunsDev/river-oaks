// The streetscape and architecture kit (#584). Every neighborhood assembled by
// assemble.js places these pieces; the browser renderer (preview/src/city-kit/)
// and authoritative movement read the same placed pieces. Dimensions are metres,
// east/north/up, authored for this project (original geometry, not surveyed or
// copied facades). Houston references inform patterns only: short brick storefront
// rows with canopies (the Heights' 19th Street), shaded garden courts (Montrose),
// bayou greenways and elevated water towers as wayfinding landmarks.
export const KIT_VERSION = 'city-kit-1';

export const KIT_CONVENTIONS = Object.freeze({
  units: 'metres; site-local x east of the site anchor, y north of it; z up',
  module: 0.5,
  storey: { ground: 4.6, upper: 3.5 },
  bay: { min: 4.5, max: 7.5 },
  naming: '<neighborhood>/<group>/<role>-<n>; overrides and additions address these stable IDs',
  collision: 'walkable rectangles grant ground and flight; solids inside them block bodies and low flight; building shells stand outside walkable rectangles, so their faces are the walkable edge',
  lod: { detailMetres: 120, treeMetres: [22, 60] },
  licensing: 'Original procedural geometry authored in this repository. Surfaces reuse the District PBR maps (preview/public/assets/materials/sources.json); street trees reuse the District tree models (preview/public/assets/landscape/manifest.json).',
  budgets: { trianglesPerNeighborhood: 260000, drawCallsPerNeighborhood: 70, materialsPerNeighborhood: 28, solidsPerNeighborhood: 160 },
});

// Material slots. `surface` names a District PBR set; colours tint it.
export const KIT_MATERIALS = Object.freeze({
  'paver-sidewalk': { surface: 'district-paver' },
  'lane-brick': { surface: 'brick', color: '#8f7f78', tile: 2.4 },
  'curb-granite': { surface: 'stone', color: '#b9b4aa', tile: 1.5 },
  'plaza-stone': { surface: 'pavement', color: '#d8d0c0', tile: 3 },
  // The grass PBR is a sparse, gravelly ground; a turf tint at low texture contrast
  // reads as mown lawn, as on the District's green roofs.
  lawn: { surface: 'grass', color: '#a3c286', tile: 1.8, textureContrast: .35 },
  soil: { color: '#2d281f', roughness: 1 },
  'brick-rose': { surface: 'brick', color: '#c98e88', tile: 2.2 },
  'brick-umber': { surface: 'brick', color: '#a9826e', tile: 2.2 },
  'stucco-ivory': { surface: 'stone', color: '#efe5d0', tile: 4 },
  'stucco-apricot': { surface: 'stone', color: '#e3b48c', tile: 4 },
  'trim-teal': { color: '#317b7d', roughness: .55 },
  'trim-deep-teal': { color: '#1f454a', roughness: .5 },
  'trim-mint': { color: '#a8c7b2', roughness: .6 },
  'trim-ivory': { color: '#f5eee0', roughness: .7 },
  'metal-brass': { color: '#bd9e66', roughness: .38, metalness: .8 },
  'metal-bronze': { color: '#3b352e', roughness: .45, metalness: .6 },
  'canvas-rose': { color: '#c98e92', roughness: .9 },
  'canvas-teal': { color: '#3f8c88', roughness: .9 },
  'canvas-apricot': { color: '#ddad81', roughness: .9 },
  // Storefront glass stays dark and thin so the lit shop behind it reads, not the sky.
  glass: { color: '#4a6f6b', roughness: .08, metalness: .1, glass: true },
  // Upper-storey and context glazing reflect the sky instead of showing the wall behind.
  'glass-dark': { color: '#2e5157', roughness: .07, metalness: .35, reflective: true },
  'roof-membrane': { color: '#6b6d6a', roughness: .95 },
  'wood-bench': { color: '#8a6143', roughness: .7 },
  'lamp-glow': { color: '#fff2cf', emissive: '#ffd99a', emissiveIntensity: 1.6 },
  'lantern-glass': { color: '#f6e7c4', roughness: .2, emissive: '#ffbf66', emissiveIntensity: 0, lantern: true },
  // Luxury palette, matched to the District's street vocabulary (street-furniture.js,
  // retro-palette.js): charcoal granite setts, a stone threshold, honed limestone,
  // black steel, satin bronze, and the District's deep-teal lamp metal.
  'granite-sett': { surface: 'pavement', color: '#70726f', tile: 1.8, textureContrast: .7 },
  porcelain: { color: '#f5eee0', roughness: .55 },
  // Honed ashlar: the running-bond pavement map at large-format scale reads as fine
  // stone coursing, without the weathered sandstone's mottling.
  limestone: { surface: 'pavement', color: '#f4efe6', tile: 5, textureContrast: .32 },
  travertine: { surface: 'pavement', color: '#ecdfca', tile: 4, textureContrast: .42 },
  // A warm grey stone inlay in the granite lane, close to the setts in value so it
  // reads as laid stone rather than a painted road marking.
  'inlay-limestone': { color: '#8e877c', roughness: .75 },
  'steel-black': { color: '#1b1d1f', roughness: .36, metalness: .7 },
  'bronze-satin': { color: '#7a6040', roughness: .3, metalness: .85 },
  'lamp-teal': { color: '#1f454a', roughness: .5, metalness: .65 },
  'opal-glow': { color: '#c9fff0', emissive: '#c9fff0', emissiveIntensity: 2.2, roughness: .4 },
  // TypeSafe Place (typesafe-place-1): pearl stone and warm concrete residences, rose-gold
  // metal, blush canvas, planted roofs, and the pink light the neighborhood is known by.
  'stone-pearl': { surface: 'pavement', color: '#ece6dd', tile: 5, textureContrast: .26 },
  'concrete-warm': { surface: 'stone', color: '#d3cabc', tile: 4, textureContrast: .3 },
  'rose-gold': { color: '#c48a80', roughness: .32, metalness: .85 },
  'canvas-blush': { color: '#e3a1b4', roughness: .9 },
  'glass-rail': { color: '#a9c8c9', roughness: .05, metalness: .2, glass: true },
  // Homes lit from within: a warm pane among the reflective glass.
  'glass-lit': { color: '#4d4a44', roughness: .25, emissive: '#ffb76b', emissiveIntensity: .2 },
  planting: { surface: 'grass', color: '#557f45', tile: 1.2, textureContrast: .5 },
  'neon-rose': { color: '#ff6fae', emissive: '#ff4f9a', emissiveIntensity: 1.8, roughness: .4 },
  'ribbon-rose': { color: '#e4589b', roughness: .3, metalness: .35, emissive: '#ff3f8f', emissiveIntensity: .3 },
});

// Pink Jet-Age (#738, #739): the approved optimistic retrofuturist direction. TypeSafe
// pink is fixed; the supporting roles are proposals, so they live here as named roles
// rather than replacing every token in the client.
export const PINK_JET_AGE = Object.freeze({
  pink: '#F486A1', ivory: '#F7F1E8', mintGlass: '#BFE2DE', chrome: '#BCC5C8', garden: '#4A6A55', ink: '#24242A',
});

// Finishes recolour material slots at render time. A finish never changes a plan, its
// hash, a lock, a piece ID, geometry, collision or a recipe override: it only replaces
// fields of the named slot specs. `classic` is the default and changes nothing, so a
// caller reverts by omitting the option. Slots a finish leaves out keep their spec.
const P = PINK_JET_AGE;
export const KIT_FINISHES = Object.freeze({
  classic: Object.freeze({ label: 'Classic', materials: Object.freeze({}) }),
  'pink-jet-age': Object.freeze({
    label: 'Pink Jet-Age',
    materials: Object.freeze({
      // Ivory shells: every stone and stucco wall keeps its surface and coursing.
      limestone: { color: P.ivory }, 'stucco-ivory': { color: P.ivory }, 'stucco-apricot': { color: '#f3e4d6' },
      'stone-pearl': { color: P.ivory }, 'concrete-warm': { color: '#ede3d6' }, porcelain: { color: P.ivory }, 'trim-ivory': { color: P.ivory },
      // Brick warms toward the brand rose instead of turning flat pink.
      'brick-rose': { color: '#d9a1a8' }, 'brick-umber': { color: '#b98f84' },
      // Pink leads on fascias, floor plates, sills and canopies; it never covers a whole wall.
      'trim-teal': { color: P.pink, roughness: .5 }, 'trim-deep-teal': { color: P.pink, roughness: .5 }, 'trim-mint': { color: P.pink, roughness: .5 },
      'canvas-teal': { color: P.pink }, 'canvas-rose': { color: P.pink }, 'canvas-apricot': { color: P.ivory }, 'canvas-blush': { color: P.pink },
      // Restrained chrome replaces brass and bronze accents: satin, not mirror.
      'metal-brass': { color: P.chrome, roughness: .3, metalness: .9 }, 'bronze-satin': { color: P.chrome, roughness: .3, metalness: .9 },
      'rose-gold': { color: P.chrome, roughness: .3, metalness: .9 }, 'metal-bronze': { color: '#8e979b', roughness: .38, metalness: .8 },
      // Ink, not black, for mullions, edging and lamp columns.
      'steel-black': { color: P.ink }, 'lamp-teal': { color: P.ink },
      // Mint glass. Reflective panes take a deeper mint so the sky never washes them out;
      // rails and storefront glass carry the lighter role.
      'glass-dark': { color: '#5d8f8a' }, glass: { color: '#6e9f99' }, 'glass-rail': { color: P.mintGlass },
      planting: { color: P.garden },
    }),
  }),
});

export function kitFinish(name = 'classic') {
  const finish = KIT_FINISHES[name];
  if (!finish) throw new Error(`Unknown kit finish ${name}`);
  return finish;
}

// Architectural styles choose materials and preferred variants. Distinction comes
// from massing, rhythm and frontage depth as much as colour.
export const KIT_STYLES = Object.freeze({
  'market-row': {
    wall: ['brick-rose', 'brick-umber'], trim: 'trim-teal', accent: 'metal-brass',
    storefronts: ['canopy', 'awning', 'canopy', 'recessed'], awnings: ['canvas-teal', 'canvas-rose'],
    windows: 'arched', roofs: ['parapet', 'cornice'], setback: 0, signage: 'band',
  },
  'garden-court': {
    wall: ['stucco-ivory'], trim: 'trim-mint', accent: 'metal-brass',
    storefronts: ['loggia', 'recessed', 'loggia'], awnings: ['canvas-rose'],
    windows: 'tall', roofs: ['stepped', 'parapet'], setback: 0, signage: 'blade',
  },
  // Modern luxury retail: honed limestone, full-height gallery glazing in black steel,
  // cantilevered bronze canopies with downlights, finned ribbon windows, brass letters.
  'luxe-modern': {
    wall: ['limestone'], trim: 'steel-black', accent: 'bronze-satin',
    storefronts: ['gallery'], awnings: ['canvas-teal'],
    windows: 'ribbon', roofs: ['reveal'], setback: 0, signage: 'letters', signPalette: 'noir',
  },
  // The court in honed limestone and bronze, matching Market Row: deep loggias and gallery fronts.
  'luxe-court': {
    wall: ['limestone'], trim: 'bronze-satin', accent: 'metal-brass',
    storefronts: ['loggia', 'gallery', 'loggia'], awnings: ['canvas-rose'],
    windows: 'tall', roofs: ['reveal', 'stepped'], setback: 0, signage: 'blade', signPalette: 'noir',
  },
  // TypeSafe Place: residential towers and mid-rises with a balcony slab and a glass rail on
  // every storey, gallery lobbies, and a pink light band at the crown.
  'place-tower': {
    wall: ['stone-pearl', 'concrete-warm'], trim: 'steel-black', accent: 'rose-gold',
    storefronts: ['gallery'], awnings: ['canvas-blush'],
    windows: 'balcony', roofs: ['crown'], setback: 0, signage: 'letters', signPalette: 'noir',
  },
  'place-residence': {
    wall: ['stone-pearl', 'concrete-warm'], trim: 'steel-black', accent: 'rose-gold',
    storefronts: ['gallery', 'loggia'], awnings: ['canvas-blush'],
    windows: 'balcony', roofs: ['garden'], setback: 0, signage: 'letters', signPalette: 'noir',
  },
  // Everyday retail: pearl stone shop rows with blush awnings, every roof a garden. One wall,
  // roof and awning material each keeps a row's draw calls within the kit budget.
  'place-retail': {
    wall: ['stone-pearl'], trim: 'steel-black', accent: 'rose-gold',
    storefronts: ['gallery', 'awning', 'canopy'], awnings: ['canvas-blush'],
    windows: 'ribbon', roofs: ['garden'], setback: 0, signage: 'letters', signPalette: 'noir',
  },
  'heights-row': {
    wall: ['stucco-apricot', 'brick-umber'], trim: 'trim-deep-teal', accent: 'metal-bronze',
    storefronts: ['awning', 'recessed', 'awning'], awnings: ['canvas-apricot', 'canvas-teal'],
    windows: 'paired', roofs: ['sawtooth', 'parapet'], setback: 0, signage: 'band',
  },
});

// Piece families. `collision`: surface (grants movement), solid (blocks inside a
// surface), shell (outside every surface) or none (overhead or flush detail).
// `triangles` is the authored upper bound per placed piece, checked by budgets.
export const KIT_PIECES = Object.freeze({
  'street/shared-lane': { family: 'street', collision: 'surface', material: 'lane-brick', triangles: 400 },
  'street/sidewalk': { family: 'street', collision: 'surface', material: 'paver-sidewalk', triangles: 400 },
  'street/flush-curb': { family: 'street', collision: 'none', material: 'curb-granite', triangles: 24 },
  'street/crossing-table': { family: 'street', collision: 'none', material: 'trim-ivory', triangles: 120 },
  // Generated where two streets cross: the shared lane square, striped crosswalks
  // across each lane, and sidewalk corners (street/sidewalk).
  'street/intersection': { family: 'street', collision: 'none', material: 'lane-brick', triangles: 40 },
  'street/crosswalk': { family: 'street', collision: 'none', material: 'lane-brick', triangles: 160 },
  // Flush inlays in a shared lane: stone bands (Market Street keeps only its gateway
  // threshold) and black-steel channel drains.
  'street/band': { family: 'street', collision: 'none', material: 'inlay-limestone', triangles: 16 },
  'street/channel': { family: 'street', collision: 'none', material: 'steel-black', triangles: 8 },
  'street/court': { family: 'street', collision: 'surface', material: 'plaza-stone', triangles: 200 },
  'building/shell': { family: 'building', collision: 'shell', triangles: 2400 },
  'facade/storefront': { family: 'facade', collision: 'none', variants: ['canopy', 'awning', 'recessed', 'loggia', 'gallery'], triangles: 420 },
  'facade/upper-window': { family: 'facade', collision: 'none', variants: ['arched', 'tall', 'paired', 'ribbon'], triangles: 160 },
  'roof/parapet': { family: 'roof', collision: 'none', triangles: 96 },
  'roof/cornice': { family: 'roof', collision: 'none', triangles: 120 },
  'roof/stepped': { family: 'roof', collision: 'none', triangles: 144 },
  'roof/sawtooth': { family: 'roof', collision: 'none', triangles: 220 },
  // A thin black-steel coping over a shadow reveal: no cornice.
  'roof/reveal': { family: 'roof', collision: 'none', triangles: 72 },
  // A planted roof inside the parapet: lawn, raised beds and a pergola. Nothing rises more
  // than 1.9 m above the roof, inside the 3.1 m flight margin over every roof.
  'roof/garden': { family: 'roof', collision: 'none', triangles: 420 },
  // The top two storeys set back behind terraces, under a pink light band.
  'roof/crown': { family: 'roof', collision: 'none', triangles: 360 },
  'landscape/street-tree': { family: 'landscape', collision: 'solid', footprint: [.6, .6], height: 2.5, triangles: 0 },
  'landscape/tree-pit': { family: 'landscape', collision: 'none', triangles: 40 },
  'landscape/planter': { family: 'landscape', collision: 'solid', height: .5, triangles: 60 },
  'landscape/lawn': { family: 'landscape', collision: 'none', material: 'lawn', triangles: 4 },
  'furniture/bench': { family: 'furniture', collision: 'solid', footprint: [1.9, .62], height: .85, triangles: 180 },
  'furniture/lamp': { family: 'furniture', collision: 'solid', footprint: [.3, .3], height: 4.6, triangles: 140 },
  'furniture/bollard': { family: 'furniture', collision: 'solid', footprint: [.26, .26], height: .9, triangles: 40 },
  'furniture/bike-rack': { family: 'furniture', collision: 'solid', footprint: [1.8, .3], height: .8, triangles: 120 },
  'furniture/lantern': { family: 'furniture', collision: 'solid', footprint: [.5, .5], height: 2.1, triangles: 160 },
  'furniture/cafe-set': { family: 'furniture', collision: 'solid', footprint: [1.6, 1.6], height: .76, triangles: 220 },
  // A market stall: counter, produce crates, striped canvas roof and a lettered
  // board. Its front (counter side) faces yaw's −v, like a bench's seat.
  'furniture/market-stall': { family: 'furniture', collision: 'solid', footprint: [3.6, 2.4], height: 2.8, triangles: 700 },
  'landmark/water-tower': { family: 'landmark', collision: 'solid', footprint: [7, 7], height: 27, triangles: 3200 },
  // The Neighborhood Green's public art: a looped pink ribbon on a stone plinth.
  'landmark/ribbon': { family: 'landmark', collision: 'solid', footprint: [4, 4], height: 8.6, triangles: 4200 },
  // Edges: a planted hedge stops walking; a bayou and context massing give the
  // boundary a reason and a skyline. Context massing is visual only, never ground.
  'landscape/hedge': { family: 'landscape', collision: 'solid', height: .95, triangles: 60 },
  'landscape/bayou': { family: 'landscape', collision: 'none', triangles: 200 },
  'furniture/railing': { family: 'furniture', collision: 'none', triangles: 60 },
  'building/context': { family: 'building', collision: 'none', triangles: 60 },
});

export function kitPiece(name) {
  const piece = KIT_PIECES[name];
  if (!piece) throw new Error(`Unknown kit piece ${name}`);
  return piece;
}
