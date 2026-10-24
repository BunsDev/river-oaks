import test from 'node:test';
import assert from 'node:assert/strict';
import { createResidentPortraits } from '../src/resident-portraits.js';

test('context loss fences queued portrait frames, then retries the waiting portrait after restoration', async () => {
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: () => ({ data: new Uint8Array(4) }) }) }) };
  try {
    const callbacks = []; let reads = 0, resolved = false;
    const portraits = createResidentPortraits({ renderer: {}, size: 1, schedule: callback => callbacks.push(callback), getHolder: () => { reads++; return null; } });
    const pending = portraits.portrait('resident').then(() => { resolved = true; });
    const stale = callbacks.shift(); portraits.setPaused(true); stale(); await Promise.resolve();
    assert.equal(reads, 0); assert.equal(resolved, false);
    portraits.setPaused(false); assert.equal(callbacks.length, 1); callbacks.shift()(); await pending;
    assert.equal(reads, 1); assert.equal(resolved, true);
    portraits.dispose();
  } finally { globalThis.document = previous; }
});
