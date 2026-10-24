import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sha256} from '../../shared/neighborhood/sha256.js';

test('portable UTF-8 digest matches independent Node SHA-256 across padding boundaries', () => {
  for (const text of ['', 'abc', 'Garden 🌳 café', ...[55, 56, 63, 64, 65, 127, 128, 10000].map(n => 'x'.repeat(n))]) {
    assert.equal(sha256(text), createHash('sha256').update(text).digest('hex'));
  }
});
