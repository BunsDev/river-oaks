// The Studio follows the app's resolved theme (theme.js writes it to
// <html data-theme> from System, Light or Dark; System follows the OS). The live
// preview's backdrop, pedestal and ground bounce change with it. Portrait
// exports keep their own fixed preset (character-hero.js) so captures stay
// comparable whichever theme the Studio is showing.
export const STUDIO_BACKDROPS = Object.freeze({
  light: Object.freeze({
    neutral: Object.freeze({ background: '#cbd8d1', pedestal: '#a8bdb2', ground: '#64766d' }),
    warm: Object.freeze({ background: '#dfcdbb', pedestal: '#b9a592', ground: '#76665a' }),
  }),
  dark: Object.freeze({
    neutral: Object.freeze({ background: '#1b2724', pedestal: '#33443e', ground: '#2a3632' }),
    warm: Object.freeze({ background: '#2a211b', pedestal: '#4a3b31', ground: '#3a2f27' }),
  }),
});

export const studioTheme = (root = globalThis.document?.documentElement) => root?.dataset?.theme === 'dark' ? 'dark' : 'light';

export function studioBackdrop(theme = 'light', lighting = 'neutral') {
  const palette = STUDIO_BACKDROPS[theme === 'dark' ? 'dark' : 'light'];
  return palette[lighting === 'warm' ? 'warm' : 'neutral'];
}

// Calls back with the resolved theme now and whenever the app's appearance changes.
export function watchStudioTheme(callback, { document = globalThis.document } = {}) {
  if (!document) { callback('light'); return () => {}; }
  const listener = () => callback(studioTheme(document.documentElement));
  document.addEventListener('appearancechange', listener);
  listener();
  return () => document.removeEventListener('appearancechange', listener);
}
