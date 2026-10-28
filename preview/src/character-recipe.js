// Player-made humans (character schema version 3). A recipe chooses among the
// shipped CC0 bodies and the face targets, skins, eyes, hair and garments they
// already carry. It holds only integers and catalogue keys, so the server
// validates a publication by rebuilding it exactly, as it does the authored looks.
export const CUSTOM_APPEARANCE_ID = 'custom-human';
export const RECIPE_CATALOG = 'river-oaks-recipes-v1';

const freeze = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child); return Object.freeze(value); };

// Each shipped body is a frame and the outfit made for it (MPFB game rigs). Its
// `pair` is the other frame's body in the nearest style, for switching frame.
export const RECIPE_FRAMES = freeze({ feminine: { label: 'Feminine' }, masculine: { label: 'Masculine' } });
export const RECIPE_BODIES = freeze({
  'woman-daywear': { frame: 'feminine', outfit: 'Daywear', garment: 'female_casualsuit02', shoes: 'shoes01', pair: 'man-workwear' },
  'woman-casual': { frame: 'feminine', outfit: 'City casual', garment: 'female_casualsuit01', shoes: 'shoes02', pair: 'man-casual' },
  'woman-tailored': { frame: 'feminine', outfit: 'Elegant suit', garment: 'female_elegantsuit01', shoes: 'shoes02', pair: 'man-tailored' },
  'man-casual': { frame: 'masculine', outfit: 'City casual', garment: 'male_casualsuit02', shoes: 'shoes01', pair: 'woman-casual' },
  'man-tailored': { frame: 'masculine', outfit: 'Tailored suit', garment: 'male_elegantsuit01', shoes: 'shoes03', pair: 'woman-tailored' },
  'man-workwear': { frame: 'masculine', outfit: 'Workwear', garment: 'male_worksuit01', shoes: 'shoes04', pair: 'woman-daywear' },
});
// The wardrobe (build_character_wardrobe.py): every CC0 suit of a frame, split
// into the top and the bottom any of its bodies can wear, and every shoe pair.
// Several suits share one jeans mesh, so only distinct bottoms are offered.
export const RECIPE_TOPS = freeze({
  'female_casualsuit01-top': { frame: 'feminine', label: 'Logo tee' },
  'female_casualsuit02-top': { frame: 'feminine', label: 'Bright logo tee' },
  'female_elegantsuit01-top': { frame: 'feminine', label: 'Pinstripe jacket' },
  'female_sportsuit01-top': { frame: 'feminine', label: 'Crop top' },
  'male_casualsuit01-top': { frame: 'masculine', label: 'Denim shirt' },
  'male_casualsuit02-top': { frame: 'masculine', label: 'Long-sleeve tee' },
  'male_casualsuit03-top': { frame: 'masculine', label: 'Pinstripe shirt' },
  'male_casualsuit04-top': { frame: 'masculine', label: 'Logo tee' },
  'male_casualsuit05-top': { frame: 'masculine', label: 'Jacket and shirt' },
  'male_casualsuit06-top': { frame: 'masculine', label: 'White tee' },
  'male_elegantsuit01-top': { frame: 'masculine', label: 'Suit jacket and tie' },
  'male_worksuit01-top': { frame: 'masculine', label: 'Overall bib' },
});
export const RECIPE_BOTTOMS = freeze({
  'female_casualsuit01-bottom': { frame: 'feminine', label: 'Skinny jeans' },
  'female_casualsuit02-bottom': { frame: 'feminine', label: 'Denim shorts' },
  'female_elegantsuit01-bottom': { frame: 'feminine', label: 'Pencil skirt' },
  'female_sportsuit01-bottom': { frame: 'feminine', label: 'Leggings' },
  'male_casualsuit01-bottom': { frame: 'masculine', label: 'Dark jeans' },
  'male_casualsuit02-bottom': { frame: 'masculine', label: 'Jeans' },
  'male_elegantsuit01-bottom': { frame: 'masculine', label: 'Suit trousers' },
  'male_worksuit01-bottom': { frame: 'masculine', label: 'Overalls' },
});
export const RECIPE_FOOTWEAR = freeze({
  shoes01: { label: 'Brown brogues' }, shoes02: { label: 'Trail trainers' }, shoes03: { label: 'Black boots' },
  shoes04: { label: 'Black loafers' }, shoes05: { label: 'White trainers' }, shoes06: { label: 'Navy trainers' },
});
// The clothes a body is made in.
export const bodyClothes = body => ({ top: `${RECIPE_BODIES[body].garment}-top`, bottom: `${RECIPE_BODIES[body].garment}-bottom`, footwear: RECIPE_BODIES[body].shoes });
// Standing height in centimetres; uniform scale of the whole figure.
export const RECIPE_HEIGHT = freeze({ min: 150, max: 200, typical: { feminine: 166, masculine: 178 }, spread: 7 });

