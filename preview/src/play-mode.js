import { savePlayMode, selectedPlayMode } from './multiplayer-mode.js';
import './play-mode.css';

export function createPlayMode({ viewport, storage = null, onChange = () => location.reload() }) {
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
  const buttons = ['solo', 'multiplayer'].map(mode => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.playMode = mode;
    button.textContent = mode === 'solo' ? 'Single player' : 'Multiplayer';
    button.addEventListener('click', () => {
      if (selectedPlayMode(storage) !== mode) {
        if (savePlayMode(storage, mode)) onChange(mode);
        else note.textContent = 'Allow site storage to remember your play mode.';
      } else close();
    });
    return button;
  });
  const note = document.createElement('p');
  note.textContent = 'Multiplayer may ask you to sign in with WorkOS. Single player stays on this device.';
  options.append(...buttons, note);
  control.append(toggle, options);
  viewport.append(control);
  const refresh = () => {
    const mode = selectedPlayMode(storage);
    toggle.textContent = mode === 'solo' ? 'Single player · Change' : 'Multiplayer · Change';
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.playMode === mode)));
  };
  const close = () => { options.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
  toggle.addEventListener('click', () => {
    options.hidden = !options.hidden;
    toggle.setAttribute('aria-expanded', String(!options.hidden));
    if (!options.hidden) buttons.find(button => button.dataset.playMode === selectedPlayMode(storage))?.focus();
  });
  control.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !options.hidden) { close(); toggle.focus(); }
  });
  document.addEventListener('click', event => { if (!control.contains(event.target)) close(); });
  refresh();
  return { refresh };
}
