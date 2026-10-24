// Reuse the glass surface, without closing an open sheet or taking focus on
// loss. A modal dialog owns focus/inertness, so its notice lives inside it.
export function createGraphicsRecoveryUI({ viewport, focusTarget, retry }) {
  const panel = document.createElement('aside'); panel.id = 'graphics-recovery'; panel.className = 'graphics-recovery'; panel.hidden = true;
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Reload graphics'; button.hidden = true;
  let previousFocus = null, state = 'ok';
  const mount = () => {
    const parent = [...document.querySelectorAll('dialog[open]')].at(-1) ?? viewport;
    if (panel.parentNode === parent) return;
    const focused = panel.contains(document.activeElement) ? document.activeElement : null;
    parent.append(panel);
    focused?.focus({ preventScroll: true });
  };
  const dialogs = new MutationObserver(mount);
  button.addEventListener('click', () => { if (state === 'failed') retry(); });
  panel.append(status, button); viewport.append(panel);
  return {
    // A failure that did not lower quality (a loss that began in the background)
    // must not claim that it did.
    update(next, reason, stepDown = true) {
      state = next;
      if (next === 'ok') {
        dialogs.disconnect();
        if (panel.contains(document.activeElement)) (previousFocus?.isConnected && previousFocus.getClientRects().length ? previousFocus : focusTarget)?.focus({ preventScroll: true });
        panel.hidden = true; button.hidden = true; return;
      }
      if (panel.hidden) {
        previousFocus = document.activeElement;
        mount();
        dialogs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
      }
      panel.hidden = false; panel.dataset.state = next;
      status.textContent = next === 'failed' ? `Graphics could not be restored. Your player has not been signed out. ${stepDown ? 'Try again with lower graphics settings.' : 'Try again.'}` : 'Restoring graphics…';
      if (next === 'failed' && reason === 'photo') status.textContent = 'Your photo and framing are still here. Download any photo you want to keep, then discard it and close Photo mode before reloading graphics.';
      if (next === 'failed' && reason === 'dialog') status.textContent = 'Your open sheet is still here. Finish or close it before reloading graphics.';
      if (next === 'failed' && reason === 'storage') status.textContent = 'This browser could not save your open settings and draft. They are still here; graphics have not been reloaded.';
      if (next === 'failed') button.hidden = false;
      // Keep the focused button in the document during a retry.
      button.setAttribute('aria-disabled', String(next !== 'failed'));
    },
  };
}