// Sliders over resident-face.js's targets. One-sided controls run 0..100 and
// two-sided ones -100..100 between their `low` and `high` targets; left and
// right targets move together. Full travel is a 0.7 weight: a different person,
// not a caricature.
export const FACE_LIMIT = 0.7;
// Slider values move in steps of 5, so every stored face is exactly what its slider shows.
export const FACE_STEP = 5;
export const FACE_FEATURES = freeze({ head: 'Head', nose: 'Nose', mouth: 'Mouth', chin: 'Chin and jaw', cheeks: 'Cheeks', eyes: 'Eyes', brows: 'Brows' });
export const FACE_CONTROLS = freeze([
  { id: 'head', feature: 'head', label: 'Shape', low: ['head-triangular'], high: ['head-square'], lowLabel: 'Tapered', highLabel: 'Square' },
  { id: 'noseWidth', feature: 'nose', label: 'Width', low: ['nose-scale-horiz-decr'], high: ['nose-scale-horiz-incr'], lowLabel: 'Narrow', highLabel: 'Wide' },
  { id: 'noseLength', feature: 'nose', label: 'Length', high: ['nose-scale-vert-incr'] },
  { id: 'noseBridge', feature: 'nose', label: 'Bridge', high: ['nose-hump-incr'] },
  { id: 'noseTip', feature: 'nose', label: 'Upturned tip', high: ['nose-point-up'] },
  { id: 'mouthWidth', feature: 'mouth', label: 'Width', low: ['mouth-scale-horiz-decr'], high: ['mouth-scale-horiz-incr'], lowLabel: 'Narrow', highLabel: 'Wide' },
  { id: 'upperLip', feature: 'mouth', label: 'Upper lip', high: ['mouth-upperlip-volume-incr'] },
  { id: 'lowerLip', feature: 'mouth', label: 'Lower lip', high: ['mouth-lowerlip-volume-incr'] },
  { id: 'chinProminence', feature: 'chin', label: 'Prominence', high: ['chin-prominent-incr'] },
  { id: 'chinWidth', feature: 'chin', label: 'Width', low: ['chin-width-decr'], high: ['chin-width-incr'], lowLabel: 'Narrow', highLabel: 'Broad' },
  { id: 'chinHeight', feature: 'chin', label: 'Height', high: ['chin-height-incr'] },
  { id: 'cheekbones', feature: 'cheeks', label: 'Cheekbones', high: ['l-cheek-bones-incr', 'r-cheek-bones-incr'] },
  { id: 'cheekFullness', feature: 'cheeks', label: 'Fullness', high: ['l-cheek-volume-incr', 'r-cheek-volume-incr'] },
  { id: 'eyeSize', feature: 'eyes', label: 'Size', high: ['l-eye-scale-incr', 'r-eye-scale-incr'] },
  { id: 'eyeSpacing', feature: 'eyes', label: 'Spacing', high: ['l-eye-trans-out', 'r-eye-trans-out'] },
  { id: 'browHeight', feature: 'brows', label: 'Height', low: ['eyebrows-trans-down'], high: ['eyebrows-trans-up'], lowLabel: 'Low', highLabel: 'High' },
]);

