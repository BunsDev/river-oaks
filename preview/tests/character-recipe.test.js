import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_APPEARANCE_ID, DEFAULT_RECIPE, EYE_COLORS, FACE_CONTROLS, FACE_LIMIT, FACE_STEP, HAIR_SHADES, HAIRSTYLE_OPTIONS, RECIPE_BODIES, RECIPE_BUILD, RECIPE_CATEGORIES, RECIPE_HEIGHT, SKIN_TONES,
  characterRecipe, recipeFaceShapes, recipeFrame, recipeWidth, rollCharacterRecipe } from '../src/character-recipe.js';
import { characterAppearanceFor, characterDefinitionFor, migrateCharacterAppearance, recipeCharacterDefinition, validateCharacterDefinition } from '../src/character-definition.js';
import { customizedCharacterDefinition } from '../src/character-customization.js';
import { selectedCharacterFor } from '../src/character-selection-view.js';
import { CHARACTER_ASSETS } from '../src/character-assets.js';
import { FACE_SHAPES } from '../src/resident-face.js';
import { HAIRSTYLES } from '../src/resident-hairstyle.js';
import { AVATAR_PROFILES } from '../src/avatars.js';
import { SHARED_APPEARANCES, canUseAppearance, permittedAppearance, sharedAppearance, sharedCharacter } from '../src/shared-appearances.js';

// A small seeded generator (mulberry32), so rolls are reproducible.
const seeded = seed => () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const valid = (definition, ownerId = 'fixture-owner') => validateCharacterDefinition(JSON.parse(JSON.stringify(definition)), { ownerId });

test('face sliders drive every shipped face target once, both sides together, within the caricature limit', () => {
  const targets = FACE_CONTROLS.flatMap(control => [...(control.low ?? []), ...control.high]);
  assert.deepEqual([...targets].sort(), [...FACE_SHAPES].sort(), 'each face target belongs to exactly one slider direction');
  const full = { ...DEFAULT_RECIPE, face: Object.fromEntries(FACE_CONTROLS.map(control => [control.id, 100])) };
  const shapes = recipeFaceShapes(full);
  assert.equal(Object.keys(shapes).length, FACE_CONTROLS.reduce((sum, control) => sum + control.high.length, 0));
  for (const weight of Object.values(shapes)) assert.equal(weight, FACE_LIMIT);
  assert.equal(shapes['l-cheek-bones-incr'], shapes['r-cheek-bones-incr']);
  const low = recipeFaceShapes({ ...DEFAULT_RECIPE, face: { ...DEFAULT_RECIPE.face, noseWidth: -50, browHeight: 30 } });
  assert.deepEqual(low, { 'nose-scale-horiz-decr': .35, 'eyebrows-trans-up': .21 });
  assert.deepEqual(recipeFaceShapes(DEFAULT_RECIPE), {}, 'the default recipe keeps the body\'s own face');
});

test('every recipe body is a pinned resident rig, and every hairstyle comes from one of them', () => {
  assert.deepEqual(Object.keys(RECIPE_BODIES).sort(), [...AVATAR_PROFILES].sort());
  for (const body of Object.keys(RECIPE_BODIES)) assert.ok(Object.hasOwn(CHARACTER_ASSETS, body), `${body} is pinned`);
  assert.deepEqual(Object.keys(HAIRSTYLE_OPTIONS).sort(), Object.values(HAIRSTYLES).sort());
  for (const [style, option] of Object.entries(HAIRSTYLE_OPTIONS)) assert.equal(HAIRSTYLES[option.body], style);
  assert.ok(Object.values(RECIPE_BODIES).some(body => body.frame === 'feminine') && Object.values(RECIPE_BODIES).some(body => body.frame === 'masculine'));
});

