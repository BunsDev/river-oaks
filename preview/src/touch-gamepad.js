// A phone gamepad in the style of modern mobile shooters: a floating thumbstick
// on the left, a free look drag for the right thumb (the scene already owns it)
// and an action cluster under the right thumb. The stick never invents analog
// movement: it presses the same held keys as the keyboard and the button pad,
// so walking, riding and flight keep their existing, server-checked contracts.

export const STICK = Object.freeze({ radius: 56, deadzone: 0.22, sprintPull: 1.45 });

// sin(22.5°): each of the eight directions owns a 45° sector.
const AXIS = Math.sin(Math.PI / 8);
// Sprint locks only on a near-vertical upward pull (within ~23° of straight up).
const SPRINT_AIM = Math.cos(Math.PI / 7.8);

/**
 * Held keys for a stick displaced (dx, dy) screen pixels from its centre.
 * Pulling straight up past the ring (sprintPull × radius) locks sprint, as in
 * CoD Mobile; the lock holds while the stick still points forward and ends when
 * it returns to the dead zone, turns away from forward or is released.
 */
export function stickInput(dx, dy, { radius = STICK.radius, deadzone = STICK.deadzone, sprintPull = STICK.sprintPull } = {}, sprintLocked = false) {
  const length = Math.hypot(dx, dy);
  const keys = [];
  if (!(length / radius >= deadzone)) return { keys, magnitude: length / radius || 0, sprintLocked: false, knob: [dx, dy] };
  const ax = dx / length, ay = -dy / length;
  if (ay > AXIS) keys.push('KeyW');
  if (ay < -AXIS) keys.push('KeyS');
  if (ax < -AXIS) keys.push('KeyA');
  if (ax > AXIS) keys.push('KeyD');
  const sprint = keys.includes('KeyW') && (sprintLocked || (ay >= SPRINT_AIM && length >= radius * sprintPull));
  if (sprint) keys.push('ShiftLeft');
  const scale = length > radius ? radius / length : 1;
  return { keys, magnitude: Math.min(length / radius, 1), sprintLocked: sprint, knob: [dx * scale, dy * scale] };
}

/**
 * The gamepad's press state without the DOM: one stick finger and any number of
 * held buttons merge into one set of held keys. onKeys(Set) hears every change.
 */
export function createGamepadState({ onKeys = () => {}, stick = STICK } = {}) {
  const stickKeys = new Set(), buttonKeys = new Map();
  let held = new Set(), owner = null, sprintLocked = false;
  const publish = () => {
    const next = new Set([...stickKeys, ...buttonKeys.values()]);
    if (next.size === held.size && [...next].every(key => held.has(key))) return;
    held = next; onKeys(new Set(next));
  };
  const dropStick = () => { owner = null; sprintLocked = false; stickKeys.clear(); };
  return {
    get held() { return new Set(held); },
    get sprintLocked() { return sprintLocked; },
    get stickOwner() { return owner?.id ?? null; },
    /** A second finger cannot take over a stick that is already held. */
    stickDown(id, x, y) { if (owner) return false; owner = { id, x, y }; return true; },
    /** Returns the knob offset to paint, or null when the pointer does not own the stick. */
    stickMove(id, x, y) {
      if (owner?.id !== id) return null;
      const result = stickInput(x - owner.x, y - owner.y, stick, sprintLocked);
      sprintLocked = result.sprintLocked;
      stickKeys.clear(); result.keys.forEach(key => stickKeys.add(key));
      publish(); return result.knob;
    },
    stickUp(id) { if (owner?.id !== id) return false; dropStick(); publish(); return true; },
    hold(token, key) { if (buttonKeys.has(token)) return false; buttonKeys.set(token, key); publish(); return true; },
    release(token) { if (!buttonKeys.delete(token)) return false; publish(); return true; },
    /** Release everything and report it. */
    releaseAll() { dropStick(); buttonKeys.clear(); publish(); },
    /** Forget everything silently; the caller has already cleared its own keys. */
    reset() { dropStick(); buttonKeys.clear(); held = new Set(); },
  };
}

const svg = path => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${path}"/></svg>`;

/**
 * createTouchGamepad({ onKeys, onUse, canStart }) → { element, reset, setMode, setUse, setEnabled, held }
 * onUse() runs the contextual action. canStart() gates new presses (inactive
 * scene, open dialogue).
 */