// Colours are targets: a skin's or hair's texture mean, an iris, or a garment tint.
// `null` keeps the garment as it was made.
// Skin tones are albedos, not display colours. They step evenly in luminance from
// 1.45x the shipped light skins' mean to 0.75x the deep ones', with a hue between
// theirs, so each is a near-uniform gain of a real texture (character-recipe-look.js).
// Display colours needed up to 2.9x in blue, and Porcelain rendered chalk-white.
export const SKIN_TONES = freeze({
  porcelain: { label: 'Porcelain', color: '#eeae8c' },
  fair: { label: 'Fair', color: '#cd9679' },
  light: { label: 'Light', color: '#b38066' },
  beige: { label: 'Warm beige', color: '#9b6d56' },
  olive: { label: 'Olive', color: '#875d48' },
  tan: { label: 'Tan', color: '#754f3c' },
  golden: { label: 'Golden brown', color: '#654232' },
  brown: { label: 'Brown', color: '#573729' },
  deep: { label: 'Deep brown', color: '#4b2e21' },
  ebony: { label: 'Ebony', color: '#40261b' },
});
// Iris colours as painted on the eye texture (the authored brown is about #45100a).
export const EYE_COLORS = freeze({
  brown: { label: 'Brown', color: '#4f2a14' },
  'dark-brown': { label: 'Dark brown', color: '#2e170c' },
  amber: { label: 'Amber', color: '#7a4c16' },
  hazel: { label: 'Hazel', color: '#5c5026' },
  green: { label: 'Green', color: '#3e5e34' },
  blue: { label: 'Blue', color: '#3d6188' },
  grey: { label: 'Grey', color: '#66717a' },
});
// Any hairstyle fits any head (resident-hairstyle.js); each is named by its asset.
export const HAIRSTYLE_OPTIONS = freeze({
  bob01: { label: 'Bob', body: 'woman-casual' },
  bob02: { label: 'Layered bob', body: 'woman-tailored' },
  ponytail01: { label: 'Ponytail', body: 'woman-daywear' },
  short01: { label: 'Short', body: 'man-casual' },
  short02: { label: 'Short swept', body: 'man-workwear' },
  short04: { label: 'Close crop', body: 'man-tailored' },
});
export const HAIR_SHADES = freeze({
  black: { label: 'Black', color: '#1c1a1a' },
  'blue-black': { label: 'Blue black', color: '#1c1e26' },
  'dark-brown': { label: 'Dark brown', color: '#2b1d16' },
  chestnut: { label: 'Chestnut', color: '#5a3423' },
  auburn: { label: 'Auburn', color: '#5e2c20' },
  copper: { label: 'Copper', color: '#995431' },
  honey: { label: 'Honey', color: '#b5834f' },
  'ash-blonde': { label: 'Ash blonde', color: '#bba78a' },
  platinum: { label: 'Platinum', color: '#d9d2c3' },
  silver: { label: 'Silver', color: '#b9b7b3' },
});
export const OUTFIT_COLORS = freeze({
  natural: { label: 'As made', color: null },
  ivory: { label: 'Ivory', color: '#e8dfd0' },
  camel: { label: 'Camel', color: '#b08a5e' },
  mustard: { label: 'Mustard', color: '#b8913a' },
  terracotta: { label: 'Terracotta', color: '#af6552' },
  rose: { label: 'Rose', color: '#b66e89' },
  wine: { label: 'Wine', color: '#6b2a3a' },
  lavender: { label: 'Lavender', color: '#9c8bb8' },
  navy: { label: 'Navy', color: '#283a5c' },
  lagoon: { label: 'Lagoon', color: '#416e72' },
  forest: { label: 'Forest', color: '#3e5a44' },
  charcoal: { label: 'Charcoal', color: '#3b3d42' },
});
export const SHOE_COLORS = freeze({
  natural: { label: 'As made', color: null },
  black: { label: 'Black', color: '#1f1e20' },
  brown: { label: 'Brown', color: '#5a3a26' },
  tan: { label: 'Tan', color: '#a0754e' },
  white: { label: 'White', color: '#e9e6e0' },
  burgundy: { label: 'Burgundy', color: '#5e1f2a' },
  navy: { label: 'Navy', color: '#24314d' },
});

