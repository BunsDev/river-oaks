import * as THREE from 'three';
import { EYE_COLORS, HAIR_SHADES, HAIRSTYLE_OPTIONS, OUTFIT_COLORS, SHOE_COLORS, SKIN_TONES } from './character-recipe.js';
import { HAIRSTYLES, transplantHairstyle } from './resident-hairstyle.js';
import { HAIR_TEXTURE_MEANS, textureGain } from './resident-style.js';

// A recipe dresses one avatar instance of its body (avatars.js clones every
// material per instance, so nothing here reaches the cached rig). Colours are
// reached by gaining each texture's measured mean toward the target, keeping its
// detail. Means are sRGB, over the texels each mesh's UV triangles cover, from
// the shipped rigs (2026-10-26; the hair means are resident-style.js's own).
// Each skin's `partner` is the same frame's texture from the other brightness
// cluster (of the same age where one exists): the only other skin a body wears.
export const SKIN_TEXTURES = Object.freeze({
  young_african_female: { body: 'woman-casual', mean: [74, 45, 33], partner: 'young_asian_female' },
  middleage_caucasian_female: { body: 'woman-tailored', mean: [194, 145, 120], partner: 'young_african_female' },
  young_asian_female: { body: 'woman-daywear', mean: [203, 151, 120], partner: 'young_african_female' },
  young_caucasian_male: { body: 'man-casual', mean: [215, 152, 121], partner: 'middleage_african_male' },
  middleage_african_male: { body: 'man-tailored', mean: [73, 45, 31], partner: 'middleage_asian_male' },
  middleage_asian_male: { body: 'man-workwear', mean: [194, 141, 112], partner: 'middleage_african_male' },
});
const GARMENT_MEANS = { female_casualsuit01: [59, 93, 131], female_elegantsuit01: [67, 55, 55], female_casualsuit02: [69, 97, 141], male_casualsuit02: [60, 93, 131], male_elegantsuit01: [41, 41, 41], male_worksuit01: [116, 153, 206] };
const SHOE_MEANS = { shoes01: [129, 81, 58], shoes02: [98, 96, 90], shoes03: [16, 14, 16], shoes04: [41, 40, 41] };
const SKIN_GAIN = 4, GARMENT_GAIN = 64;
const named = material => (material.name ?? '').replace(/\.\d+$/, '');
const skinOf = body => Object.keys(SKIN_TEXTURES).find(name => SKIN_TEXTURES[name].body === body);
// Relative (linear) luminance; THREE.Color holds linear components.
const luminance = color => .2126 * color.r + .7152 * color.g + .0722 * color.b;
const meanColor = ([r, g, b]) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);

// The skin texture a tone starts from: the body's own or its partner, whichever
// is nearer in brightness (the own one by a margin), so a deep tone never
// stretches a light skin's texture (or the reverse) far enough to wash out its
// features.
export function recipeSkinSource(recipe) {
  const own = skinOf(recipe.body), target = luminance(new THREE.Color(SKIN_TONES[recipe.skin].color));
  const score = name => Math.abs(Math.log(target / luminance(meanColor(SKIN_TEXTURES[name].mean)))) - (name === own ? .35 : 0);
  return [own, SKIN_TEXTURES[own].partner].sort((a, b) => score(a) - score(b))[0];
}

