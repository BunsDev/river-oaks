import test from 'node:test';
import assert from 'node:assert/strict';
import { PINK_JET_AGE } from '../../shared/city-kit/pink-jet-age.js';
import { KIT_FINISHES } from '../../shared/city-kit/catalog.js';
import { DISTRICT, DISTRICT_SIGN } from '../src/district-palette.js';

const channel = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = hex => { const n = parseInt(hex.slice(1), 16); return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255); };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const hue = hex => {
  const n = parseInt(hex.slice(1), 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { degrees: (h * 60 + 360) % 360, saturation: d / max };
};

test('every District role is a well-formed colour', () => {
  for (const [role, colour] of Object.entries(DISTRICT)) assert.match(colour, /^#[0-9a-fA-F]{6}$/, role);
  assert.ok(Object.isFrozen(DISTRICT) && Object.isFrozen(DISTRICT_SIGN));
});

test('the District takes the approved Pink Jet-Age roles, not colours of its own', () => {
  assert.equal(DISTRICT.pink, PINK_JET_AGE.pink);
  assert.equal(DISTRICT.ivory, PINK_JET_AGE.ivory);
  assert.equal(DISTRICT.ink, PINK_JET_AGE.ink);
  assert.equal(DISTRICT.chrome, PINK_JET_AGE.chrome);
  assert.equal(DISTRICT.mint, PINK_JET_AGE.mintGlass);
});

test('the District agrees with the city kit where the two meet on a street', () => {
  const kit = KIT_FINISHES['pink-jet-age'].materials;
  assert.equal(DISTRICT.glass.toLowerCase(), kit.glass.color.toLowerCase(), 'reflective panes');
  assert.equal(DISTRICT.rose.toLowerCase(), kit['brick-rose'].color.toLowerCase(), 'warm rose');
  assert.equal(DISTRICT.blush.toLowerCase(), kit['stucco-apricot'].color.toLowerCase(), 'blush');
  assert.equal(DISTRICT.pink, kit['trim-teal'].color, 'fascias and canopies');
  assert.equal(DISTRICT.chrome, kit['metal-brass'].color, 'metal trim');
  assert.equal(DISTRICT.ink, kit['lamp-teal'].color, 'lamp columns and frames');
});

test('tenant signs stay readable: ivory lettering on ink, with pink only as the edge', () => {
  assert.ok(contrast(DISTRICT_SIGN.lettering, DISTRICT_SIGN.plaque) >= 7, `lettering on plaque ${contrast(DISTRICT_SIGN.lettering, DISTRICT_SIGN.plaque).toFixed(2)}:1`);
  assert.notEqual(DISTRICT_SIGN.lettering, DISTRICT.pink);
  assert.notEqual(DISTRICT_SIGN.plaque, DISTRICT.pink);
  assert.equal(DISTRICT_SIGN.edge, DISTRICT.pink);
  // The measured reason for the rule (#738): pink on ivory is far below 4.5:1.
  assert.ok(contrast(DISTRICT.pink, DISTRICT.ivory) < 3);
  assert.ok(contrast(DISTRICT_SIGN.edge, DISTRICT_SIGN.plaque) >= 3, 'the pink edge still reads against the plaque');
});

test('no saturated teal or brass survives in the District roles', () => {
  for (const [role, colour] of Object.entries(DISTRICT)) {
    const h = hue(colour);
    if (!h) continue;
    // The earlier palette's teal (#317b7d, #1f454a) and brass (#bd9e66) were saturated: 0.61, 0.58 and 0.46.
    const teal = h.degrees >= 165 && h.degrees <= 195, brass = h.degrees >= 30 && h.degrees <= 50;
    if (teal) assert.ok(h.saturation < 0.35, `${role} ${colour} is a saturated teal`);
    if (brass && !role.startsWith('glow') && role !== 'blush' && role !== 'ivory') assert.ok(h.saturation < 0.3, `${role} ${colour} is a saturated brass`);
  }
});
