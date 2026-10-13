// The sign-in page's copy of modal-dismiss.js. Everything the access entry loads must
// be served before sign-in, and a module it shares with any other chunk (game, World
// Studio, even the problem report it loads lazily) is split into a chunk the asset gate
// refuses (scripts/check-access-entry.mjs). So only access-entry.js imports this
// import-free copy, and hands it to the problem report (debug-report-ui.js);
// preview/tests/modal-dismiss.test.js holds both copies to the same behaviour.
// Native dialog backdrops target the dialog itself, just like its padding.
// Check bounds and both ends of the gesture so selecting or dragging out of a
// modal never dismisses it. Keep each caller's existing close/focus cleanup.
export function dismissOnOutsideClick(surface, dismiss, content = surface) {
  let startedOutside = false;
  const outside = event => {
    if (event.target !== surface) return false;
    const { left, right, top, bottom } = content.getBoundingClientRect();
    return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
  };
  const reset = () => { startedOutside = false; };
  surface.addEventListener('pointerdown', event => {
    startedOutside = event.isPrimary && event.button === 0 && outside(event);
  }, true);
  surface.addEventListener('pointercancel', reset);
  surface.addEventListener('close', reset);
  surface.addEventListener('click', event => {
    const dismissible = startedOutside && event.button === 0 && outside(event);
    reset();
    if (!dismissible) return;
    event.preventDefault(); event.stopPropagation();
    dismiss();
  });
}
