// Polling shares one account's API quota with every session on this machine. These
// tests use a fake gh that answers like GitHub: 304 (and a nonzero gh exit) when the
// request carries the current ETag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { conditionalGet, nextPollDelay, parseResponse } from '../github-rest.mjs';
import { waitForPull } from '../pr-wait.mjs';

// A fake GitHub whose resources change when the test says so; `charged` counts the
// requests GitHub would count against the quota (everything but a 304).
function fakeGitHub(resources) {
  const stats = { requests: 0, charged: 0 }, remaining = { value: 5000 };
  const exec = (command, args) => {
    assert.equal(command, 'gh');
    const path = args.at(-1), match = args.includes('-H') ? args[args.indexOf('-H') + 1].replace('If-None-Match: ', '') : null;
    stats.requests++;
    const value = resources[path];
    if (value === undefined) throw Object.assign(new Error('gh: Not Found (HTTP 404)'), { stdout: 'HTTP/2.0 404 Not Found\n\n{}' });
    const etag = `"${JSON.stringify(value).length}-${JSON.stringify(value)}"`;
    if (match === etag) throw Object.assign(new Error('gh: HTTP 304'), { stdout: `HTTP/2.0 304 Not Modified\nEtag: ${etag}\nX-Ratelimit-Remaining: ${remaining.value}\nX-Ratelimit-Reset: 2000\n\n` });
    stats.charged++; remaining.value--;
    return `HTTP/2.0 200 OK\nEtag: ${etag}\nX-Ratelimit-Remaining: ${remaining.value}\nX-Ratelimit-Reset: 2000\n\n${JSON.stringify(value)}`;
  };
  return { exec, stats };
}

test('a response splits into status, lower-cased headers and body', () => {
  const response = parseResponse('HTTP/2.0 200 OK\r\nEtag: "abc"\r\nX-Ratelimit-Remaining: 12\r\n\r\n{"a":1}');
  assert.equal(response.status, 200);
  assert.equal(response.headers.etag, '"abc"');
  assert.equal(response.headers['x-ratelimit-remaining'], '12');
  assert.equal(response.body, '{"a":1}');
});

test('an unchanged resource is served from the cache by a 304 that costs no quota', () => {
  const resources = { 'repos/o/r/pulls/1': { state: 'open' } }, gh = fakeGitHub(resources), rates = [];
  const get = conditionalGet({ exec: gh.exec, onRate: rate => rates.push(rate.remaining) });
  for (let i = 0; i < 10; i++) assert.deepEqual(get('repos/o/r/pulls/1'), { state: 'open' });
  assert.deepEqual(gh.stats, { requests: 10, charged: 1 });
  resources['repos/o/r/pulls/1'] = { state: 'closed' };
  assert.deepEqual(get('repos/o/r/pulls/1'), { state: 'closed' });
  assert.equal(gh.stats.charged, 2);
  assert.equal(rates.at(-1), 4998);
});

test('a real error still fails instead of being mistaken for a 304', () => {
  const get = conditionalGet({ exec: fakeGitHub({}).exec });
  assert.throws(() => get('repos/o/r/pulls/404'), /Not Found/);
});

test('polling waits out the quota reset when few requests remain', () => {
  assert.equal(nextPollDelay({ interval: 60000, rate: { remaining: 4000, reset: 2000 }, now: 1000000 }), 60000);
  assert.equal(nextPollDelay({ interval: 60000, rate: { remaining: 50, reset: 2000 }, now: 1000000 }), 1001000);
  assert.equal(nextPollDelay({ interval: 60000, rate: undefined }), 60000);
});

test('waiting for a merge polls until merged and pays only for the changes', async () => {
  const pull = { state: 'open', merged: false, mergeable_state: 'blocked', head: { sha: 'aaaaaaa1' } };
  const resources = { 'repos/o/r/pulls/7': pull }, gh = fakeGitHub(resources), lines = [];
  let polls = 0;
  const result = await waitForPull({ slug: 'o/r', pr: 7, get: conditionalGet({ exec: gh.exec }), log: line => lines.push(line), interval: 1,
    sleep: async () => { if (++polls === 20) resources['repos/o/r/pulls/7'] = { ...pull, state: 'closed', merged: true, merge_commit_sha: 'm1' }; } });
  assert.deepEqual(result, { code: 0, state: 'merged as m1' });
  assert.equal(gh.stats.requests, 21);
  assert.equal(gh.stats.charged, 2, 'the 19 unchanged polls were free');
  assert.deepEqual(lines, ['#7 open (blocked)', '#7 merged as m1']);
});

test('waiting for checks reports the failures on the current head', async () => {
  const resources = {
    'repos/o/r/pulls/7': { state: 'open', head: { sha: 'bbbbbbb2' } },
    'repos/o/r/commits/bbbbbbb2/check-runs?per_page=100': { check_runs: [{ name: 'preview', status: 'in_progress' }, { name: 'verify', status: 'completed', conclusion: 'success' }] },
  };
  const gh = fakeGitHub(resources);
  const result = await waitForPull({ slug: 'o/r', pr: 7, until: 'checks', get: conditionalGet({ exec: gh.exec }), interval: 1, log: () => {},
    sleep: async () => { resources['repos/o/r/commits/bbbbbbb2/check-runs?per_page=100'] = { check_runs: [{ name: 'preview', status: 'completed', conclusion: 'failure' }, { name: 'verify', status: 'completed', conclusion: 'success' }] }; } });
  assert.deepEqual(result, { code: 1, state: 'bbbbbbb: 2/2 complete, failed: preview' });
});

test('a closed pull request ends a merge wait as a failure, and a deadline as a timeout', async () => {
  const closed = fakeGitHub({ 'repos/o/r/pulls/7': { state: 'closed', merged: false } });
  assert.equal((await waitForPull({ slug: 'o/r', pr: 7, get: conditionalGet({ exec: closed.exec }), sleep: async () => {} })).code, 1);
  let clock = 0;
  const open = fakeGitHub({ 'repos/o/r/pulls/7': { state: 'open', merged: false } });
  const result = await waitForPull({ slug: 'o/r', pr: 7, get: conditionalGet({ exec: open.exec }), timeoutMs: 100, now: () => clock, sleep: async () => { clock += 60; } });
  assert.equal(result.code, 2);
});
