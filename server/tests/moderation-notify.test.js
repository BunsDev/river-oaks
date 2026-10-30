import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { NOTIFY_LIMIT, RESPONSE_HOURS, createModerationNotifier, moderationNotifierFromEnv, responseHoursFromEnv } from '../moderation-notify.js';
import { CHAT_LINES, CONTENT_BYTES, QUOTE_LENGTH, closeRequest, normalizeReport, reportContent, reportId, submitReport } from '../moderation-reports.js';

// Moderation routing (#292): a saved report reaches the moderators' inbox over HTTPS with
// bounded sends; the reporter is never kept waiting on it, and a failed send is logged by
// report id only.

const notice = { id: 'report-1', at: '2026-10-27T20:00:00.000Z', reason: 'harassment', reporter: { id: 'u1', name: 'pat' }, reported: { id: 'u2', name: 'erin' }, content: { quoted: 'go away' }, respondBy: '2026-10-28T20:00:00.000Z' };

test('a notice is posted as JSON with the bearer token, over a real local server', async t => {
  const received = [];
  const inbox = createServer((req, res) => { let body = ''; req.on('data', chunk => { body += chunk; }); req.on('end', () => { received.push({ headers: req.headers, body: JSON.parse(body) }); res.writeHead(204); res.end(); }); });
  await new Promise(resolve => inbox.listen(0, '127.0.0.1', resolve));
  t.after(() => inbox.close());
  const notifier = createModerationNotifier({ url: `http://127.0.0.1:${inbox.address().port}/hook`, token: 'inbox-token' });
  assert.deepEqual(await notifier.notify(notice), { sent: true });
  assert.equal(received.length, 1);
  assert.equal(received[0].headers.authorization, 'Bearer inbox-token');
  assert.equal(received[0].headers['content-type'], 'application/json');
  assert.deepEqual(received[0].body, { type: 'report', ...notice });
});

test('sends are bounded per window, never throw, and log only the report id', async () => {
  const logged = [], calls = [];
  let answer = () => ({ ok: true, status: 204 });
  let time = 1_000_000;
  const notifier = createModerationNotifier({ url: 'https://inbox.example/hook', token: 'secret-token', fetch: async (url, options) => { calls.push([url, options]); return answer(); }, now: () => time, limit: 2, windowMs: 60_000, log: message => logged.push(message) });
  assert.deepEqual(await notifier.notify(notice), { sent: true });
  assert.deepEqual(await notifier.notify({ ...notice, id: 'report-2' }), { sent: true });
  assert.deepEqual(await notifier.notify({ ...notice, id: 'report-3' }), { sent: false, reason: 'limited' });
  assert.equal(calls.length, 2, 'the third isn\'t sent');
  assert.match(logged.at(-1), /report-3/);
  time += 60_000;
  answer = () => ({ ok: false, status: 500 });
  assert.deepEqual(await notifier.notify({ ...notice, id: 'report-4' }), { sent: false, reason: 'status_500' }, 'a new window sends again');
  answer = () => { throw new TypeError('fetch failed'); };
  assert.deepEqual(await notifier.notify({ ...notice, id: 'report-5' }), { sent: false, reason: 'error' });
  for (const message of logged) { assert.doesNotMatch(message, /secret-token/); assert.doesNotMatch(message, /inbox\.example/); }
  assert.equal(calls[0][1].redirect, 'error', 'a redirect never carries the token elsewhere');
  assert.ok(calls[0][1].signal, 'every send can time out');
});

test('a send that hangs times out', async () => {
  const notifier = createModerationNotifier({ url: 'https://inbox.example/hook', timeoutMs: 20, log: () => {},
    fetch: (url, { signal }) => new Promise((resolve, reject) => { signal.addEventListener('abort', () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); }); }) });
  assert.deepEqual(await notifier.notify(notice), { sent: false, reason: 'timeout' });
});

