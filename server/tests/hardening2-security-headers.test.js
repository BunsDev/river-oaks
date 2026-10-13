// Hardening follow-up: one Content-Security-Policy. The Node server sends it
// from security-headers.js; Vercel sends it from vercel.json. They must agree,
// and the policy must keep its default and its restrictive directives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONTENT_SECURITY_POLICY, securityHeaders } from '../security-headers.js';

const vercel = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
const directives = Object.fromEntries(CONTENT_SECURITY_POLICY.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));

test('vercel.json sends exactly the headers the Node server sends', () => {
  const sent = {};
  securityHeaders({ setHeader: (name, value) => { sent[name] = value; } });
  const all = vercel.headers.find(rule => rule.source === '/(.*)');
  assert.deepEqual(Object.fromEntries(all.headers.map(({ key, value }) => [key, value])), sent);
});

test('the policy defaults to this origin and keeps its restrictive directives', () => {
  assert.deepEqual(directives['default-src'], ["'self'"]);
  // connect-src: this origin, plus LiveKit Cloud's signalling hosts for shared
  // voice (clients are redirected to regional *.livekit.cloud hosts, so one
  // pinned host is not enough). WebRTC media and TURN are outside the CSP.
  for (const [name, value] of [['object-src', ["'none'"]], ['base-uri', ["'self'"]], ['form-action', ["'self'"]], ['frame-ancestors', ["'none'"]], ['connect-src', ["'self'", 'data:', 'blob:', 'https://*.livekit.cloud', 'wss://*.livekit.cloud']]])
    assert.deepEqual(directives[name], value, name);
  assert.deepEqual(directives['script-src'], ["'self'", 'https://challenges.cloudflare.com'], 'scripts: this origin and Turnstile only');
  assert.deepEqual(directives['frame-src'], ['https://challenges.cloudflare.com'], 'frames: Turnstile only');
  assert.equal(/'unsafe-eval'|'unsafe-inline'/.test(directives['script-src'].join(' ')), false, 'no inline or eval scripts');
  assert.equal(Object.values(directives).flat().some(value => value === '*' || value === 'https:' || value === 'http:'), false, 'no wildcard sources');
});

test('the microphone is available to this origin only, and no other powerful feature is delegated', () => {
  const sent = {};
  securityHeaders({ setHeader: (name, value) => { sent[name] = value; } });
  assert.equal(sent['Permissions-Policy'], 'microphone=(self), camera=(), geolocation=(), display-capture=()');
});
