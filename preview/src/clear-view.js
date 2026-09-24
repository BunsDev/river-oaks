// Clear view hides the floating HUD cards so the street can be seen whole.
// Conversations, the rail and this toggle stay; H or the chip brings it back.
// It is a per-visit choice and is not remembered.
export function createClearView({ viewport, onChange = () => {} }) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'clear-view-toggle'; button.setAttribute('aria-pressed', 'false');
  button.innerHTML = '<span>Clear view</span><kbd>H</kbd>';
  viewport.append(button);
  let active = false;
  const set = next => {
    active = Boolean(next);
    document.body.classList.toggle('clear-view', active);
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('span').textContent = active ? 'Show controls' : 'Clear view';
    button.title = active ? 'Show the visit controls (H)' : 'Hide the visit controls (H)';
    onChange(active);
  };
  button.addEventListener('click', () => set(!active));
  // Anywhere on the page except where H is typed: the walk can move focus off
  // the canvas, and the chip itself should answer its own shortcut.
  const typing = target => target instanceof Element && target.closest('input, textarea, select, [contenteditable=""], [contenteditable=true]');
  document.addEventListener('keydown', event => {
    if (event.code !== 'KeyH' || event.repeat || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
    if (!document.body.classList.contains('walking') && !active) return;
    event.preventDefault(); set(!active);
  });
  set(false);
  return { element: button, get active() { return active; }, set };
}
