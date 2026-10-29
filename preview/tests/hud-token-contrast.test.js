import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PINK_JET_AGE } from '../../shared/city-kit/catalog.js';

// HUD text and control colours as the stylesheets resolve them, checked against WCAG 2.x
// contrast without a browser. Custom properties are read from the token sheets in their
// import order (main.js), resolved per theme with selector specificity and the
// reduced-transparency, no-backdrop-filter and software-rendering variants. A translucent
// sheet is bounded the way e2e/walking-controls-contrast.js bounds it: composited over a
// pure black and a pure white world, keeping the lower ratio. The backdrop filter's
// brightness lift is ignored, so the bound is conservative.
// Inventory and gaps: docs/superpowers/plans/2026-10-29-pink-jet-age-r8-inventory.md.

const src = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');

// Sheets in the order main.js imports them; only `:root` declarations matter here.
// access-theme.css belongs to the sign-in gate (single theme, its own --gate-* names).
const CASCADE = [
  'access-theme.css', 'style.css', 'playground-theme.css', 'district-theme.css', 'immersive.css', 'sidebar.css',
  'visual-finish.css', 'retro-finish.css', 'rail-navigation.css', 'hud-glass.css', 'game-hud.css',
  'settings-dialog.css', 'play-rail-menu.css',
];

const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Index of the brace closing the block that opens at `open`, skipping quoted strings.
function closing(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") { i = css.indexOf(c, i + 1); if (i < 0) break; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error(`unbalanced block at ${open}`);
}

