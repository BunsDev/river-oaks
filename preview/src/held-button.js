// Handle native button activation ourselves: Enter repeat and a stale Space
// keyup must not synthesize a new held action after the page releases input.
export function bindHeldButton(button, { press, release, schedule = setTimeout, cancel = clearTimeout }) {
  let timer = null, pressed = false;
  const clear = () => { if (timer !== null) cancel(timer); timer = null; pressed = false; release(); };
  const activation = event => event.code === 'Enter' || event.code === 'Space';
  button.addEventListener('keydown', event => {
    if (!activation(event)) return;
    event.preventDefault();
    if (!event.repeat) {
      clear(); pressed = true; press();
      // Keep the existing short pulse for taps that end before a frame draws;
      // a held key continues until keyup, while lifecycle clear cancels both.
      timer = schedule(() => { timer = null; if (!pressed) release(); }, 180);
    }
  });
  button.addEventListener('keyup', event => {
    if (!activation(event)) return;
    event.preventDefault(); pressed = false; if (timer === null) release();
  });
  button.addEventListener('blur', clear);
  // Screen readers can activate a button without a keyboard event.
  button.addEventListener('click', event => {
    if (event.detail !== 0) return;
    clear(); press(); timer = schedule(clear, 180);
  });
  return clear;
}
