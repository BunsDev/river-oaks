import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { referencePlan } from '../src/reference-facades.js';
import { EQUINOX_BLOCK, blockFacades } from '../src/reference-blocks.js';
import { officeLayout, OFFICE_LAYOUT_PENTHOUSE } from '../src/office-layouts.js';
import { ARRIVAL } from '../src/office-arrival-model.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const tower = world.buildings.find(item => item.id === EQUINOX_BLOCK);

// Every box the Equinox frontages draw, by material name, through the real facade builders.
function equinoxBoxes(t) {
  const sink = new Proxy(() => sink, { get: (_, key) => key === 'measureText' ? () => ({ width: 0 }) : sink, apply: () => sink, set: () => true });
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => sink, width: 0, height: 0, style: {} }) };
  t.after(() => { globalThis.document = previous; });
  const boxes = [], named = name => name, m = new Proxy({}, { get: (_, key) => `m:${String(key)}` });
  const blocks = blockFacades({ world, m, keep: (_, name) => name, surface: named, glazing: named, cladding: () => 'cladding',
    lettering: () => null, sign: () => {}, storefront: () => {}, sheet: () => {},
    box: (f, material, s0, s1, y0, y1) => boxes.push({ material, s0, s1, y0, y1 }) });
  for (const frontage of referencePlan(world).frontages.filter(item => item.building === tower)) blocks.build(frontage, { at: (s, h, d = 0) => [s, h, d], yaw: 0, base: tower.center[2], sOf: s => s }, frontage.width, []);
  return boxes;
}

test('the penthouse tower is raised so its curtain wall encloses the penthouse and stays under the roof', t => {
  const penthouse = officeLayout(OFFICE_LAYOUT_PENTHOUSE), main = penthouse.levels[0];
  const ceiling = ARRIVAL.officeElevation + main.floorElevation + main.clearHeight;
  assert.equal(tower.size[2], 33, 'the mapped tower is 33 m');
  assert.match(tower.height_source, /authored/, 'and says the extra height is authored, not photographed');
  const frames = equinoxBoxes(t).filter(item => item.material === 'royal-frame');
  const mullions = frames.filter(item => item.y1 - item.y0 > 3);
  const top = Math.max(...mullions.map(item => item.y1));
  assert.ok(top > ceiling, `the curtain wall (${top} m) rises above the penthouse ceiling (${ceiling} m)`);
  const coping = Math.max(...frames.map(item => item.y1));
  assert.ok(coping <= tower.size[2] + 0.15 + 1e-9, `the coping (${coping} m) stays at the roof line`);
  const floorLines = [...new Set(frames.filter(item => item.y1 - item.y0 < 0.2 && item.y0 > 12.8 && item.y1 < top).map(item => Math.round((item.y0 + item.y1) / 2 * 100) / 100))].sort((a, b) => a - b);
  assert.deepEqual(floorLines, [16.6, 20.45, 24.3], 'one double-height band above the office floor: no line at the mezzanine');
});

test('the U.S. Capital Advisors crest stays at the top of the raised curtain wall', t => {
  const boxes = equinoxBoxes(t), crest = boxes.filter(item => item.material === 'white-metal' && item.y0 > 12.8);
  const top = Math.max(...boxes.filter(item => item.material === 'royal-frame' && item.y1 - item.y0 > 3).map(item => item.y1));
  assert.ok(crest.length > 0, 'the crest is drawn');
  for (const item of crest) assert.ok(top - item.y1 > 0.5 && top - item.y1 < 1.5, `crest top ${item.y1} m sits just under the wall top ${top} m`);
});
