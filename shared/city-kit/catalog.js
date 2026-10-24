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
  // retro-palette.js): charcoal granite setts, porcelain banding, honed limestone and
  // travertine, black steel, satin bronze, and the District's deep-teal lamp metal.
  'granite-sett': { surface: 'pavement', color: '#70726f', tile: 1.8, textureContrast: .7 },
  porcelain: { color: '#f5eee0', roughness: .55 },
  limestone: { surface: 'stone', color: '#f3eadb', tile: 3.2, textureContrast: .26 },
  travertine: { surface: 'stone', color: '#eadabf', tile: 2.4, textureContrast: .38 },
  'steel-black': { color: '#1b1d1f', roughness: .36, metalness: .7 },
  'bronze-satin': { color: '#7a6040', roughness: .3, metalness: .85 },
  'lamp-teal': { color: '#1f454a', roughness: .5, metalness: .65 },
  'opal-glow': { color: '#c9fff0', emissive: '#c9fff0', emissiveIntensity: 2.2, roughness: .4 },
});

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
  // The court in warm travertine and bronze: deep loggias and gallery fronts.
  'luxe-court': {
    wall: ['travertine'], trim: 'bronze-satin', accent: 'metal-brass',
    storefronts: ['loggia', 'gallery', 'loggia'], awnings: ['canvas-rose'],
    windows: 'tall', roofs: ['reveal', 'stepped'], setback: 0, signage: 'blade', signPalette: 'noir',
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
  // Flush inlays in a shared lane: porcelain cross bands and black-steel channel drains.
  'street/band': { family: 'street', collision: 'none', material: 'porcelain', triangles: 8 },
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
