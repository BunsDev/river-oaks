import { EYE_COLORS, FACE_CONTROLS, FACE_FEATURES, FACE_STEP, HAIR_SHADES, HAIRSTYLE_OPTIONS, OUTFIT_COLORS, RECIPE_BODIES, RECIPE_CATEGORIES, RECIPE_FRAMES, RECIPE_HEIGHT, SHOE_COLORS, SKIN_TONES } from './character-recipe.js';

// The Studio's Make your own controls. Every control is generated from the
// recipe catalogue, so it can only offer what the definition contract accepts.
// Names keep the Studio's `cs-` prefix; render() mirrors the staged recipe, so a
// rejected or undone choice snaps back like the authored controls.
export const RECIPE_CATEGORY_LABELS = Object.freeze({ body: 'Body', height: 'Height', face: 'Face', skin: 'Skin', eyes: 'Eyes', hair: 'Hair', outfit: 'Outfit colour', shoes: 'Shoes' });
const DICE = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="7" r="1.3"/><circle cx="13" cy="13" r="1.3"/><circle cx="10" cy="10" r="1.3"/></svg>';
const LOCK = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" stroke-width="1.6" data-shackle/></svg>';
const AS_MADE = 'repeating-conic-gradient(#d9d2c3 0 25%,#9fb3a7 0 50%) 50%/12px 12px';
const tools = category => `<div class="cs-tools"><button type="button" data-roll="${category}" aria-label="Roll ${RECIPE_CATEGORY_LABELS[category].toLowerCase()}" title="Roll ${RECIPE_CATEGORY_LABELS[category].toLowerCase()}">${DICE}</button><button type="button" data-lock="${category}" aria-pressed="false" aria-label="Keep ${RECIPE_CATEGORY_LABELS[category].toLowerCase()} when surprising" title="Keep when surprising">${LOCK}</button></div>`;
const swatches = (name, options, field) => `<div class="cs-swatches">${Object.entries(options).map(([id, item]) => `<label class="cs-swatch" data-${field}="${id}" title="${item.label}" style="--cs-swatch:${item.color ?? AS_MADE}"><input type="radio" name="cs-${name}" value="${id}" aria-label="${item.label}"></label>`).join('')}</div>`;
// The dice and lock sit beside the legend but outside the fieldset: inside, absolute positions start below the
// legend, over the category's first row; inside the legend, they would join the group's name.
const category = (id, body) => `<div class="cs-category" data-category="${id}"><fieldset><legend>${RECIPE_CATEGORY_LABELS[id]}</legend>${body}</fieldset>${tools(id)}</div>`;
const slider = control => `<label class="cs-slider"><span>${control.label}</span><input type="range" name="cs-face-${control.id}" min="${control.low ? -100 : 0}" max="100" step="${FACE_STEP}" aria-label="${FACE_FEATURES[control.feature]} ${control.label.toLowerCase()}"><output data-face-value="${control.id}"></output></label>`;

export function recipeMarkup() {
  return `<div class="cs-create" data-cs-create hidden>
    ${category('body', `<div class="cs-segments" data-cs-frames>${Object.entries(RECIPE_FRAMES).map(([id, frame]) => `<label><input type="radio" name="cs-frame" value="${id}"><span>${frame.label}</span></label>`).join('')}</div>
      <div class="cs-segments cs-outfits" data-cs-bodies>${Object.entries(RECIPE_BODIES).map(([id, body]) => `<label data-frame="${body.frame}"><input type="radio" name="cs-body" value="${id}"><span>${body.outfit}</span></label>`).join('')}</div>`)}
    ${category('height', `<label class="cs-slider cs-height"><span>Height</span><input type="range" name="cs-height" min="${RECIPE_HEIGHT.min}" max="${RECIPE_HEIGHT.max}" step="1" aria-label="Height"><output data-height-value></output></label>`)}
    ${category('face', `<div class="cs-face">${Object.entries(FACE_FEATURES).map(([feature, label]) => `<div class="cs-feature"><p>${label}</p>${FACE_CONTROLS.filter(control => control.feature === feature).map(slider).join('')}</div>`).join('')}</div>`)}
    ${category('skin', `${swatches('skin', SKIN_TONES, 'skin')}<p data-recipe-name="skin"></p>`)}
    ${category('eyes', `${swatches('eyes', EYE_COLORS, 'eyes')}<p data-recipe-name="eyes"></p>`)}
    ${category('hair', `<div class="cs-segments cs-hairstyles">${Object.entries(HAIRSTYLE_OPTIONS).map(([id, style]) => `<label><input type="radio" name="cs-hairstyle" value="${id}"><span>${style.label}</span></label>`).join('')}</div>${swatches('haircolor', HAIR_SHADES, 'haircolor')}<p data-recipe-name="hair"></p>`)}
    ${category('outfit', `${swatches('outfitcolor', OUTFIT_COLORS, 'outfitcolor')}<p data-recipe-name="outfit"></p>`)}
    ${category('shoes', `${swatches('shoecolor', SHOE_COLORS, 'shoecolor')}<p data-recipe-name="shoes"></p>`)}
  </div>`;
}