test('a recipe publishes as the custom look, and the authored catalogue and its pickers are unchanged', () => {
  const recipe = rollCharacterRecipe({ random: seeded(7) }), definition = recipeCharacterDefinition('fixture-owner', recipe, { revision: 2 });
  assert.deepEqual(valid(definition), { ok: true, definition });
  assert.equal(definition.schemaVersion, 3);
  assert.equal(definition.appearanceId, CUSTOM_APPEARANCE_ID);
  assert.equal(definition.rig, recipe.body);
  assert.deepEqual(definition.assets, [CHARACTER_ASSETS[recipe.body]]);
  assert.equal(characterAppearanceFor(definition, 'fixture-owner').recipe, true);
  assert.deepEqual(selectedCharacterFor({ id: 'fixture-owner', appearance: CUSTOM_APPEARANCE_ID, character: definition }), definition);
  // A custom look without its recipe (or with a broken one) shows the default recipe, never another player's look.
  const fallback = selectedCharacterFor({ id: 'fixture-owner', appearance: CUSTOM_APPEARANCE_ID, character: { ...definition, rig: 'jevica' } });
  assert.deepEqual(fallback, recipeCharacterDefinition('fixture-owner', DEFAULT_RECIPE));
  assert.deepEqual(migrateCharacterAppearance('fixture-owner', CUSTOM_APPEARANCE_ID), fallback);
  // Not an authored look: no roster chip, no picker style, no Surprise me among looks.
  assert.equal(SHARED_APPEARANCES.length, 13);
  assert.equal(SHARED_APPEARANCES.some(look => look.id === CUSTOM_APPEARANCE_ID), false);
  assert.equal(sharedAppearance(CUSTOM_APPEARANCE_ID).character, 'custom');
  assert.equal(sharedCharacter('custom').variants.length, 1);
  assert.equal(canUseAppearance('fixture-owner', CUSTOM_APPEARANCE_ID), true);
  assert.equal(permittedAppearance('fixture-owner', CUSTOM_APPEARANCE_ID), CUSTOM_APPEARANCE_ID);
});

test('malformed, forged and older-version recipe records fail closed', () => {
  const recipe = rollCharacterRecipe({ random: seeded(11) }), base = recipeCharacterDefinition('fixture-owner', recipe, { revision: 1 });
  const other = Object.keys(RECIPE_BODIES).find(body => body !== recipe.body);
  for (const change of [
    { rig: other }, { outfit: other }, { rig: 'jevica' }, { appearanceId: 'sable-human' }, { form: 'beast' }, { palette: 'rose' }, { hair: 'copper' },
    { attachments: ['crown'] }, { assets: [CHARACTER_ASSETS.jevica] }, { provenance: { kind: 'authored', catalog: 'river-oaks-looks-v2' } },
    { schemaVersion: 2 }, { schemaVersion: 1 }, { schemaVersion: 4 }, { ownerId: 'other' }, { parameters: {} },
  ]) assert.equal(valid({ ...base, ...change }).ok, false, JSON.stringify(change));
  const tampered = [
    { height: RECIPE_HEIGHT.max + 1 }, { height: RECIPE_HEIGHT.min - 1 }, { height: 170.5 }, { height: '170' },
    { body: 'jevica' }, { body: 'woman-realistic-tailored' }, { skin: 'constructor' }, { skin: '__proto__' }, { eyes: 'violet' },
    { hairStyle: 'long01' }, { hairColor: '#ff00ff' }, { outfitColor: 'gold' }, { shoeColor: null }, { extra: true },
    { build: 7 }, { build: 150 }, { build: -105 }, { build: '0' }, { build: 2.5 }, { build: null },
    { face: { ...recipe.face, noseLength: -10 } }, { face: { ...recipe.face, head: 101 } }, { face: { ...recipe.face, eyeSize: 1.5 } },
    { face: { ...recipe.face, noseWidth: -49 } }, { face: { ...recipe.face, eyeSize: 33 } },
    { face: { ...recipe.face, smile: 10 } }, { face: Object.fromEntries(Object.entries(recipe.face).slice(1)) }, { face: [] },
  ];
  for (const change of tampered) {
    assert.equal(valid({ ...base, parameters: { ...recipe, ...change } }).ok, false, JSON.stringify(change));
    assert.throws(() => characterRecipe({ ...recipe, ...change }), /Invalid character recipe/);
  }
  const { skin: _skin, ...missing } = recipe;
  assert.equal(valid({ ...base, parameters: missing }).ok, false);
  assert.throws(() => characterRecipe({ ...recipe, build: undefined }), /Invalid character recipe/, 'a present but empty build is not the legacy shape');
  assert.equal(validateCharacterDefinition({ ...base, parameters: Object.assign(Object.create({ injected: 1 }), recipe) }, { ownerId: 'fixture-owner' }).ok, false, 'a recipe with a prototype is refused');
  // Authored records cannot name the custom look, and a recipe cannot borrow Sable's colours.
  assert.equal(valid({ ...characterDefinitionFor('fixture-owner', 'sable-human', { revision: 1 }), appearanceId: CUSTOM_APPEARANCE_ID }).ok, false);
  assert.throws(() => customizedCharacterDefinition('fixture-owner', CUSTOM_APPEARANCE_ID, { palette: 'authored', hair: 'authored' }));
  const result = valid(base); result.definition.parameters.face.head = 99;
  assert.notEqual(base.parameters.face.head, 99, 'validation returns independent owned state');
});

