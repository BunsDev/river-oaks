// Hardening follow-up: Cloudflare Turnstile on email sign-in. The verifier
// fails closed on anything but a successful check for the expected action.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnstileVerifier, TURNSTILE_ACTION } from '../turnstile.js';
import { magicOptions } from '../magic-auth.js';

const answer = (body, ok = true) => async () => ({ ok, json: async () => body });

test('the verifier accepts only a successful check for the email sign-in action', async () => {
  const sent = [];
  const verify = createTurnstileVerifier({ secret: 'secret-key', fetcher: async (url, options) => {
    sent.push({ url, body: Object.fromEntries(options.body) });
    return { ok: true, json: async () => ({ success: true, action: TURNSTILE_ACTION }) };
  } });
  assert.equal(await verify('token-1'), true);
  assert.deepEqual(sent, [{ url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify', body: { secret: 'secret-key', response: 'token-1' } }]);
  for (const [name, fetcher] of [
    ['failed check', answer({ success: false, 'error-codes': ['timeout-or-duplicate'] })],
    ['another action', answer({ success: true, action: 'login' })],
    ['provider error', answer({}, false)],
    ['network failure', async () => { throw new Error('offline'); }],
    ['unreadable answer', async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } })],
  ]) assert.equal(await createTurnstileVerifier({ secret: 's', fetcher })('token'), false, name);
});

test('a missing or oversized token is refused without calling Cloudflare', async () => {
  let calls = 0;
  const verify = createTurnstileVerifier({ secret: 's', fetcher: async () => { calls++; return { ok: true, json: async () => ({ success: true, action: TURNSTILE_ACTION }) }; } });
  for (const token of [undefined, null, '', 42, 'x'.repeat(2049)]) assert.equal(await verify(token), false, String(token).slice(0, 12));
  assert.equal(calls, 0);
});

test('a slow check times out and fails closed', async () => {
  const verify = createTurnstileVerifier({ secret: 's', timeoutMs: 20, fetcher: (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))) });
  assert.equal(await verify('token'), false);
});

test('Turnstile is on only when the server has a secret key', () => {
  assert.equal(magicOptions({}).verifyHuman, null);
  assert.equal(typeof magicOptions({ TURNSTILE_SECRET_KEY: 'secret' }).verifyHuman, 'function');
  assert.throws(() => createTurnstileVerifier({ secret: '' }));
});
