import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { assertCartierWalk, watchCartierErrors, assertCartierRender } from '../e2e/cartier-pilot-checks.js';

const before = { inside: 'osm-node-8172494965', position: [0, 1.6, 0] };
test('walking acceptance rejects no movement, unbounded displacement and another room', () => {
  assert.doesNotThrow(() => assertCartierWalk(before, { ...before, position: [0, 1.6, -2] }));
  assert.throws(() => assertCartierWalk(before, before), /meaningful/);
  assert.throws(() => assertCartierWalk(before, { ...before, position: [0, 1.6, -20] }), /bounded/);
  assert.throws(() => assertCartierWalk(before, { inside: 'other', position: [0, 1.6, -2] }), /Cartier/);
  assert.throws(() => assertCartierWalk(before, { ...before, position: [NaN, 1.6, 0] }), /position/);
});

test('shader console errors fail render acceptance even when WebGL error is zero', () => {
  const page = new EventEmitter(), errors = watchCartierErrors(page);
  page.emit('console', { type: () => 'warning', text: () => 'informational' });
  assert.doesNotThrow(() => assertCartierRender(errors, 0));
  page.emit('console', { type: () => 'error', text: () => 'THREE.WebGLProgram: Shader Error' });
  assert.throws(() => assertCartierRender(errors, 0), /Shader Error/);
  const other = new EventEmitter(), exceptions = watchCartierErrors(other);
  other.emit('pageerror', new Error('render crashed'));
  assert.throws(() => assertCartierRender(exceptions, 0), /render crashed/);
  assert.throws(() => assertCartierRender([], 1282), /1282/);
});
