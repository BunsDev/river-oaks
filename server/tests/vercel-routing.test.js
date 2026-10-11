import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeVercelRoute, vercelClientAddress } from '../vercel-routing.js';

test('rewritten routes retain OAuth/socket parameters without accepting arbitrary paths', () => {
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/auth/callback&code=abc&state=xyz'), '/auth/callback?code=abc&state=xyz');
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/auth/verify'), '/auth/verify');
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/auth/desktop/exchange'), '/auth/desktop/exchange');
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/multiplayer&ticket=xyz'), '/multiplayer?ticket=xyz');
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/api/worlds'), '/api/worlds');
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/api/debug-reports'), '/api/debug-reports');
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/api/debug-reports/get&id=abc-123'), '/api/debug-reports/get?id=abc-123');
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/api/world-data&world=moon-garden'), '/api/world-data?world=moon-garden');
  for(const action of ['load','save','discard','apply'])assert.equal(normalizeVercelRoute(`/api/server?_river_path=/api/world-draft/${action}`),`/api/world-draft/${action}`);
  for (const action of ['list', 'add', 'remove']) assert.equal(normalizeVercelRoute(`/api/server?_river_path=/api/landmarks/${action}`), `/api/landmarks/${action}`);
  for (const action of ['list', 'request', 'accept', 'remove', 'messages', 'send', 'invite-world', 'invite-place']) assert.equal(normalizeVercelRoute(`/api/server?_river_path=/api/social/${action}&world=moon-garden`), `/api/social/${action}?world=moon-garden`);
  for (const action of ['list','read','create','invite','accept','decline','leave','remove','send']) assert.equal(normalizeVercelRoute(`/api/server?_river_path=/api/groups/${action}&world=moon-garden`), `/api/groups/${action}?world=moon-garden`);
  for (const action of ['list','create','rsvp','cancel']) assert.equal(normalizeVercelRoute(`/api/server?_river_path=/api/events/${action}&world=moon-garden`), `/api/events/${action}?world=moon-garden`);
  for (const action of ['view','save']) assert.equal(normalizeVercelRoute(`/api/server?_river_path=/api/profile/${action}&world=moon-garden`), `/api/profile/${action}?world=moon-garden`);
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/../../.env'), '/not-found');
  assert.equal(normalizeVercelRoute('/api/server?_river_path=/auth/login&_river_path=/auth/logout'), '/not-found');
  assert.equal(normalizeVercelRoute('/auth/session?_river_path=/auth/logout'), '/auth/session');
  assert.equal(normalizeVercelRoute('//%'), '/not-found');
});

test('Vercel rewrites every resident social and group action to the server entry',()=>{
  const config=JSON.parse(readFileSync(new URL('../../vercel.json',import.meta.url)));
  const rewrites=new Map(config.rewrites.map(item=>[item.source,item.destination]));
  for(const scope of ['social','groups','events']) {
    const actions=scope==='social'?['list','request','accept','remove','messages','send','invite-world','invite-place']
      :scope==='groups'?['list','read','create','invite','accept','decline','leave','remove','send']:['list','create','rsvp','cancel'];
    for(const action of actions)assert.equal(rewrites.get(`/api/${scope}/${action}`),`/api/server?_river_path=/api/${scope}/${action}`);
  }
});

test('only Vercel entry uses the platform-owned IP header and invalid values share a fail-closed bucket', () => {
  assert.equal(vercelClientAddress({ headers: { 'x-vercel-forwarded-for': '203.0.113.3', 'x-forwarded-for': '1.1.1.1' } }), '203.0.113.3');
  assert.equal(vercelClientAddress({ headers: { 'x-vercel-forwarded-for': 'spoof, 203.0.113.3' } }), 'unknown');
  assert.equal(vercelClientAddress({ headers: {} }), 'unknown');
  assert.equal(vercelClientAddress({ headers: { 'x-vercel-forwarded-for': '2001:0db8:0:0::1' } }), '2001:db8::1');
});
