import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../rate-limit.js';

test('limits each key within its window and resets after it', () => {
  let time = 0;
  const allow = createRateLimiter(2, 1000, 16, () => time);
  assert.deepEqual([allow('a'), allow('a'), allow('a'), allow('b')], [true, true, false, true]);
  time = 1000;
  assert.equal(allow('a'), true);
});

// The table used to refuse every new key once it was full of live windows, so
// 4096 addresses in one minute locked every other visitor out.
test('a full table of live windows still admits a new key by evicting the oldest', () => {
  let time = 0;
  const allow = createRateLimiter(1, 60_000, 4, () => time);
  for (const key of ['flood-1', 'flood-2', 'flood-3', 'flood-4']) assert.equal(allow(key), true);
  assert.equal(allow('visitor'), true);
  assert.equal(allow('visitor'), false, 'the newcomer is still limited');
  assert.equal(allow('flood-4'), false, 'recent windows survive');
  assert.equal(allow('flood-1'), true, 'only the oldest window was evicted');
});
