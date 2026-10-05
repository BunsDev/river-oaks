import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubNames, createMemoryGitHubNameStore } from '../github-names.js';
import { createGitHubFixture, githubIdentities } from './github-fixture.js';

function setup({ accounts = { 1001: 'val-dev' }, identities = { user_1: '1001' }, token = null } = {}) {
  let time = 1_000_000;
  const github = createGitHubFixture(accounts), store = createMemoryGitHubNameStore();
  const userManagement = { getUserIdentities: githubIdentities(identities) };
  const names = createGitHubNames({ userManagement, store, fetcher: github.fetcher, token, now: () => time });
  return { names, github, store, userManagement, advance: ms => { time += ms; } };
}

test('a WorkOS user is named by the GitHub account WorkOS recorded', async () => {
  const { names, github } = setup();
  assert.deepEqual(await names.resolve({ userId: 'user_1' }), { githubId: '1001', login: 'val-dev' });
  assert.deepEqual(github.calls, [{ path: '/user/1001', auth: null }]);
});

test('the sign-in GitHub token is preferred, then the server token, then an anonymous request', async () => {
  const withToken = setup({ token: 'server-token' });
  withToken.github.tokens.set('user-token', '1001');
  await withToken.names.resolve({ userId: 'user_1', oauthAccessToken: 'user-token' });
  assert.deepEqual(withToken.github.calls, [{ path: '/user', auth: 'Bearer user-token' }]);
  const serverToken = setup({ token: 'server-token' });
  await serverToken.names.resolve({ userId: 'user_1' });
  assert.deepEqual(serverToken.github.calls, [{ path: '/user/1001', auth: 'Bearer server-token' }]);
});

test('a GitHub token for a different account than the WorkOS identity is ignored', async () => {
  const { names, github } = setup({ accounts: { 1001: 'val-dev', 2002: 'someone-else' } });
  github.tokens.set('stolen-token', '2002');
  assert.deepEqual(await names.resolve({ userId: 'user_1', oauthAccessToken: 'stolen-token' }), { githubId: '1001', login: 'val-dev' });
});

test('malformed or mismatched GitHub answers never become a username', async () => {
  for (const body of [{ id: 1001, login: 'Jevica Admin' }, { id: 1001, login: '<img>' }, { id: 9999, login: 'other' }, { id: 1001 }, [], null]) {
    const store = createMemoryGitHubNameStore();
    const names = createGitHubNames({ userManagement: { getUserIdentities: githubIdentities({ user_1: '1001' }) }, store,
      fetcher: async () => Response.json(body) });
    assert.equal((await names.resolve({ userId: 'user_1' })).login, null, JSON.stringify(body));
  }
});

test('a GitHub outage keeps the last known username, and a first sign-in during one has none', async () => {
  const { names, github } = setup();
  await names.resolve({ userId: 'user_1' });
  github.down = true;
  assert.deepEqual(await names.resolve({ userId: 'user_1' }), { githubId: '1001', login: 'val-dev' });
  const fresh = setup();
  fresh.github.down = true;
  assert.deepEqual(await fresh.names.resolve({ userId: 'user_1' }), { githubId: '1001', login: null });
});

test('a failed lookup is retried after ten minutes, not on every request', async () => {
  const { names, github, advance } = setup();
  github.down = true;
  await names.resolve({ userId: 'user_1' });
  github.down = false;
  const before = github.calls.length;
  assert.equal((await names.known('user_1')).login, null);
  assert.equal(github.calls.length, before, 'no new GitHub request inside the retry window');
  advance(10 * 60_000);
  assert.equal((await names.known('user_1')).login, 'val-dev');
  assert.equal((await names.known('user_1')).login, 'val-dev');
  assert.equal(github.calls.length, before + 1);
});

test('a renamed GitHub account is picked up at the next sign-in', async () => {
  const { names, github } = setup();
  await names.resolve({ userId: 'user_1' });
  github.accounts['1001'] = 'val-renamed';
  assert.equal((await names.resolve({ userId: 'user_1' })).login, 'val-renamed');
});

test('a WorkOS outage falls back to the stored GitHub account; other providers are ignored', async () => {
  const { names, userManagement } = setup();
  await names.resolve({ userId: 'user_1' });
  userManagement.getUserIdentities = async () => { throw new Error('WorkOS unavailable'); };
  assert.deepEqual(await names.resolve({ userId: 'user_1' }), { githubId: '1001', login: 'val-dev' });
  const google = setup();
  google.userManagement.getUserIdentities = async () => [{ idpId: '1001', type: 'OAuth', provider: 'GoogleOAuth' }];
  assert.deepEqual(await google.names.resolve({ userId: 'user_1' }), { githubId: null, login: null });
  assert.equal(google.github.calls.length, 0);
});

test('concurrent lookups for one account share a single GitHub request', async () => {
  const { names, github } = setup();
  const results = await Promise.all(Array.from({ length: 5 }, () => names.resolve({ userId: 'user_1' })));
  assert.ok(results.every(result => result.login === 'val-dev'));
  assert.equal(github.calls.length, 1);
});
