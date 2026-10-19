// The play rail's activities in menu order. Each is a top-level panel that some
// module places in the rail; the dock gives it its own tab and shows one at a time.
const icon = paths => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
export const PLAY_PANES = Object.freeze([
  { id: 'character', label: 'Character', selector: '.player-controls', icon: icon('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>') },
  { id: 'rides', label: 'Rides', selector: '.player-settings', icon: icon('<path d="M5 16h14M6.5 9.5 8 6h8l1.5 3.5M4 16v-3.5c0-1.7 1.3-3 3-3h10c1.7 0 3 1.3 3 3V16"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>') },
  { id: 'photo', label: 'Photo', selector: '.photo-tools', icon: icon('<path d="M4 8.5h3.2L9 6h6l1.8 2.5H20v10H4z"/><circle cx="12" cy="13" r="3.2"/>') },
  { id: 'cycling', label: 'Cycling', selector: '.cycling-board', icon: icon('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l2.5 7H6M13 6h3"/>') },
  { id: 'birds', label: 'Birds', selector: '.bird-cams', icon: icon('<path d="M3 13c3-1 5.5-.5 7.5 1.5C12 11 15 8.5 21 8c-2.5 1.2-4 3-4.6 5.5C15.5 17 12.7 18.5 9 18c-2.3-.3-4.4-2-6-5z"/>') },
  { id: 'guide', label: 'Game guide', selector: '.salon-guide-entry', icon: icon('<path d="M4 5.5C6.5 4.5 9.5 4.5 12 6c2.5-1.5 5.5-1.5 8-.5V18c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v12.5"/>') },
  { id: 'build', label: 'Build', selector: '.shared-build-controls', icon: icon('<path d="M4 14h7v6H4zM13 14h7v6h-7zM8.5 8h7v6h-7z"/>') },
  { id: 'office', label: 'Office', selector: '.office-panel', icon: icon('<path d="M4 8h16v11H4z"/><path d="M9 8V5.5h6V8M4 13h16"/>') },
  { id: 'more', label: 'More', selector: null, icon: icon('<circle cx="6" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18" cy="12" r="1.3" fill="currentColor"/>') },
]);
export const playPaneFor = panel => PLAY_PANES.find(pane => pane.selector && panel.matches?.(pane.selector)) ?? PLAY_PANES.at(-1);

// Tablist keys: arrows step and wrap, Home and End jump. Other keys are not ours.
export function nextPlayTab(visible, current, key) {
  if (!visible.length) return null;
  const index = visible.indexOf(current);
  if (key === 'Home') return visible[0];
  if (key === 'End') return visible.at(-1);
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  if (index < 0) return visible[0];
  return visible[(index + (key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length];
}