// The draft edit a changed control asks for, or null for a control that is not the recipe's.
export function recipeEdit(input, recipe) {
  const name = input.name ?? '', value = input.value;
  if (name.startsWith('cs-face-')) return { face: { [name.slice(8)]: Number(value) } };
  switch (name) {
    case 'cs-frame': return { body: RECIPE_BODIES[recipe.body].frame === value ? recipe.body : RECIPE_BODIES[recipe.body].pair };
    case 'cs-body': return { body: value };
    case 'cs-height': return { height: Number(value) };
    case 'cs-skin': return { skin: value };
    case 'cs-eyes': return { eyes: value };
    case 'cs-hairstyle': return { hairStyle: value };
    case 'cs-haircolor': return { hairColor: value };
    case 'cs-outfitcolor': return { outfitColor: value };
    case 'cs-shoecolor': return { shoeColor: value };
    default: return null;
  }
}

const valueText = (control, value) => !value ? 'Neutral' : control.low ? `${value < 0 ? control.lowLabel : control.highLabel} ${Math.abs(value)}` : String(value);
export function renderRecipe(root, recipe, locked) {
  const body = RECIPE_BODIES[recipe.body];
  const checked = { 'cs-frame': body.frame, 'cs-body': recipe.body, 'cs-skin': recipe.skin, 'cs-eyes': recipe.eyes, 'cs-hairstyle': recipe.hairStyle, 'cs-haircolor': recipe.hairColor, 'cs-outfitcolor': recipe.outfitColor, 'cs-shoecolor': recipe.shoeColor };
  for (const input of root.querySelectorAll('input[type=radio]')) input.checked = input.value === checked[input.name];
  for (const label of root.querySelectorAll('[data-cs-bodies] label')) label.hidden = label.dataset.frame !== body.frame;
  const height = root.querySelector('[name=cs-height]');
  height.value = String(recipe.height); height.setAttribute('aria-valuetext', `${recipe.height} centimetres`);
  root.querySelector('[data-height-value]').textContent = `${recipe.height} cm`;
  for (const control of FACE_CONTROLS) {
    const input = root.querySelector(`[name=cs-face-${control.id}]`), value = recipe.face[control.id];
    input.value = String(value); input.setAttribute('aria-valuetext', valueText(control, value));
    root.querySelector(`[data-face-value=${control.id}]`).textContent = value > 0 && control.low ? `+${value}` : String(value);
  }
  const names = { skin: SKIN_TONES[recipe.skin].label, eyes: `${EYE_COLORS[recipe.eyes].label} eyes`, hair: `${HAIR_SHADES[recipe.hairColor].label} · ${HAIRSTYLE_OPTIONS[recipe.hairStyle].label}`,
    outfit: `${OUTFIT_COLORS[recipe.outfitColor].label} · ${body.outfit}`, shoes: SHOE_COLORS[recipe.shoeColor].label };
  for (const [key, text] of Object.entries(names)) root.querySelector(`[data-recipe-name=${key}]`).textContent = text;
  for (const button of root.querySelectorAll('[data-lock]')) button.setAttribute('aria-pressed', String(locked.has(button.dataset.lock)));
}

export const unlockedCategories = locked => Object.keys(RECIPE_CATEGORIES).filter(category => !locked.has(category));