// The shipped eye texture (shared by all six bodies): two eyeballs on a grey
// sclera, iris radius 0.113 and pupil 0.036 about these UV centres (rows run
// top-down, as glTF UVs do). Each colour's iris is drawn once and shared.
const EYE_CENTRES = [[.7069, .2966], [.2907, .7087]], IRIS = .113, PUPIL = .036, EYE_SIZE = 256;
const irises = new Map();
export function irisTexture(id) {
  if (irises.has(id)) return irises.get(id);
  const iris = new THREE.Color(EYE_COLORS[id].color), sclera = [170, 167, 162], shade = [151, 141, 131], data = new Uint8Array(EYE_SIZE * EYE_SIZE * 4);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }, edge = 1.2 / EYE_SIZE;
  for (let y = 0; y < EYE_SIZE; y++) for (let x = 0; x < EYE_SIZE; x++) {
    const u = (x + .5) / EYE_SIZE, v = (y + .5) / EYE_SIZE;
    const [cx, cy] = EYE_CENTRES.reduce((best, centre) => Math.hypot(u - centre[0], v - centre[1]) < Math.hypot(u - best[0], v - best[1]) ? centre : best);
    const d = Math.hypot(u - cx, v - cy), angle = Math.atan2(v - cy, u - cx);
    const white = sclera.map((value, k) => value + (shade[k] - value) * smooth(.16, .26, d));
    // Radial fibres, a lighter collarette by the pupil and a dark limbal ring.
    const fibre = .8 + .2 * Math.sin(angle * 37 + 3 * Math.sin(angle * 11)) * (.6 + .4 * Math.sin(d * 140));
    const tone = fibre * (1 + .25 * (1 - smooth(PUPIL, .06, d))) * (1 - .55 * smooth(.088, IRIS, d));
    const ring = [iris.r, iris.g, iris.b].map(channel => Math.min(255, channel * 255 * tone));
    const inIris = 1 - smooth(IRIS - edge, IRIS + edge, d), inPupil = 1 - smooth(PUPIL - edge, PUPIL + edge, d);
    const index = (y * EYE_SIZE + x) * 4;
    for (let k = 0; k < 3; k++) data[index + k] = Math.round((white[k] * (1 - inIris) + ring[k] * inIris) * (1 - inPupil) + 6 * inPupil);
    data[index + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, EYE_SIZE, EYE_SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.name = `iris-${id}`; texture.needsUpdate = true;
  irises.set(id, texture);
  return texture;
}

const textureFrom = (template, name) => {
  let found = null;
  template.scene.traverse(mesh => { for (const material of [mesh.material ?? []].flat()) if (!found && named(material) === name && material.map) found = material.map; });
  return found;
};

// Dresses `avatar` (an instance of the recipe's body) in the recipe. Hair moves
// first, so the transplanted hair is tinted too. `loadTemplate(profile)` returns
// a cached rig template (avatars.js), for donor hair and another body's skin.
export async function applyCharacterRecipe(avatar, recipe, loadTemplate) {
  const report = { hairstyle: HAIRSTYLES[recipe.body], skin: skinOf(recipe.body) };
  if (recipe.hairStyle !== HAIRSTYLES[recipe.body]) {
    transplantHairstyle(avatar, await loadTemplate(HAIRSTYLE_OPTIONS[recipe.hairStyle].body));
    report.hairstyle = recipe.hairStyle;
  }
  const source = recipeSkinSource(recipe), skinMap = source === report.skin ? null : textureFrom(await loadTemplate(SKIN_TEXTURES[source].body), source);
  for (const [original, material] of avatar.materials) {
    const name = named(original);
    if (Object.hasOwn(SKIN_TEXTURES, name)) {
      if (skinMap) { material.map = skinMap; report.skin = source; }
      material.color.setRGB(...textureGain(SKIN_TEXTURES[report.skin].mean, new THREE.Color(SKIN_TONES[recipe.skin].color), SKIN_GAIN));
    } else if (/^brown$/.test(name)) {
      material.map = irisTexture(recipe.eyes); material.color.set(0xffffff);
    } else if (Object.hasOwn(HAIR_TEXTURE_MEANS, name)) {
      material.color.setRGB(...textureGain(HAIR_TEXTURE_MEANS[name], new THREE.Color(HAIR_SHADES[recipe.hairColor].color)));
    } else if (Object.hasOwn(GARMENT_MEANS, name) && OUTFIT_COLORS[recipe.outfitColor].color) {
      material.color.setRGB(...textureGain(GARMENT_MEANS[name], new THREE.Color(OUTFIT_COLORS[recipe.outfitColor].color), GARMENT_GAIN));
    } else if (Object.hasOwn(SHOE_MEANS, name) && SHOE_COLORS[recipe.shoeColor].color) {
      material.color.setRGB(...textureGain(SHOE_MEANS[name], new THREE.Color(SHOE_COLORS[recipe.shoeColor].color), GARMENT_GAIN));
    } else continue;
    material.needsUpdate = true;
  }
  avatar.model.userData.characterRecipe = report;
  return report;
}