test('the inbox must be https (or loopback), and the environment configures it', () => {
  for (const url of ['http://inbox.example/hook', 'ftp://inbox.example', 'not a url', '']) assert.throws(() => createModerationNotifier({ url }), /https/, url);
  assert.equal(createModerationNotifier({ url: 'https://inbox.example/hook' }).enabled, true);
  assert.equal(createModerationNotifier({ url: 'http://localhost:9/hook' }).enabled, true);
  assert.throws(() => createModerationNotifier({ url: 'https://inbox.example/hook', token: 'bad\ntoken' }), /TOKEN/);
  assert.equal(moderationNotifierFromEnv({}), null);
  assert.equal(moderationNotifierFromEnv({ MODERATION_NOTIFY_URL: '' }), null);
  assert.equal(moderationNotifierFromEnv({ MODERATION_NOTIFY_URL: 'https://inbox.example/hook', MODERATION_NOTIFY_TOKEN: 't' }).enabled, true);
  assert.equal(NOTIFY_LIMIT, 20);
  assert.equal(responseHoursFromEnv({}), RESPONSE_HOURS);
  assert.equal(responseHoursFromEnv({ MODERATION_RESPONSE_HOURS: '48' }), 48);
  for (const value of ['0', '-1', 'soon', '1000']) assert.throws(() => responseHoursFromEnv({ MODERATION_RESPONSE_HOURS: value }), /hours/, value);
});

test('what a report carries is bounded: a quote, the last chat lines, under the audit entry limit', () => {
  assert.equal(reportContent({}), null);
  assert.equal(reportContent({ quoted: '   ', chat: [] }), null);
  assert.deepEqual(reportContent({ quoted: ' go \u0007 away\n now ', chat: [{ at: 1_761_600_000_000, text: 'one' }, { at: 'x', text: 'two' }, { at: '2026-10-27T20:00:00.000Z', text: 'three' }, { at: 1, text: '' }, { text: 'four' }] }),
    { quoted: 'go away now', chat: [{ at: null, text: 'two' }, { at: '2026-10-27T20:00:00.000Z', text: 'three' }, { at: null, text: 'four' }] }, `the last ${CHAT_LINES} lines, oldest first; a time that isn't one is dropped`);
  const long = reportContent({ quoted: 'é'.repeat(1000), chat: Array.from({ length: 5 }, (_, i) => ({ at: null, text: `${i} `.repeat(200) })) });
  assert.equal([...long.quoted].length <= QUOTE_LENGTH, true);
  assert.ok(Buffer.byteLength(JSON.stringify(long)) <= CONTENT_BYTES, 'under the limit');
  assert.ok(long.chat.length < CHAT_LINES, 'the oldest chat lines went first');
  const quoteOnly = reportContent({ quoted: '😀'.repeat(QUOTE_LENGTH), chat: [] });
  assert.ok(Buffer.byteLength(JSON.stringify(quoteOnly)) <= CONTENT_BYTES);
  assert.ok(quoteOnly.quoted.length > 0);
});

