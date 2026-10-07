import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compareViews } from '../compare_skill_views.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/skill-view.json', import.meta.url)));
const view = extra => ({ ...structuredClone(fixture), ...extra });
test('different artifact and revision with identical conditions can be compared', () => {
  assert.equal(compareViews(view(), view({ revision: 'variant', capture: 'synthetic://variant' })).status, 'matched');
});
test('camera, lighting and occupancy changes prevent a matched claim', () => {
  for (const extra of [{ fovAxis: 'vertical' }, { position: [0, -400, 180] }, { time: '22:00' }, { occupancy: 'crowd' }, { runtime: 'browser' }, { exposure: 'auto' }, { renderSettings: 'low' }, { rotationConvention: 'xyz' }]) {
    assert.equal(compareViews(view(), view(extra)).status, 'unmatched');
  }
});
test('unknown or absent conditions do not match even when both omit them', () => {
  for (const field of Object.keys(fixture)) {
    const input = view(); delete input[field];
    assert.equal(compareViews(input, input).status, 'invalid', field);
  }
  assert.equal(compareViews(view({ exposure: 'unknown' }), view()).status, 'invalid');
});
test('malformed numbers and vectors are invalid rather than equal', () => {
  for (const extra of [{ fov: 0 }, { fov: 180 }, { aspect: NaN }, { resolution: [0, 720] }, { position: [0, 1] }, { rotation: [0, Infinity, 0] }, { units: 'yards' }, { projection: 'fisheye' }, { aspect: 1 }]) {
    assert.equal(compareViews(view(extra), view(extra)).status, 'invalid');
  }
  assert.equal(compareViews(null, []).status, 'invalid');
});
test('orthographic views use view size without assuming a perspective FOV', () => {
  const a = view({ projection: 'orthographic', viewSize: 400 });
  delete a.fov; delete a.fovAxis;
  assert.equal(compareViews(a, structuredClone(a)).status, 'matched');
  assert.equal(compareViews(a, { ...a, viewSize: 500 }).status, 'unmatched');
  assert.equal(compareViews({ ...a, viewSize: -1 }, a).status, 'invalid');
});
test('property ordering does not affect comparison and inputs are preserved', () => {
  const a = view(), original = structuredClone(a);
  assert.equal(compareViews(a, Object.fromEntries(Object.entries(a).reverse())).status, 'matched');
  assert.deepEqual(a, original);
});
test('CLI reports matched, unmatched and invalid files with distinct exit codes', t => {
  const dir = mkdtempSync(join(tmpdir(), 'river-skill-views-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const a = join(dir, 'a.json'), b = join(dir, 'b.json');
  writeFileSync(a, JSON.stringify(view()));
  const cli = new URL('../compare_skill_views.mjs', import.meta.url);
  for (const [input, code, status] of [[view(), 0, 'matched'], [view({ time: '22:00' }), 1, 'unmatched'], [{}, 2, 'invalid']]) {
    writeFileSync(b, JSON.stringify(input));
    const result = spawnSync(process.execPath, [cli.pathname, a, b], { encoding: 'utf8' });
    assert.equal(result.status, code, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, status);
  }
  writeFileSync(b, '{');
  assert.equal(spawnSync(process.execPath, [cli.pathname, a, b]).status, 2);
  assert.equal(spawnSync(process.execPath, [cli.pathname]).status, 2);
});
