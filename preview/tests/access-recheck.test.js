import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_CHANGED, answeredFetch, reloadAfterFailedCheck } from '../src/access-recheck.js';
import { ACCOUNT_CHANGED as TOWN_ACCOUNT_CHANGED, noticeSessionAccount } from '../src/session-account-notice.js';

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

test('the town connection asks for an access recheck at once when the session is another account', () => {
  // The gate listens for the name the town client sends; they live in separate modules (access-only vs game).
  assert.equal(TOWN_ACCOUNT_CHANGED, ACCOUNT_CHANGED);
  const target = new EventTarget(); let asked = 0; target.addEventListener(ACCOUNT_CHANGED, () => asked++);
  const body = { dataset: { accountId: 'bob' } };
  assert.equal(noticeSessionAccount('bob', { body, target }), false, 'the account this page entered as');
  assert.equal(asked, 0);
  // Signed in as someone else in this browser: before, the page ran as guest under bob's page for up to 15 s.
  assert.equal(noticeSessionAccount('guest', { body, target }), true);
  assert.equal(asked, 1);
  // Before entry (gate pages, fixtures) or with no account there is nothing to compare.
  assert.equal(noticeSessionAccount('guest', { body: { dataset: {} }, target }), false);
  assert.equal(noticeSessionAccount('guest', { body: undefined, target }), false);
  assert.equal(noticeSessionAccount(undefined, { body, target }), false);
  assert.equal(asked, 1);
});