// Studio categories: each rolls and locks as a unit.
export const RECIPE_CATEGORIES = freeze({
  body: ['body'], height: ['height'], face: ['face'], skin: ['skin'], eyes: ['eyes'],
  hair: ['hairStyle', 'hairColor'], outfit: ['top', 'bottom', 'outfitColor'], shoes: ['footwear', 'shoeColor'],
});

export const DEFAULT_RECIPE = freeze({
  body: 'woman-daywear', height: RECIPE_HEIGHT.typical.feminine,
  face: Object.fromEntries(FACE_CONTROLS.map(control => [control.id, 0])),
  skin: 'beige', eyes: 'brown', hairStyle: 'ponytail01', hairColor: 'dark-brown', outfitColor: 'natural', shoeColor: 'natural',
  ...bodyClothes('woman-daywear'),
});
const FIELDS = Object.keys(DEFAULT_RECIPE), CLOTHES = Object.keys(bodyClothes('woman-daywear'));
const LEGACY_FIELDS = FIELDS.filter(field => !CLOTHES.includes(field));

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const key = (catalogue, value) => typeof value === 'string' && Object.hasOwn(catalogue, value);
const within = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const faceRange = control => control.low ? -100 : 0;
const faceValue = (value, control) => within(value, faceRange(control), 100) && value % FACE_STEP === 0;

// The canonical copy of a recipe, or a TypeError. Never repairs a malformed one.
// A recipe saved before the wardrobe wears its body's own clothes.
export function characterRecipe(value) {
  if (exact(value, LEGACY_FIELDS) && key(RECIPE_BODIES, value.body)) value = { ...value, ...bodyClothes(value.body) };
  const frame = key(RECIPE_BODIES, value?.body) && RECIPE_BODIES[value.body].frame;
  const valid = exact(value, FIELDS) && key(RECIPE_BODIES, value.body) && within(value.height, RECIPE_HEIGHT.min, RECIPE_HEIGHT.max)
    && exact(value.face, FACE_CONTROLS.map(control => control.id)) && FACE_CONTROLS.every(control => faceValue(value.face[control.id], control))
    && key(SKIN_TONES, value.skin) && key(EYE_COLORS, value.eyes) && key(HAIRSTYLE_OPTIONS, value.hairStyle) && key(HAIR_SHADES, value.hairColor)
    && key(OUTFIT_COLORS, value.outfitColor) && key(SHOE_COLORS, value.shoeColor)
    && key(RECIPE_TOPS, value.top) && RECIPE_TOPS[value.top].frame === frame && key(RECIPE_BOTTOMS, value.bottom) && RECIPE_BOTTOMS[value.bottom].frame === frame
    && key(RECIPE_FOOTWEAR, value.footwear);
  if (!valid) throw new TypeError('Invalid character recipe');
  return { ...value, face: Object.fromEntries(FACE_CONTROLS.map(control => [control.id, value.face[control.id]])) };
}

// Morph name -> weight for resident-face.js's bake.
export function recipeFaceShapes(recipe) {
  const face = {};
  for (const control of FACE_CONTROLS) {
    const value = recipe.face[control.id];
    if (!value) continue;
    const weight = Math.round(Math.abs(value) / 100 * FACE_LIMIT * 100) / 100;
    for (const name of value > 0 ? control.high : control.low) face[name] = weight;
  }
  return face;
}

export const recipeFrame = recipe => RECIPE_BODIES[recipe.body].frame;

