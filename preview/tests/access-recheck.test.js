import test from 'node:test';
import assert from 'node:assert/strict';
import { answeredFetch, reloadAfterFailedCheck } from '../src/access-recheck.js';

test('a periodic access check with no answer keeps the district; any answer still goes back through the gate (#290)', async () => {
  const response = { ok: true };
  assert.equal(await answeredFetch(async (path, options) => { assert.equal(path, '/auth/session'); assert.equal(options.cache, 'no-store'); return response; }, '/auth/session', { cache: 'no-store' }), response);
  // Offline, or the connection dropped before any response: nothing is known about access.
  const offline = await answeredFetch(async () => { throw new TypeError('Failed to fetch'); }).catch(error => error);
  assert.equal(offline instanceof TypeError, true, 'the original error is kept');
  assert.equal(offline.unanswered, true);
  assert.equal(reloadAfterFailedCheck(true, offline), false, 'reloading now would only show the browser offline page');
  // The server answered with an error, or an answer that is not JSON: back through the gate, as before.
  for (const answered of [new Error('Access is unavailable'), new SyntaxError('Unexpected token <')]) assert.equal(reloadAfterFailedCheck(true, answered), true, answered.message);
  // Before entering, the gate is already showing: nothing to reload.
  assert.equal(reloadAfterFailedCheck(false, offline), false);
  assert.equal(reloadAfterFailedCheck(false, new Error('Access is unavailable')), false);
});