// Split on a separator outside parentheses and quotes.
function splitTop(text, sep) {
  const parts = []; let depth = 0, quote = null, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

// Every custom property declared on a bare `:root[...]` selector, with its at-rule conditions.
function rootDeclarations(file, css, conditions = [], out = []) {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const prelude = css.slice(i, open).replace(/^[\s;]+/, '').replace(/^@(import|charset|layer)[^;]*;\s*/g, '').trim();
    const end = closing(css, open);
    const body = css.slice(open + 1, end);
    if (/^@(media|supports)\b/.test(prelude)) rootDeclarations(file, body, [...conditions, prelude], out);
    else if (!prelude.startsWith('@')) {
      for (const selector of splitTop(prelude, ',')) {
        const match = /^:root((?:\[[^\]]+\])*)$/.exec(selector);
        if (!match) continue;
        const attrs = [...match[1].matchAll(/\[([\w-]+)(?:=["']?([\w-]+)["']?)?\]/g)].map(([, name, value]) => ({ name, value }));
        for (const declaration of splitTop(body, ';')) {
          const colon = declaration.indexOf(':');
          const prop = declaration.slice(0, colon).trim();
          if (prop.startsWith('--')) out.push({ file, prop, value: declaration.slice(colon + 1).trim(), attrs, conditions, specificity: 1 + attrs.length, order: out.length });
        }
      }
    }
    i = end + 1;
  }
  return out;
}

const DECLARATIONS = CASCADE.flatMap(name => rootDeclarations(name, stripComments(src(name))));

// The variants a player can be in. `software` is hardware-acceleration.js's data-rendering.
const SCENARIOS = ['light', 'dark'].flatMap(theme => [
  { name: `${theme}`, theme },
  { name: `${theme}+reduced-transparency`, theme, reducedTransparency: true },
  { name: `${theme}+no-backdrop-filter`, theme, noBackdropFilter: true },
  { name: `${theme}+software`, theme, software: true },
]);

const RECOGNISED = [
  [/^@media\s*\(\s*prefers-reduced-transparency\s*:\s*reduce\s*\)$/, s => !!s.reducedTransparency],
  [/^@supports\s+not\s*\(\s*\(\s*backdrop-filter/, s => !!s.noBackdropFilter],
];
const conditionHolds = (condition, scenario) => {
  const known = RECOGNISED.find(([pattern]) => pattern.test(condition));
  return known ? known[1](scenario) : false;
};
const attrHolds = ({ name, value }, scenario) => {
  const actual = { 'data-theme': scenario.theme, 'data-rendering': scenario.software ? 'software' : undefined }[name];
  return actual !== undefined && (value === undefined || value === actual);
};

function tokensFor(scenario) {
  const winners = new Map();
  for (const declaration of DECLARATIONS) {
    if (!declaration.attrs.every(attr => attrHolds(attr, scenario))) continue;
    if (!declaration.conditions.every(condition => conditionHolds(condition, scenario))) continue;
    const current = winners.get(declaration.prop);
    if (!current || declaration.specificity >= current.specificity) winners.set(declaration.prop, declaration);
  }
  return winners;
}

function resolve(value, tokens, seen = new Set()) {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_, name, fallback) => {
    if (seen.has(name)) throw new Error(`cyclic ${name}`);
    const declaration = tokens.get(name);
    if (declaration) return resolve(declaration.value, tokens, new Set([...seen, name]));
    if (fallback !== undefined) return resolve(fallback, tokens, seen);
    throw new Error(`unresolved ${name}`);
  });
}

// Colours: hex, rgb()/rgba(), a few keywords and color-mix(in srgb, ...). Channels 0-255, alpha 0-1.
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };
function parseColor(text) {
  const value = text.trim().toLowerCase();
  if (NAMED[value]) return NAMED[value];
  let match = /^#([0-9a-f]{3,8})$/.exec(value);
  if (match) {
    let hex = match[1];
    if (hex.length <= 4) hex = [...hex].map(c => c + c).join('');
    const channels = hex.match(/../g).map(pair => parseInt(pair, 16));
    return [channels[0], channels[1], channels[2], channels.length === 4 ? channels[3] / 255 : 1];
  }
  match = /^rgba?\((.*)\)$/.exec(value);
  if (match) {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(part => part.endsWith('%') ? parseFloat(part) / 100 : Number(part));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  }
  match = /^color-mix\(\s*in srgb\s*,(.*)\)$/.exec(value);
  if (match) {
    const [a, b] = splitTop(match[1], ',').map(part => {
      const pct = /\s(\d+(?:\.\d+)?)%$/.exec(part);
      return { color: parseColor(pct ? part.slice(0, pct.index) : part), pct: pct ? Number(pct[1]) / 100 : null };
    });
    const p1 = a.pct ?? (b.pct === null ? 0.5 : 1 - b.pct), p2 = b.pct ?? 1 - p1;
    const alpha = a.color[3] * p1 + b.color[3] * p2;
    const channel = i => alpha === 0 ? 0 : (a.color[i] * a.color[3] * p1 + b.color[i] * b.color[3] * p2) / alpha;
    return [channel(0), channel(1), channel(2), alpha];
  }
  throw new Error(`not a colour: ${text}`);
}

const over = (top, bottom) => [0, 1, 2].map(i => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
const luminance = color => color.slice(0, 3).map(v => v / 255)
  .reduce((sum, v, i) => sum + [0.2126, 0.7152, 0.0722][i] * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4), 0);
const ratio = (a, b) => { const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y); return (hi + 0.05) / (lo + 0.05); };

// Lowest ratio of `fg` over any of `surfaces` (each a bottom-to-top list of layers),
// with the stack composited over a black and a white world.
function contrast({ fg, surfaces }, color) {
  let lowest = Infinity;
  for (const surface of surfaces) for (const level of [0, 255]) {
    const ground = surface.reduce((under, layer) => over(color(layer), under), [level, level, level, 1]);
    lowest = Math.min(lowest, ratio(over(color(fg), ground), ground));
  }
  return lowest;
}

const TEXT = 4.5, UI = 3;
const glass = (...layers) => ['var(--hud-glass)', ...layers];
const panel = (...layers) => ['var(--panel)', ...layers];
const liquid = (...layers) => [['var(--liquid-tint)', ...layers], ['var(--liquid-tint-deep)', ...layers]];
const byTheme = (light, dark) => ({ light, dark });

// Text-on-surface pairs the HUD paints, each with the rule that paints it. A pair names the
// foreground and the stack it sits on; `min` is the WCAG threshold for that use.
const PAIRS = [
  // Smoked-glass sheets: Map/People/Settings launchers, Explore and People spaces, Play dock, walking console, chat dock.
  { id: 'sheet-ink', uses: 'sheet text', fg: 'var(--ink)', surfaces: [glass()], min: TEXT, where: 'hud-glass.css:98; game-hud.css:43,115' },
  { id: 'sheet-hud-muted', uses: 'place line, More, chat subtitle', fg: 'var(--hud-muted)', surfaces: [glass()], min: TEXT, where: 'hud-glass.css:218-219; game-hud.css:121' },
  { id: 'sheet-muted', uses: 'chat status and empty chat (legacy --muted)', fg: 'var(--muted)', surfaces: [glass()], min: TEXT, where: 'game-hud.css:131-132' },
  { id: 'tile-ink', uses: 'secondary actions, dock cards, chat messages', fg: 'var(--ink)', surfaces: [glass('var(--hud-tile)')], min: TEXT, where: 'hud-glass.css:208; play-rail-menu.css:41; game-hud.css:126' },
  { id: 'tile-hud-muted', uses: 'pane body, bird cams, disabled chat send', fg: 'var(--hud-muted)', surfaces: [glass('var(--hud-tile)')], min: TEXT, where: 'play-rail-menu.css:43,67; hud-glass.css:281' },
  { id: 'tile-hover-ink', uses: 'hovered secondary actions and tabs', fg: 'var(--ink)', surfaces: [glass('var(--hud-tile-hover)')], min: TEXT, where: 'hud-glass.css:211; play-rail-menu.css:11' },
  { id: 'raised-ink', uses: 'pane buttons, people pills, chat input, held pad', fg: 'var(--ink)', surfaces: [glass('var(--hud-raised)'), glass('var(--hud-tile)', 'var(--hud-raised)')], min: TEXT, where: 'play-rail-menu.css:44; hud-glass.css:214,275; game-hud.css:129' },
  { id: 'keycap-ink', uses: 'keycaps', fg: 'var(--ink)', surfaces: [glass('var(--hud-key-bg)'), glass('var(--hud-tile)', 'var(--hud-key-bg)')], min: TEXT, where: 'hud-glass.css:126-128,145-147' },
  { id: 'context-chip', uses: 'activity context chip', fg: 'var(--ink)', surfaces: [glass('color-mix(in srgb, var(--hud-action) 18%, transparent)')], min: TEXT, where: 'play-rail-menu.css:35' },
  { id: 'chat-accent', uses: 'chat unread count and author (accent)', fg: 'var(--accent)', surfaces: [glass(), glass('var(--hud-tile)')], min: TEXT, where: 'game-hud.css:123,127' },
  { id: 'chat-jump', uses: 'chat jump (accent on accent-soft)', fg: 'var(--accent)', surfaces: [glass('var(--accent-soft)')], min: TEXT, where: 'game-hud.css:133' },
  { id: 'action-fill', uses: 'primary prompt, selected Play tab, office enter, chat send', fg: 'var(--hud-on-action)', surfaces: [['var(--hud-action)']], min: TEXT, where: 'hud-glass.css:202; play-rail-menu.css:12,56; game-hud.css:130' },
  { id: 'action-keycap', uses: 'primary prompt keycap', fg: 'var(--hud-on-action)', surfaces: [['var(--hud-action)', 'rgb(255 255 255 / .16)']], min: TEXT, where: 'hud-glass.css:217' },
  { id: 'community-primary', uses: 'community primary (on-accent)', fg: 'var(--on-accent)', surfaces: [['var(--accent)']], min: TEXT, where: 'playground-theme.css:22; hud-glass.css:174' },
  { id: 'places-error', uses: 'places status error (raw red)', fg: byTheme('#b3261e', '#ffb4ab'), surfaces: [glass()], min: TEXT, where: 'places-guide.css:42,138-139' },
  { id: 'movement-legend', uses: 'movement legend (raw #c9c5d2)', fg: '#c9c5d2', surfaces: [glass()], min: TEXT, where: 'visual-finish.css:238 on hud-glass.css:92' },
  { id: 'sheet-focus', uses: 'focus ring on sheets', fg: 'var(--hud-focus)', surfaces: [glass(), glass('var(--hud-tile)')], min: UI, where: 'hud-glass.css:109-113; game-hud.css:141-142' },
  // Map button and town gate: liquid glass (a gradient between the two tints).
  { id: 'map-button-ink', uses: 'Map button label (liquid glass)', fg: 'var(--liquid-ink)', surfaces: liquid(), min: TEXT, where: 'game-hud.css:53-55' },
  { id: 'map-button-keycap', uses: 'Map button keycap (--muted on liquid glass)', fg: 'var(--muted)', surfaces: liquid(), min: TEXT, where: 'game-hud.css:49,53-55' },
  { id: 'gate-town-muted', uses: 'town gate body text', fg: 'var(--liquid-muted)', surfaces: liquid(), min: TEXT, where: 'multiplayer.css:13,32' },
  { id: 'gate-town-well', uses: 'town gate status well and buttons', fg: 'var(--liquid-ink)', surfaces: liquid('var(--liquid-well)'), min: TEXT, where: 'multiplayer.css:36,43' },
  { id: 'gate-town-primary', uses: 'town gate primary action', fg: 'var(--liquid-on-accent)', surfaces: [['color-mix(in srgb, var(--liquid-accent) 82%, #fff)'], ['var(--liquid-accent)']], min: TEXT, where: 'multiplayer.css:41' },
  { id: 'gate-town-kicker', uses: 'town gate kicker (raw pink)', fg: byTheme('#7d2449', '#f2a6c8'), surfaces: liquid(), min: TEXT, where: 'multiplayer.css:27-28' },
  // Settings dialog: an opaque panel.
  { id: 'settings-ink', uses: 'settings text', fg: 'var(--ink)', surfaces: [panel()], min: TEXT, where: 'game-hud.css:90' },
  { id: 'settings-muted', uses: 'settings header, idle tabs, footer', fg: 'var(--muted)', surfaces: [panel()], min: TEXT, where: 'game-hud.css:95,101,108' },
  { id: 'settings-hud-muted', uses: 'settings intro and group titles', fg: 'var(--hud-muted)', surfaces: [panel()], min: TEXT, where: 'settings-dialog.css:8,11' },
  { id: 'settings-segment-idle', uses: 'segmented control, idle', fg: 'var(--hud-muted)', surfaces: [panel('var(--hud-tile)')], min: TEXT, where: 'settings-dialog.css:17,21,38' },
  { id: 'settings-segment-hover', uses: 'segmented control, hover', fg: 'var(--ink)', surfaces: [panel('var(--hud-tile)', 'var(--hud-tile-hover)')], min: TEXT, where: 'settings-dialog.css:23' },
  { id: 'settings-segment-pressed', uses: 'segmented control, pressed', fg: 'var(--ink)', surfaces: [panel('var(--hud-tile)', 'var(--hud-raised)')], min: TEXT, where: 'settings-dialog.css:25' },
  { id: 'settings-tab-selected', uses: 'selected settings tab (accent on accent-soft)', fg: 'var(--accent)', surfaces: [panel('var(--accent-soft)')], min: TEXT, where: 'game-hud.css:102' },
  { id: 'settings-destructive', uses: 'sign out, delete, confirm, overdue (raw red)', fg: byTheme('#a33a32', '#ff9f94'), surfaces: [panel('var(--hud-tile)')], min: TEXT, where: 'settings-dialog.css:78,91-92,110-111,125-126,189-190' },
  { id: 'settings-link', uses: 'support link', fg: byTheme('var(--hud-action)', 'var(--hud-focus)'), surfaces: [panel()], min: TEXT, where: 'settings-dialog.css:95-96' },
  { id: 'settings-focus', uses: 'focus ring in settings', fg: 'var(--hud-focus)', surfaces: [panel(), panel('var(--hud-tile)')], min: UI, where: 'game-hud.css:141' },
  // Sign-in gate: one dark theme only (no data-theme rules).
  { id: 'signin-ink', uses: 'sign-in text', fg: 'var(--gate-ink)', surfaces: [['var(--gate-bg)']], min: TEXT, where: 'access-gate.css:6,43', gate: true },
  { id: 'signin-muted', uses: 'sign-in secondary text', fg: 'var(--gate-muted)', surfaces: [['var(--gate-bg)']], min: TEXT, where: 'access-gate.css:47,72,100,140', gate: true },
  { id: 'signin-quiet', uses: 'journey, divider, footer, placeholder', fg: 'var(--gate-quiet)', surfaces: [['var(--gate-bg)'], ['var(--gate-field)']], min: TEXT, where: 'access-gate.css:51,126,135,138,144', gate: true },
  { id: 'signin-pink-kicker', uses: 'TypeSafe pink kicker', fg: 'var(--gate-pink)', surfaces: [['var(--gate-bg)']], min: TEXT, where: 'access-gate.css:36', gate: true },
  { id: 'signin-on-pink', uses: 'text on pink buttons', fg: 'var(--gate-on-pink)', surfaces: [['var(--gate-pink)'], ['var(--gate-pink-hover)']], min: TEXT, where: 'access-gate.css:87,91,110-111,115', gate: true },
];

// Pairs that fail today. Colours are not changed in this slice: each stays visible as a
// todo until the R8 treatment fixes it, the ledger records the measurement, and the test
// below fails once a gap passes so its entry is removed and the pair becomes enforced.
// OPAQUE fails on an opaque surface, whatever is behind the HUD. BOUND fails only when the
// translucent sheet is composited over pure black or white (its backdrop filter ignored),
// and passes with reduced transparency; measure it in the browser before calling it a defect.
const OPAQUE = 'below threshold on an opaque surface';
const BOUND = 'below threshold only under the black/white backdrop bound';
const LIGHT = SCENARIOS.filter(s => s.theme === 'light').map(s => s.name);
const DARK = SCENARIOS.filter(s => s.theme === 'dark').map(s => s.name);
const gaps = (id, reason, scenarios) => scenarios.map(scenario => [`${id}|${scenario}`, reason]);
const KNOWN_GAPS = new Map([
  ...gaps('action-fill', OPAQUE, DARK),
  ...gaps('action-keycap', OPAQUE, [...LIGHT, ...DARK]),
  ...gaps('movement-legend', OPAQUE, LIGHT),
  ...gaps('gate-town-primary', OPAQUE, LIGHT),
  ...gaps('sheet-muted', BOUND, ['light']),
  ...gaps('tile-hud-muted', BOUND, ['light', 'dark']),
  ...gaps('raised-ink', BOUND, ['dark']),
  ...gaps('chat-accent', BOUND, ['light']),
  ...gaps('places-error', BOUND, ['light']),
  ...gaps('map-button-ink', BOUND, ['light', 'dark']),
  ...gaps('map-button-keycap', BOUND, ['light', 'dark']),
  ...gaps('gate-town-muted', BOUND, ['light', 'dark']),
  ...gaps('gate-town-well', BOUND, ['dark']),
  ...gaps('gate-town-kicker', BOUND, ['light', 'dark']),
]);

const colorIn = tokens => theme => value => parseColor(resolve(typeof value === 'string' ? value : value[theme], tokens));

test('the token cascade follows the stylesheet import order in main.js', () => {
  const imported = [...src('main.js').matchAll(/^import '\.\/([\w-]+\.css)';$/gm)].map(([, name]) => name);
  const sheets = CASCADE.filter(name => name !== 'access-theme.css');
  assert.deepEqual(imported.filter(name => sheets.includes(name)), sheets);
});

test('every token a pair reads is declared without an unmodelled condition', () => {
  const used = new Set(JSON.stringify(PAIRS).match(/--[\w-]+/g));
  for (const declaration of DECLARATIONS) {
    if (!used.has(declaration.prop)) continue;
    for (const condition of declaration.conditions) {
      assert.ok(RECOGNISED.some(([pattern]) => pattern.test(condition)), `${declaration.file} ${declaration.prop} under ${condition}`);
    }
  }
});

test('the resolved tokens match the theme layers they come from', () => {
  const light = tokensFor(SCENARIOS.find(s => s.name === 'light')), dark = tokensFor(SCENARIOS.find(s => s.name === 'dark'));
  // retro-finish.css loads after visual-finish.css and playground-theme.css, so its teal wins --accent.
  assert.equal(light.get('--accent').value, '#286768');
  assert.equal(dark.get('--accent').value, '#b8e4ca');
  assert.equal(light.get('--accent').file, 'retro-finish.css');
  // --on-accent is only declared by the playground layer.
  assert.equal(light.get('--on-accent').value, '#fff');
  assert.equal(dark.get('--on-accent').value, '#271a25');
  const reduced = tokensFor(SCENARIOS.find(s => s.name === 'dark+reduced-transparency'));
  assert.equal(reduced.get('--hud-glass').value, 'rgb(20 27 24 / .97)');
  const software = tokensFor(SCENARIOS.find(s => s.name === 'light+software'));
  assert.equal(software.get('--hud-filter').value, 'none');
});

const MEASURED = SCENARIOS.flatMap(scenario => {
  const color = colorIn(tokensFor(scenario))(scenario.theme);
  // The sign-in gate has no theme rules; measure it once.
  return PAIRS.filter(pair => !pair.gate || scenario.name === 'dark')
    .map(pair => ({ scenario: scenario.name, pair, value: contrast(pair, color) }));
});

for (const { scenario, pair, value } of MEASURED) {
  const name = `${scenario}: ${pair.id} (${pair.uses}) >= ${pair.min} [${pair.where}]`;
  const gap = KNOWN_GAPS.get(`${pair.id}|${scenario}`);
  const check = () => assert.ok(value >= pair.min, `${value.toFixed(2)} < ${pair.min}`);
  if (gap) test(name, { todo: `${gap}: ${value.toFixed(2)}` }, check);
  else test(name, check);
}

test('every known gap names a measured pair that still fails', () => {
  const measured = new Map(MEASURED.map(entry => [`${entry.pair.id}|${entry.scenario}`, entry]));
  for (const key of KNOWN_GAPS.keys()) {
    const entry = measured.get(key);
    assert.ok(entry, `${key} is not a measured pair`);
    assert.ok(entry.value < entry.pair.min, `${key} now passes (${entry.value.toFixed(2)}): remove it from KNOWN_GAPS`);
  }
});

test('measured ratios (report)', t => {
  for (const { scenario, pair, value } of MEASURED) t.diagnostic(`${scenario}\t${pair.id}\t${value.toFixed(2)}\t${pair.min}`);
});

// Report only: what the Pink Jet-Age roles (#739) would give for the same uses. Nothing
// here is shipped; the numbers inform the future skin and are printed as diagnostics.
test('Pink Jet-Age role projections (report only)', t => {
  const P = PINK_JET_AGE, c = parseColor;
  const glassOf = (hex, alpha) => [...c(hex).slice(0, 3), alpha];
  const rows = [
    ['ink on ivory (sheet text)', P.ink, [[P.ivory]], TEXT],
    ['ink on ivory glass .8 (translucent sheet bound)', P.ink, [[glassOf(P.ivory, 0.8)]], TEXT],
    ['ink on mint glass (tile)', P.ink, [[P.mintGlass]], TEXT],
    ['ink on chrome (raised control)', P.ink, [[P.chrome]], TEXT],
    ['garden on ivory (muted / link)', P.garden, [[P.ivory]], TEXT],
    ['ivory on garden (action fill)', P.ivory, [[P.garden]], TEXT],
    ['pink on ivory (pink as text)', P.pink, [[P.ivory]], TEXT],
    ['pink on mint glass (pink as text)', P.pink, [[P.mintGlass]], TEXT],
    ['ivory on pink (light text on pink fill)', P.ivory, [[P.pink]], TEXT],
    ['ink on pink (dark text on pink fill)', P.ink, [[P.pink]], TEXT],
    ['pink vs ivory (focus ring / boundary)', P.pink, [[P.ivory]], UI],
    ['garden vs ivory (focus ring / boundary)', P.garden, [[P.ivory]], UI],
    ['ivory on ink (dark sheet text)', P.ivory, [[P.ink]], TEXT],
    ['mint glass on ink (dark muted)', P.mintGlass, [[P.ink]], TEXT],
    ['chrome on ink (dark muted)', P.chrome, [[P.ink]], TEXT],
    ['pink on ink (pink as text, dark)', P.pink, [[P.ink]], TEXT],
    ['garden on ink (dark)', P.garden, [[P.ink]], TEXT],
    ['pink vs ink (focus ring, dark)', P.pink, [[P.ink]], UI],
  ];
  for (const [label, fg, surfaces, min] of rows) {
    const value = contrast({ fg, surfaces }, layer => Array.isArray(layer) ? layer : c(layer));
    assert.ok(Number.isFinite(value) && value >= 1);
    t.diagnostic(`${label}: ${value.toFixed(2)} (${value >= min ? 'meets' : 'below'} ${min})`);
  }
});
