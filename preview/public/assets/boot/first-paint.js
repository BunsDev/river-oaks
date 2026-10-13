// Runs in <head> before anything paints (a classic script: the CSP allows no inline ones).
// It applies the visitor's own theme, and marks a browser that entered the district last
// time as returning, so the page opens on a quiet splash in that theme instead of flashing
// white, then the dark sign-in art, then the game. access-entry.js clears the mark whenever
// the sign-in gate is actually needed.
(() => {
  const root = document.documentElement;
  let preference = 'system', returning = false;
  try {
    preference = localStorage.getItem('river-oaks-appearance') ?? 'system';
    returning = localStorage.getItem('river-oaks-entered') === '1';
  } catch { /* Storage may be disabled: the sign-in gate shows as usual. */ }
  const dark = preference === 'dark' || (preference !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  if (returning) root.dataset.returning = '';
})();
