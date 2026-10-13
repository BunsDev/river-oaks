import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMiles } from '../src/cycling-leaderboard.js';

test('miles on the board read to one decimal', () => {
  assert.equal(formatMiles(0), '0.0 mi');
  assert.equal(formatMiles(3.14159), '3.1 mi');
  assert.equal(formatMiles(12.96), '13.0 mi');
});