// The build joined the recipe on 2026-10-29. People published before it have no `build`
// field: they still validate, as a neutral build, and canonical copies come out in one
// field order, so a stored revision and a fresh copy of the same person are the same text.
test('a recipe record from before the build reads as a neutral build, and canonical copies share one field order', () => {
  const recipe = rollCharacterRecipe({ random: seeded(29) }), { build: _build, ...before } = recipe;
  const definition = recipeCharacterDefinition('fixture-owner', recipe, { revision: 3 });
  const legacy = { ...definition, parameters: before };
  const read = valid(legacy);
  assert.equal(read.ok, true, 'a record without a build still validates');
  assert.deepEqual(read.definition, recipeCharacterDefinition('fixture-owner', { ...before, build: 0 }, { revision: 3 }));
  assert.equal(read.definition.parameters.build, 0);
  assert.deepEqual(Object.keys(read.definition.parameters), Object.keys(DEFAULT_RECIPE));
  assert.deepEqual(characterRecipe(before), { ...before, build: 0 }, 'the canonical copy carries the neutral build');
  // Fields arriving in another order still give the same text as the stored copy.
  const shuffled = Object.fromEntries(Object.entries(recipe).reverse());
  assert.equal(JSON.stringify(characterRecipe(shuffled)), JSON.stringify(characterRecipe(recipe)));
  assert.equal(JSON.stringify(recipeCharacterDefinition('fixture-owner', shuffled, { revision: 3 })), JSON.stringify(definition));
  // Only the build may be missing; a record that drops anything else is still refused.
  const { height: _height, ...noHeight } = before;
  assert.equal(valid({ ...definition, parameters: noHeight }).ok, false);
  assert.throws(() => characterRecipe({ ...before, build: 7 }), /Invalid character recipe/);
  assert.equal(recipeWidth({ build: 0 }), 1);
  assert.equal(recipeWidth({ build: RECIPE_BUILD.max }), 1 + RECIPE_BUILD.width);
  assert.ok(Math.abs(recipeWidth({ build: -50 }) - (1 - RECIPE_BUILD.width / 2)) < 1e-12);
});

// Val's ask (2026-10-29): the studio starts from a random eyes, brows, lips, hairstyle,
// frame, hair colour, height and body type. Every one of those varies across starts.
test('random starts vary every named category: frame, body, build, height, face, eyes, hair and skin', () => {
  const seen = { frame: new Set(), body: new Set(), build: new Set(), height: new Set(), eyes: new Set(), hairStyle: new Set(), hairColor: new Set(), skin: new Set(),
    eyeSize: new Set(), browHeight: new Set(), upperLip: new Set(), lowerLip: new Set() };
  for (let i = 0; i < 200; i++) {
    const recipe = rollCharacterRecipe();
    assert.deepEqual(characterRecipe(recipe), recipe);
    assert.ok(Number.isInteger(recipe.build / RECIPE_BUILD.step) && recipe.build >= RECIPE_BUILD.min && recipe.build <= RECIPE_BUILD.max, `build ${recipe.build}`);
    assert.ok(Object.is(recipe.build, recipe.build + 0) && !Object.is(recipe.build, -0), 'a neutral build is never -0');
    seen.frame.add(recipeFrame(recipe));
    for (const field of ['body', 'build', 'height', 'eyes', 'hairStyle', 'hairColor', 'skin']) seen[field].add(recipe[field]);
    for (const control of ['eyeSize', 'browHeight', 'upperLip', 'lowerLip']) seen[control].add(recipe.face[control]);
  }
  for (const [field, values] of Object.entries(seen)) assert.ok(values.size >= 2, `${field} varies (${[...values].join(', ')})`);
  assert.equal(seen.frame.size, 2);
  assert.ok(seen.eyes.size >= 4 && seen.hairColor.size >= 5 && seen.build.size >= 6);
  for (const value of seen.build) assert.ok(Object.hasOwn(EYE_COLORS, [...seen.eyes][0]) && Object.hasOwn(HAIR_SHADES, [...seen.hairColor][0]) && Number.isInteger(value));
  // The body dice re-roll the build with the body; the height dice leave it alone.
  const random = seeded(61);
  const base = rollCharacterRecipe({ random }), height = rollCharacterRecipe({ from: base, categories: ['height'], random });
  assert.equal(height.build, base.build);
  assert.deepEqual(RECIPE_CATEGORIES.body, ['body', 'build']);
});

