import { savePlayMode, selectedPlayMode, switchPlayMode } from './multiplayer-mode.js';

// The single player or multiplayer control. `active` is the mode this tab is
// running, which can differ from the stored choice: another tab may have
// changed that since this page loaded. Choosing the other mode hands it to
// `onChange`, which stores it and reloads. Choosing the running mode only
// brings the remembered choice back in line with this tab.
export function createPlayMode({ viewport, storage = null, active = 'solo', remembered = true, onChange = mode => switchPlayMode(storage, mode) }) {
  const control = document.createElement('div');
  control.className = 'play-mode';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'play-mode-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'play-mode-options');
  const options = document.createElement('div');
  options.id = 'play-mode-options';
  options.className = 'play-mode-options';
  options.hidden = true;
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', 'Play mode');
  const close = () => { options.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
  const buttons = ['solo', 'multiplayer'].map(mode => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.playMode = mode;
    button.textContent = mode === 'solo' ? 'Single player' : 'Multiplayer';
    button.addEventListener('click', () => {
      if (mode !== active) { onChange(mode); return; }
      if (selectedPlayMode(storage) !== mode) savePlayMode(storage, mode);
      close();
    });
    return button;
  });
  const note = document.createElement('p');
  note.textContent = remembered
    ? 'An approved Google or GitHub sign-in is required for either mode. Single player stays on this device.'
    : 'This browser did not save your choice, so it lasts for this visit. An approved Google or GitHub sign-in is required for either mode.';
  options.append(...buttons, note);
  control.append(toggle, options);
  viewport.append(control);
  const refresh = () => {
    toggle.textContent = active === 'solo' ? 'Single player · Change' : 'Multiplayer · Change';
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.playMode === active)));
  };
  toggle.addEventListener('click', () => {
    options.hidden = !options.hidden;
    toggle.setAttribute('aria-expanded', String(!options.hidden));
    if (!options.hidden) buttons.find(button => button.dataset.playMode === active)?.focus();
  });
  control.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !options.hidden) { close(); toggle.focus(); }
  });
  document.addEventListener('click', event => { if (!control.contains(event.target)) close(); });
  refresh();
  return { refresh };
}
