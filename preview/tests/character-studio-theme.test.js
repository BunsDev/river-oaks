import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STUDIO_BACKDROPS, studioBackdrop, studioTheme, watchStudioTheme } from '../src/character-studio-theme.js';

// A stand-in for the page: theme.js writes <html data-theme> and dispatches appearancechange.
function page(theme) {
  const target = new EventTarget();
  target.documentElement = { dataset: { theme } };
  return target;
}

test('the Studio follows the resolved app theme, live, and stops listening when closed', () => {
  const document = page('dark'), seen = [];
  const stop = watchStudioTheme(theme => seen.push(theme), { document });
  assert.deepEqual(seen, ['dark'], 'the first paint already uses the current theme');
  document.documentElement.dataset.theme = 'light';
  document.dispatchEvent(new Event('appearancechange'));
  assert.deepEqual(seen, ['dark', 'light'], 'a system or Settings change repaints the open Studio');
  stop();
  document.documentElement.dataset.theme = 'dark';
  document.dispatchEvent(new Event('appearancechange'));
  assert.deepEqual(seen, ['dark', 'light'], 'a closed Studio no longer listens');
  assert.equal(studioTheme({ dataset: {} }), 'light', 'before theme.js runs the Studio stays light');
});

test('each theme has a neutral and a warm backdrop; dark is dark and keeps the light theme\'s choices apart', () => {
  const luminance = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return .2126 * r + .7152 * g + .0722 * b;
  };
  assert.equal(studioBackdrop().background, '#cbd8d1', 'the light neutral backdrop is unchanged');
  assert.equal(studioBackdrop('light', 'warm').background, '#dfcdbb');
  for (const lighting of ['neutral', 'warm']) {
    const dark = studioBackdrop('dark', lighting), light = studioBackdrop('light', lighting);
    assert.ok(luminance(dark.background) < .03, `${lighting} dark backdrop is dark`);
    assert.ok(luminance(light.background) > .5, `${lighting} light backdrop is light`);
    assert.ok(luminance(dark.pedestal) > luminance(dark.background), 'the pedestal stays visible against the dark backdrop');
  }
  assert.notEqual(studioBackdrop('dark', 'warm').background, studioBackdrop('dark').background, 'warm lighting still reads warm in dark mode');
  assert.deepEqual(studioBackdrop('sepia', 'nonsense'), STUDIO_BACKDROPS.light.neutral, 'unknown values fall back to light neutral');
});

test('dark Studio text and controls meet WCAG AA contrast on their own surfaces', () => {
  const css = readFileSync(new URL('../src/character-studio.css', import.meta.url), 'utf8');
  const block = css.match(/:root\[data-theme=dark\] \.character-studio\{([^}]*)\}/)?.[1];
  assert.ok(block, 'the dark Studio tokens exist');
  const token = name => block.match(new RegExp(`--cs-${name}:(#[0-9a-f]{6})`))?.[1];
  const luminance = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return .2126 * r + .7152 * g + .0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  const pairs = [
    ['ink on paper', token('ink'), token('paper')], ['ink on raised', token('ink'), token('raised')], ['ink on selected', token('ink'), token('selected')],
    ['muted on paper', token('muted'), token('paper')], ['muted on raised', token('muted'), token('raised')],
    ['muted on the stage', token('muted'), studioBackdrop('dark').background], ['white on the primary action', '#ffffff', '#3f8070'],
  ];
  for (const [label, foreground, background] of pairs) {
    assert.ok(foreground && background, `${label}: colours resolved`);
    assert.ok(ratio(foreground, background) >= 4.5, `${label}: ${ratio(foreground, background).toFixed(2)} < 4.5`);
  }
});