test('a report without an id gets a stable one, and a close body must name one', () => {
  const entry = { at: '2026-10-26T10:00:00.000Z', type: 'report', reporterId: 'a', userId: 'b', reason: 'harassment' };
  const first = normalizeReport(entry), again = normalizeReport(entry);
  assert.equal(first.id, again.id);
  assert.match(first.id, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(first.content, null);
  assert.equal(first.respondBy, null);
  const kept = normalizeReport({ ...entry, id: 'e3a1c0de-0000-4000-8000-000000000001', content: { quoted: 'hey', extra: 1 }, respondBy: '2026-10-27T10:00:00.000Z' });
  assert.deepEqual(kept, { at: entry.at, reporterId: 'a', reportedId: 'b', reason: 'harassment', id: 'e3a1c0de-0000-4000-8000-000000000001', content: { quoted: 'hey' }, respondBy: '2026-10-27T10:00:00.000Z' });
  assert.equal(reportId({ ...entry, reportedId: 'b', id: 'short' }).length, 32, 'a malformed id is replaced');
  assert.equal(closeRequest({ id: kept.id }), kept.id);
  for (const body of [null, {}, { id: 'x' }, { id: 42 }, { id: 'a'.repeat(65) }, 'text']) assert.equal(closeRequest(body), null, JSON.stringify(body));
});

test('submitReport: present, recently spoken or named accounts can be reported; the inbox is told after the save', async () => {
  const saved = [], notices = [];
  const notifier = { notify: async notice => { notices.push(notice); return { sent: true }; } };
  const base = Date.parse('2026-10-27T22:40:00.000Z'), iso = ms => new Date(ms).toISOString();
  const chat = [{ authorId: 'erin', text: 'first', at: base }, { authorId: 'pat', text: 'mine', at: base + 1_000 }, { authorId: 'erin', text: 'second', at: base + 2_000 }];
  const intake = (message, extra = {}) => submitReport({ reporterId: 'pat', message, present: id => id === 'kim', chat, usernameOf: async id => id === 'gone' ? 'gone-name' : null,
    save: async entry => { saved.push(entry); return true; }, notifier, responseHours: 12, now: () => base + 10_000, ...extra });
  for (const message of [{ playerId: 'pat', reason: 'harassment' }, { playerId: 'nobody', reason: 'harassment' }, { playerId: 'kim', reason: 'spam' }, { playerId: '', reason: 'harassment' }, {}])
    assert.deepEqual(await intake(message), { ok: false, message: 'Report could not be submitted.' }, JSON.stringify(message));
  assert.equal(saved.length, 0);
  assert.deepEqual(await intake({ playerId: 'kim', reason: 'harassment', text: 'what kim said' }), { ok: true, message: 'Report saved.' });
  assert.deepEqual(await intake({ playerId: 'erin', reason: 'disruption' }), { ok: true, message: 'Report saved.' }, 'erin left but spoke recently');
  assert.deepEqual(await intake({ playerId: 'gone', reason: 'cheating' }), { ok: true, message: 'Report saved.' }, 'gone has a username');
  assert.equal(saved.length, 3);
  assert.deepEqual(saved.map(({ id, ...rest }) => { assert.match(id, /^[0-9a-f-]{36}$/); return rest; }), [
    { at: iso(base + 10_000), reporterId: 'pat', reportedId: 'kim', reason: 'harassment', content: { quoted: 'what kim said' }, respondBy: iso(base + 10_000 + 12 * 3_600_000) },
    { at: iso(base + 10_000), reporterId: 'pat', reportedId: 'erin', reason: 'disruption', content: { chat: [{ at: iso(base), text: 'first' }, { at: iso(base + 2_000), text: 'second' }] }, respondBy: iso(base + 10_000 + 12 * 3_600_000) },
    { at: iso(base + 10_000), reporterId: 'pat', reportedId: 'gone', reason: 'cheating', content: null, respondBy: iso(base + 10_000 + 12 * 3_600_000) },
  ]);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(notices.length, 3);
  assert.deepEqual(notices[2], { id: saved[2].id, at: saved[2].at, reason: 'cheating', content: null, respondBy: saved[2].respondBy, reporter: { id: 'pat', name: notices[2].reporter.name }, reported: { id: 'gone', name: 'gone-name' } });
  assert.ok(notices[2].reporter.name.length > 0, 'a reporter without a username still has a shown name');
  // A refused save, a failed save, and a throwing or slow inbox never change the reporter's answer.
  assert.deepEqual(await intake({ playerId: 'kim', reason: 'harassment' }, { save: async () => false }), { ok: false, message: 'Report could not be submitted.' });
  assert.deepEqual(await intake({ playerId: 'kim', reason: 'harassment' }, { save: async () => { throw new Error('offline'); } }), { ok: false, message: 'Report unavailable. Try again.' });
  assert.deepEqual(await intake({ playerId: 'kim', reason: 'harassment' }, { notifier: { notify: () => new Promise(() => {}) } }), { ok: true, message: 'Report saved.' });
  assert.deepEqual(await intake({ playerId: 'kim', reason: 'harassment' }, { notifier: { notify: async () => { throw new Error('boom'); } } }), { ok: true, message: 'Report saved.' });
  assert.deepEqual(await intake({ playerId: 'kim', reason: 'harassment' }, { usernameOf: async () => { throw new Error('store offline'); } }), { ok: true, message: 'Report saved.' }, 'a failed name lookup still saves a report about someone present');
});
