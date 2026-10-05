import { isGameplayKey } from './keyboard-input.js';
// Clear view hides the floating HUD cards so the street can be seen whole.
// Conversations, the rail and Commands stay; H or Commands brings it back.
// It is a per-visit choice and is not remembered.
export function createClearView({ onChange = () => {} } = {}) {
  let active = false;
  const set = next => {
    active = Boolean(next);
    // H can be pressed from a focused card button, not just from the world.
    // Return focus to the visible way back before hiding that card.
    if(active&&document.activeElement?.closest('.visit-tools, .auto-controls, .walking-console'))document.querySelector('.commands-toggle')?.focus({preventScroll:true});
    document.body.classList.toggle('clear-view', active);
    onChange(active);
  };
  // Anywhere on the page except where H is typed: the walk can move focus off
  // the canvas, and the Commands trigger should answer its own shortcut.
  const typing = target => target instanceof Element && target.closest('input, textarea, select, [contenteditable=""], [contenteditable=true]');
  document.addEventListener('keydown', event => {
    if (event.code !== 'KeyH' || !isGameplayKey(event) || event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
    if (!document.body.classList.contains('walking') && !active) return;
    event.preventDefault(); set(!active);
  });
  set(false);
  return { get active() { return active; }, set };
}
