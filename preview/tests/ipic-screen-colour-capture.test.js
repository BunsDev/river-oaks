import test from 'node:test';
import assert from 'node:assert/strict';
import { captureWorldFrame } from '../e2e/ipic-screen-colour-capture.js';
const ready = { environment: true, software: false, seeking: false, paused: true, ao: true, bloom: true };
test('color readback waits for a normal completed world draw', async () => {
  let afterDraw, reads = 0;
  const result = captureWorldFrame({ schedule: fn => { afterDraw = fn; }, readiness: () => ready, read: () => ++reads });
  assert.equal(reads, 0);
  afterDraw();
  assert.equal(await result, 1);
});
for (const [key, value] of [['environment', false], ['software', true], ['seeking', true], ['paused', false], ['ao', false], ['bloom', false]]) {
  test(`color capture refuses incomplete ${key} evidence`, async () => {
    let reads = 0;
    await assert.rejects(captureWorldFrame({ schedule: fn => fn(), readiness: () => ({ ...ready, [key]: value }), read: () => ++reads }), /Incomplete/);
    assert.equal(reads, 0);
  });
}

test('color evidence rejects a clamped lighting hour', async () => {
  const { assertCaptureHour } = await import('../e2e/ipic-screen-colour-capture.js');
  assert.throws(() => assertCaptureHour(0, '7'), /lighting hour/);
  assert.doesNotThrow(() => assertCaptureHour(7, '7'));
});
