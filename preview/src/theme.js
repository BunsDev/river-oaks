export function normalizeThemePreference(value) {
  return ['system', 'light', 'dark'].includes(value) ? value : 'system';
}

export function resolveTheme(preference, systemIsDark) {
  const normalized = normalizeThemePreference(preference);
  return normalized === 'system' ? (systemIsDark ? 'dark' : 'light') : normalized;
}

export function setupThemeControls() {
  const storageKey = 'river-oaks-appearance';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const buttons = [...document.querySelectorAll('[data-theme-preference]')];
  let preference = 'system';
  try { preference = normalizeThemePreference(localStorage.getItem(storageKey)); } catch { /* Storage may be disabled; System still works. */ }
  const apply = () => {
    const resolved = resolveTheme(preference, media.matches);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved;
    buttons.forEach((button) => {
      const selected = button.dataset.themePreference === preference;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('active', selected);
    });
    document.dispatchEvent(new CustomEvent('appearancechange', { detail: { preference, resolved } }));
  };
  buttons.forEach((button) => button.addEventListener('click', () => {
    preference = normalizeThemePreference(button.dataset.themePreference);
    try { localStorage.setItem(storageKey, preference); } catch { /* Keep the active choice for this page session. */ }
    apply();
  }));
  media.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) {
      preference = normalizeThemePreference(event.newValue);
      apply();
    }
  });
  apply();
}
