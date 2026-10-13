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