test('rolls are seeded, valid, always change something, and leave other categories exactly as they were', () => {
  assert.deepEqual(rollCharacterRecipe({ random: seeded(3) }), rollCharacterRecipe({ random: seeded(3) }));
  const random = seeded(19);
  let current = rollCharacterRecipe({ random });
  for (let i = 0; i < 200; i++) {
    const categories = Object.keys(RECIPE_CATEGORIES).filter(() => random() < .4);
    const next = rollCharacterRecipe({ from: current, categories, random });
    assert.deepEqual(characterRecipe(next), next);
    if (!categories.length) { assert.deepEqual(next, current); continue; }
    assert.notDeepEqual(next, current, `rolling ${categories} changes the recipe`);
    const kept = Object.entries(RECIPE_CATEGORIES).filter(([category]) => !categories.includes(category)).flatMap(([, fields]) => fields);
    for (const field of kept) assert.deepEqual(next[field], current[field], `${field} is kept while rolling ${categories}`);
    current = next;
  }
  for (const category of Object.keys(RECIPE_CATEGORIES)) assert.notDeepEqual(rollCharacterRecipe({ from: DEFAULT_RECIPE, categories: [category], random: seeded(5) }), DEFAULT_RECIPE, category);
  assert.throws(() => rollCharacterRecipe({ categories: ['wings'] }), /Unknown recipe category/);
  assert.throws(() => rollCharacterRecipe({ from: { ...DEFAULT_RECIPE, height: 300 } }), /Invalid character recipe/);
});

// The Studio's sliders move in FACE_STEP steps. A rolled -49 showed as -50 on its slider, and four key presses
// then moved the face by 19 instead of 20 (the character-recipes journey).
test('every rolled face value is one its slider can show', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const { face } = rollCharacterRecipe({ random: seeded(seed) });
    for (const control of FACE_CONTROLS) assert.ok(Number.isInteger(face[control.id] / FACE_STEP), `seed ${seed} ${control.id} ${face[control.id]}`);
  }
});

test('random starts reach every body, skin and hairstyle, with heights about each frame', () => {
  const random = seeded(41), seen = { body: new Set(), skin: new Set(), hairStyle: new Set() }, heights = { feminine: [], masculine: [] };
  let faces = 0;
  for (let i = 0; i < 600; i++) {
    const recipe = rollCharacterRecipe({ random });
    for (const field of Object.keys(seen)) seen[field].add(recipe[field]);
    heights[recipeFrame(recipe)].push(recipe.height);
    faces += Object.values(recipe.face).filter(Boolean).length;
  }
  assert.equal(seen.body.size, Object.keys(RECIPE_BODIES).length);
  assert.equal(seen.skin.size, Object.keys(SKIN_TONES).length);
  assert.equal(seen.hairStyle.size, Object.keys(HAIRSTYLE_OPTIONS).length);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  assert.ok(Math.abs(mean(heights.feminine) - RECIPE_HEIGHT.typical.feminine) < 2 && Math.abs(mean(heights.masculine) - RECIPE_HEIGHT.typical.masculine) < 2);
  assert.ok(Math.min(...heights.feminine) >= RECIPE_HEIGHT.min && Math.max(...heights.masculine) <= RECIPE_HEIGHT.max);
  const perFace = faces / 600;
  assert.ok(perFace > 5 && perFace < 11, `about half the features differ from the base face (${perFace.toFixed(1)})`);
});