const pick = (random, values) => values[Math.min(values.length - 1, Math.max(0, Math.floor(random() * values.length)))];
function weighted(random, weights) {
  const entries = Object.entries(weights), total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [id, weight] of entries) if ((roll -= weight) < 0) return id;
  return entries.at(-1)[0];
}
// Hair and eye colours follow how common they are; hairstyles lean to the frame
// they were made for without ruling any out.
const HAIR_WEIGHTS = { black: 2, 'blue-black': 1, 'dark-brown': 3, chestnut: 2, auburn: 1, copper: .7, honey: 1, 'ash-blonde': 1, platinum: .5, silver: .6 };
const EYE_WEIGHTS = { brown: 3, 'dark-brown': 2, amber: .7, hazel: 1.5, green: 1, blue: 1.5, grey: .8 };
const styleWeights = frame => Object.fromEntries(Object.entries(HAIRSTYLE_OPTIONS).map(([id, style]) => [id, recipeFrame({ body: style.body }) === frame ? 3 : 1]));
const rolls = {
  // A body of the other frame comes in its own top and bottom; shoes fit either frame.
  body: (random, recipe) => {
    const body = pick(random, Object.keys(RECIPE_BODIES)), { top, bottom } = bodyClothes(body);
    return RECIPE_BODIES[body].frame === recipeFrame(recipe) ? { body } : { body, top, bottom };
  },
  height: (random, recipe) => {
    // A rounded bell about the frame's typical height (the sum of three uniforms).
    const offset = (random() + random() + random() - 1.5) * 2 * RECIPE_HEIGHT.spread;
    return { height: Math.min(RECIPE_HEIGHT.max, Math.max(RECIPE_HEIGHT.min, Math.round(RECIPE_HEIGHT.typical[recipeFrame(recipe)] + offset))) };
  },
  // About half the features differ from the base face, each by a moderate amount.
  face: random => ({ face: Object.fromEntries(FACE_CONTROLS.map(control => {
    if (random() < .5) return [control.id, 0];
    const amount = 20 + FACE_STEP * Math.floor(random() * 13);
    return [control.id, control.low && random() < .5 ? -amount : amount];
  })) }),
  skin: random => ({ skin: pick(random, Object.keys(SKIN_TONES)) }),
  eyes: random => ({ eyes: weighted(random, EYE_WEIGHTS) }),
  hair: (random, recipe) => ({ hairStyle: weighted(random, styleWeights(recipeFrame(recipe))), hairColor: weighted(random, HAIR_WEIGHTS) }),
  // About half the time the bottom is the one made with the top, when the top's suit has one on offer.
  outfit: (random, recipe) => {
    const frame = recipeFrame(recipe), mine = items => Object.keys(items).filter(id => items[id].frame === frame);
    const top = pick(random, mine(RECIPE_TOPS)), matching = top.replace(/-top$/, '-bottom');
    const bottom = Object.hasOwn(RECIPE_BOTTOMS, matching) && random() < .5 ? matching : pick(random, mine(RECIPE_BOTTOMS));
    return { top, bottom, outfitColor: weighted(random, { ...Object.fromEntries(Object.keys(OUTFIT_COLORS).map(id => [id, 1])), natural: 2 }) };
  },
  shoes: random => ({ footwear: pick(random, Object.keys(RECIPE_FOOTWEAR)), shoeColor: weighted(random, { ...Object.fromEntries(Object.keys(SHOE_COLORS).map(id => [id, 1])), natural: 2 }) }),
};

// Rolls the named categories of `from` (all of them by default), in catalogue
// order so a new body sets the frame its height and hair are drawn for. A roll
// always changes something; other categories are kept exactly.
export function rollCharacterRecipe({ from = DEFAULT_RECIPE, categories = Object.keys(RECIPE_CATEGORIES), random = Math.random } = {}) {
  const base = characterRecipe(from);
  if (!Array.isArray(categories) || categories.some(category => !Object.hasOwn(RECIPE_CATEGORIES, category))) throw new TypeError('Unknown recipe category');
  const order = Object.keys(RECIPE_CATEGORIES).filter(category => categories.includes(category));
  if (!order.length) return base;
  for (let attempt = 0; attempt < 16; attempt++) {
    let next = base;
    for (const category of order) next = { ...next, ...rolls[category](random, next) };
    next = characterRecipe(next);
    if (JSON.stringify(next) !== JSON.stringify(base)) return next;
  }
  return base;
}