export function createTouchGamepad({ onKeys = () => {}, onUse = () => {}, canStart = () => true, stick = STICK } = {}) {
  const element = document.createElement('div');
  element.className = 'touch-gamepad';
  element.hidden = true;
  element.innerHTML = `<div class="touch-stick-zone" aria-hidden="true"><div class="touch-stick-base"><div class="touch-stick-knob"></div><span class="touch-stick-sprint">Sprint</span></div></div>`
    + `<div class="touch-actions" role="group" aria-label="Touch actions">`
    + `<button type="button" class="touch-action touch-use" data-gamepad-use hidden><span>Use</span></button>`
    + `<button type="button" class="touch-action touch-rise" data-gamepad-hold="Space" aria-label="Hold to rise" hidden>${svg('M10 15V5M5.5 9.5 10 5l4.5 4.5')}</button>`
    + `<button type="button" class="touch-action touch-lower" data-gamepad-hold="KeyC" aria-label="Hold to lower" hidden>${svg('M10 5v10M5.5 10.5 10 15l4.5-4.5')}</button>`
    + `</div>`;
  const zone = element.querySelector('.touch-stick-zone');
  const base = element.querySelector('.touch-stick-base');
  const knob = element.querySelector('.touch-stick-knob');
  const useButton = element.querySelector('[data-gamepad-use]');
  const state = createGamepadState({ onKeys, stick });

  const paintStick = (dx = 0, dy = 0) => {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    element.dataset.sprint = String(state.sprintLocked);
    element.dataset.stick = state.stickOwner === null ? '' : 'held';
    if (state.stickOwner === null) { base.style.left = ''; base.style.top = ''; }
  };
  const unpaintButtons = () => element.querySelectorAll('.held').forEach(button => button.classList.remove('held'));

  zone.addEventListener('pointerdown', event => {
    if (event.button > 0 || !canStart() || !state.stickDown(event.pointerId, event.clientX, event.clientY)) return;
    event.preventDefault();
    const box = zone.getBoundingClientRect();
    // The stick floats to wherever the thumb lands.
    base.style.left = `${event.clientX - box.left}px`; base.style.top = `${event.clientY - box.top}px`;
    try { zone.setPointerCapture(event.pointerId); } catch { /* a synthetic pointer cannot be captured */ }
    paintStick();
  });
  zone.addEventListener('pointermove', event => {
    const knobAt = state.stickMove(event.pointerId, event.clientX, event.clientY);
    if (knobAt) paintStick(...knobAt);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    zone.addEventListener(type, event => { if (state.stickUp(event.pointerId)) paintStick(); });
  }

  // Hold buttons press on pointerdown so a second finger works while the left
  // thumb holds the stick (a second-finger tap never produces a click).
  element.querySelectorAll('[data-gamepad-hold]').forEach(button => {
    const key = button.dataset.gamepadHold;
    const press = () => { if (canStart() && state.hold(button, key)) { button.classList.add('held'); return true; } return false; };
    const release = () => { if (state.release(button)) button.classList.remove('held'); };
    button.addEventListener('pointerdown', event => {
      if (!press()) return;
      event.preventDefault();
      try { button.setPointerCapture(event.pointerId); } catch { /* synthetic pointer */ }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    button.addEventListener('keydown', event => {
      if (event.repeat || !['Enter', 'Space'].includes(event.code)) return;
      event.preventDefault(); event.stopPropagation(); press();
    });
    button.addEventListener('keyup', event => { if (['Enter', 'Space'].includes(event.code)) { event.stopPropagation(); release(); } });
    button.addEventListener('blur', release);
  });

  // Use fires on the press itself, for the same second-finger reason; keyboard
  // and assistive activation arrive as a click with no preceding press.
  let pressedUse = false;
  useButton.addEventListener('pointerdown', event => {
    if (!canStart()) return;
    event.preventDefault(); pressedUse = true; onUse();
  });
  useButton.addEventListener('click', event => {
    if (pressedUse) { pressedUse = false; event.preventDefault(); return; }
    if (canStart()) onUse();
  });

  return {
    element,
    get held() { return state.held; },
    /** Drop every press without reporting it; the caller has already cleared its keys. */
    reset() { state.reset(); unpaintButtons(); paintStick(); },
    /** Rise and Lower appear only where Space and C do something (flight, the Ribbonwing). */
    setMode({ lift = false } = {}) {
      for (const button of element.querySelectorAll('[data-gamepad-hold]')) {
        if (button.hidden === !lift) continue;
        button.hidden = !lift;
        if (!lift && state.release(button)) button.classList.remove('held');
      }
    },
    /** The contextual action (talk, sit, step inside…) the Use button runs, or null. */
    setUse(label) {
      useButton.hidden = !label;
      if (label && useButton.getAttribute('aria-label') !== label) {
        useButton.setAttribute('aria-label', label);
        useButton.firstElementChild.textContent = label.length > 14 ? 'Use' : label;
      }
    },
    setEnabled(enabled) {
      if (element.hidden === !enabled) return;
      element.hidden = !enabled;
      if (!enabled) { state.releaseAll(); unpaintButtons(); paintStick(); }
    },
  };
}
