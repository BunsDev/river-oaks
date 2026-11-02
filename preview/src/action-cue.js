// A polite screen-reader cue for the walking HUD's contextual action. The action button appears
// and changes as you walk; the cue names it only after it has held still for `delay` ms, and
// never repeats the same action. Clearing is silent.
export function createActionCue({ element, delay = 600, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let pending = null, spoken = '';
  return {
    update(label, key = null) {
      const text = label ? `In reach: ${label}.${key ? ` Press ${key}.` : ''}` : '';
      if (pending?.text === text) return; // already waiting on this one: repeats do not restart the clock
      if (pending) { clearTimer(pending.timer);pending = null; }
      if (text === spoken) return;
      if (!text) { spoken = '';element.textContent = '';return; }
      const fire = () => { pending = null;spoken = text;element.textContent = text; };
      pending = { text, fire, timer: setTimer(fire, delay) };
    },
  };
}

// [label, key] for an action button such as `Sit on the bench <kbd>Z</kbd>`.
export function actionCueLabel(button) {
  const key = button.querySelector?.('kbd')?.textContent?.trim() || null;
  const label = button.getAttribute?.('aria-label') || [...button.childNodes].filter(node => node.nodeName !== 'KBD').map(node => node.textContent).join('').replace(/\s+/g, ' ').trim();
  return [label, key];
}

// Rewrite a live region only when its words change: replacing the same text re-queues it for a
// screen reader. `render` builds rich content; it runs only on a change. Returns whether it wrote.
export function writeLive(node, text, render = () => { node.textContent = text; }) {
  if (node.textContent === text) return false;
  render();
  return true;
}
