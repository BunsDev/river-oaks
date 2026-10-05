// Navigation shortcuts and browser/system chords must never become game actions.
export function isGameplayKey(event) {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing
    && !event.getModifierState?.('AltGraph')
    && !event.target.ownerDocument?.querySelector('.app-shell[inert]')
    && !event.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable=false]),dialog[open],[aria-modal=true],[inert]');
}

// Physical codes also work when Option changes the printed character on macOS.
export function railShortcut(event) {
  if (event.isComposing || event.getModifierState?.('AltGraph')) return null;
  const primary = event.metaKey || event.ctrlKey;
  if (primary && !event.altKey) {
    if (event.code === 'KeyB') return event.shiftKey ? 'play' : 'rail';
    if (event.code === 'KeyK' && !event.shiftKey) return 'commands';
  }
  if (primary) return null;
  if (event.altKey && !event.shiftKey && /^Digit[123]$/.test(event.code)) return `tab-${Number(event.code.slice(-1)) - 1}`;
  if (event.altKey) return null;
  if (event.key === '?') return 'commands';
  if (event.code === 'Slash' && !event.shiftKey) return 'search';
  return null;
}
