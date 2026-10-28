import test from 'node:test';
import assert from 'node:assert/strict';
import { createModerationReports } from '../src/moderation-reports.js';

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase();this.children = [];this.attributes = {};this.events = {};this.textContent = '';this.hidden = false;this.disabled = false; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) { this.events[type] = listener; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  focus() { focused = this; }
  click() { return this.events.click?.({ preventDefault() {} }); }
  get text() { return [this.textContent, ...this.children.map(child => child.text)].join(''); }
}
let focused = null;
function withDocument(t) {
  const prior = globalThis.document;t.after(() => { globalThis.document = prior; });
  globalThis.document = { createElement: tag => new Element(tag) };
}
const reply = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
// A listed report as the route sends it; `extra` adds id, content, respondBy, overdue or closed.
const report = (at, reason, reporter, reported, banned = false, staff = false, extra = {}) => ({ at, reason, reporter: { name: reporter }, reported: { id: `user-${reported}`, name: reported, banned, staff }, ...extra });
// Answers like /auth/session, /api/moderation/reports, /api/moderation/ban and /api/moderation/reports/close, recording each call.
function server({ moderator = true, reports = [report('2026-10-26T10:00:00.000Z', 'harassment', 'pat', 'erin')], signedIn = true, list = null, ban = null, close = null } = {}) {
  const calls = [], banned = new Set();
  const fetcher = async (path, options = {}) => {
    calls.push([options.method ?? 'GET', path, options.headers?.['X-CSRF-Token'] ?? null, options.body ? JSON.parse(options.body) : null]);
    if (path === '/auth/session') return reply(signedIn ? { authenticated: true, user: { id: 'user-mod' }, csrfToken: 'token-1' } : { authenticated: false });
    if (path === '/api/moderation/reports') return list ? list() : reply(moderator
      ? { moderator: true, reports: reports.map(item => ({ ...item, reported: { ...item.reported, banned: item.reported.banned || banned.has(item.reported.id) } })) } : { moderator: false });
    if (path === '/api/moderation/ban') {
      if (ban) return ban();
      const body = JSON.parse(options.body);if (body.banned) banned.add(body.userId);else banned.delete(body.userId);return reply({ ok: true });
    }
    if (path === '/api/moderation/reports/close') {
      if (close) return close();
      const body = JSON.parse(options.body), item = reports.find(entry => entry.id === body.id);
      if (!item) return reply({ error: 'That report isn’t here.' }, 404);
      item.closed = { at: '2026-10-27T12:00:00.000Z', by: 'mod' };item.overdue = false;return reply({ ok: true });
    }
    throw new Error(`unexpected ${path}`);
  };
  return { fetcher, calls };
}
const parts = root => { const [heading, help, status, list] = root.children;return { heading, help, status, list }; };
const rows = root => parts(root).list.children.map(row => { const [summary, meta, content, actions] = row.children;return { row, summary: summary.text, meta: meta.text, content, actions: actions.children }; });

test('residents and signed-out visitors never see the reports group', async t => {
  withDocument(t);
  const resident = server({ moderator: false }), root = createModerationReports({ fetcher: resident.fetcher });
  assert.equal(root.hidden, true);
  await root.refresh();
  assert.equal(root.hidden, true);
  const signedOut = server({ signedIn: false }), other = createModerationReports({ fetcher: signedOut.fetcher });
  await other.refresh();
  assert.equal(other.hidden, true);
  assert.deepEqual(signedOut.calls.map(call => call[1]), ['/auth/session'], 'no list request without a session');
});

test('a moderator sees each report, newest first, with names kept as text', async t => {
  withDocument(t);
  const { fetcher } = server({ reports: [report('2026-10-26T10:00:00.000Z', 'disruption', '<img src=x onerror=alert(1)>', 'pat'),
    report('2026-10-25T09:00:00.000Z', 'harassment', 'pat', 'erin', true), report('2026-10-24T08:00:00.000Z', 'cheating', 'kim', 'mod')] });
  const root = createModerationReports({ fetcher });
  await root.refresh();
  assert.equal(root.hidden, false);
  assert.equal(parts(root).heading.textContent, 'Reports');
  const listed = rows(root);
  assert.deepEqual(listed.map(item => item.summary), ['pat: disruptive', 'erin: harassment (banned)', 'mod: cheating']);
  assert.match(listed[0].meta, /^Reported by <img src=x onerror=alert\(1\)>, /, 'a name is text, never markup');
  assert.equal(listed[0].row.children[1].children[0].getAttribute('datetime'), '2026-10-26T10:00:00.000Z');
  assert.deepEqual(listed.map(item => item.actions.map(button => button.textContent)), [['Ban pat…'], ['Lift erin’s ban'], []], 'each action names its account; none on your own');
  assert.equal(parts(root).list.getAttribute('aria-label'), 'Reports, newest first');
});

test('a ban asks first, then goes through the server with the session token', async t => {
  withDocument(t);
  const api = server(), root = createModerationReports({ fetcher: api.fetcher });
  await root.refresh();
  const [start] = rows(root)[0].actions;
  start.click();
  let [confirm, cancel] = rows(root)[0].actions;
  assert.deepEqual([confirm.textContent, cancel.textContent], ['Ban erin', 'Cancel']);
  assert.equal(focused, confirm);
  cancel.click();
  assert.deepEqual(rows(root)[0].actions.map(button => button.textContent), ['Ban erin…']);
  assert.equal(focused, rows(root)[0].actions[0]);
  assert.equal(api.calls.filter(call => call[1] === '/api/moderation/ban').length, 0, 'nothing is sent before the confirmation');
  rows(root)[0].actions[0].click();
  [confirm] = rows(root)[0].actions;
  await confirm.click();
  assert.deepEqual(api.calls.find(call => call[1] === '/api/moderation/ban'), ['POST', '/api/moderation/ban', 'token-1', { userId: 'user-erin', banned: true }]);
  assert.deepEqual(rows(root).map(item => [item.summary, item.actions.map(button => button.textContent)]), [['erin: harassment (banned)', ['Lift erin’s ban']]]);
  assert.equal(parts(root).status.textContent, 'erin is banned.');
  await rows(root)[0].actions[0].click();
  assert.deepEqual(api.calls.filter(call => call[1] === '/api/moderation/ban').at(-1)[3], { userId: 'user-erin', banned: false });
  assert.equal(parts(root).status.textContent, 'erin’s ban is lifted.');
});

test('no ban is offered for a moderator, a waitlist admin or an owner; a ban already on one can be lifted', async t => {
  withDocument(t);
  const { fetcher } = server({ reports: [report('2026-10-26T10:00:00.000Z', 'harassment', 'pat', 'mod2', false, true),
    report('2026-10-25T10:00:00.000Z', 'cheating', 'kim', 'admin', true, true)] });
  const root = createModerationReports({ fetcher });
  await root.refresh();
  assert.deepEqual(rows(root).map(item => item.actions.map(button => button.textContent)), [[], ['Lift admin’s ban']]);
});

test('when the list can\'t refresh after a ban, the row shows the change, both messages show and every button works again', async t => {
  withDocument(t);
  let limited = false;
  const api = server({ list: () => limited ? reply({ moderator: true, error: 'Please wait a moment before refreshing reports.' }, 429)
    : reply({ moderator: true, reports: [report('2026-10-26T10:00:00.000Z', 'harassment', 'pat', 'erin'), report('2026-10-25T10:00:00.000Z', 'cheating', 'kim', 'sam')] }),
  ban: () => { limited = true;return reply({ ok: true }); } });
  const root = createModerationReports({ fetcher: api.fetcher });
  await root.refresh();
  rows(root)[0].actions[0].click();
  await rows(root)[0].actions[0].click();
  assert.equal(parts(root).status.textContent, 'erin is banned. Please wait a moment before refreshing reports.');
  assert.deepEqual(rows(root).map(item => [item.summary, item.actions.map(button => [button.textContent, button.disabled])]),
    [['erin: harassment (banned)', [['Lift erin’s ban', false]]], ['sam: cheating', [['Ban sam…', false]]]]);
});

test('a lift whose list can\'t refresh shows the account as no longer banned', async t => {
  withDocument(t);
  let limited = false;
  const api = server({ list: () => limited ? reply({ moderator: true, error: 'Please wait a moment before refreshing reports.' }, 429)
    : reply({ moderator: true, reports: [report('2026-10-26T10:00:00.000Z', 'harassment', 'pat', 'erin', true)] }),
  ban: () => { limited = true;return reply({ ok: true }); } });
  const root = createModerationReports({ fetcher: api.fetcher });
  await root.refresh();
  await rows(root)[0].actions[0].click();
  assert.equal(parts(root).status.textContent, 'erin’s ban is lifted. Please wait a moment before refreshing reports.');
  assert.deepEqual(rows(root).map(item => [item.summary, item.actions.map(button => [button.textContent, button.disabled])]), [['erin: harassment', [['Ban erin…', false]]]]);
});

test('when a newer refresh takes over after a ban and fails, the row still shows the ban', async t => {
  withDocument(t);
  let lists = 0, release;
  const slow = new Promise(resolve => { release = resolve; });
  const { fetcher } = server({ list: async () => {
    lists++;
    // The list after the ban waits; Account reopening asks again and is limited.
    if (lists === 2) { await slow;return reply({ moderator: true, reports: [report('2026-10-26T10:00:00.000Z', 'harassment', 'pat', 'erin', true)] }); }
    if (lists === 3) return reply({ moderator: true, error: 'Please wait a moment before refreshing reports.' }, 429);
    return reply({ moderator: true, reports: [report('2026-10-26T10:00:00.000Z', 'harassment', 'pat', 'erin')] });
  } });
  const root = createModerationReports({ fetcher });
  await root.refresh();
  rows(root)[0].actions[0].click();
  const sent = rows(root)[0].actions[0].click();
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
  await root.refresh();
  release();await sent;
  assert.deepEqual(rows(root).map(item => [item.summary, item.actions.map(button => [button.textContent, button.disabled])]), [['erin: harassment (banned)', [['Lift erin’s ban', false]]]]);
  assert.equal(parts(root).status.textContent, 'erin is banned. Please wait a moment before refreshing reports.');
});

test('every button stays held until the list after a ban has loaded', async t => {
  withDocument(t);
  let release, waiting = false;
  const pending = new Promise(resolve => { release = resolve; });
  // The server() fake marks erin banned once the ban arrives; the list after it waits.
  const api = server(), fetcher = async (path, options) => {
    if (path === '/api/moderation/reports' && waiting) await pending;
    return api.fetcher(path, options);
  };
  const root = createModerationReports({ fetcher });
  await root.refresh();
  rows(root)[0].actions[0].click();
  const [confirm, cancel] = rows(root)[0].actions;
  waiting = true;
  const sent = confirm.click();
  for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(api.calls.filter(call => call[1] === '/api/moderation/ban').length, 1);
  assert.deepEqual([confirm.disabled, cancel.disabled], [true, true]);
  assert.deepEqual(rows(root).map(item => [item.summary, item.actions.map(button => [button.textContent, button.disabled])]),
    [['erin: harassment (banned)', [['Lift erin’s ban', true]]]], 'the change shows at once, held while the list reloads');
  release();await sent;
  assert.deepEqual(rows(root)[0].actions.map(button => [button.textContent, button.disabled]), [['Lift erin’s ban', false]]);
});

test('a ban that finishes while another is on its way leaves the buttons held', async t => {
  withDocument(t);
  let releaseList, releaseBan;
  const slowList = new Promise(resolve => { releaseList = resolve; }), slowBan = new Promise(resolve => { releaseBan = resolve; });
  let lists = 0, bans = 0;
  const two = [report('2026-10-26T10:00:00.000Z', 'harassment', 'pat', 'erin'), report('2026-10-25T10:00:00.000Z', 'cheating', 'kim', 'sam')];
  const { fetcher } = server({ list: async () => {
    // The second list, after the first ban, waits; the Account pane reopening asks a third time.
    if (++lists === 2) await slowList;
    return reply({ moderator: true, reports: two });
  }, ban: async () => { if (++bans === 2) await slowBan;return reply({ ok: true }); } });
  const root = createModerationReports({ fetcher });
  const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };
  await root.refresh();
  rows(root)[0].actions[0].click();
  const first = rows(root)[0].actions[0].click();
  await settle();
  await root.refresh();
  rows(root)[1].actions[0].click();
  const second = rows(root)[1].actions[0].click();
  await settle();
  releaseList();await first;
  assert.ok(rows(root).flatMap(item => item.actions).every(button => button.disabled), 'the second ban is still on its way');
  releaseBan();await second;
  assert.ok(rows(root).flatMap(item => item.actions).every(button => !button.disabled));
});

test('a refused ban says why and keeps the list', async t => {
  withDocument(t);
  const root = createModerationReports({ fetcher: server({ ban: () => reply({ error: 'Moderator access required.' }, 403) }).fetcher });
  await root.refresh();
  rows(root)[0].actions[0].click();
  await rows(root)[0].actions[0].click();
  assert.equal(parts(root).status.textContent, 'Moderator access required.');
  assert.equal(focused, parts(root).status);
  assert.deepEqual(rows(root).map(item => item.summary), ['erin: harassment']);
  assert.ok(rows(root)[0].actions.every(button => !button.disabled), 'its buttons work again');
});

test('empty and unavailable lists say so; a late answer never replaces a newer one', async t => {
  withDocument(t);
  const empty = createModerationReports({ fetcher: server({ reports: [] }).fetcher });
  await empty.refresh();
  assert.equal(empty.hidden, false);assert.equal(parts(empty).status.textContent, 'No reports yet.');
  const down = createModerationReports({ fetcher: server({ list: () => reply({ moderator: true, error: 'Reports are unavailable right now.' }, 503) }).fetcher });
  await down.refresh();
  assert.equal(down.hidden, false);assert.equal(parts(down).status.textContent, 'Reports are unavailable right now.');

  let release;
  const slow = new Promise(resolve => { release = resolve; });
  let first = true;
  const racing = server({ list: async () => {
    if (first) { first = false;await slow;return reply({ moderator: true, reports: [report('2026-10-20T00:00:00.000Z', 'cheating', 'old', 'stale')] }); }
    return reply({ moderator: true, reports: [report('2026-10-26T00:00:00.000Z', 'harassment', 'pat', 'erin')] });
  } });
  const root = createModerationReports({ fetcher: racing.fetcher });
  const older = root.refresh();
  await root.refresh();
  release();await older;
  assert.deepEqual(rows(root).map(item => item.summary), ['erin: harassment']);
});

test('while a ban is on its way the row cannot send another', async t => {
  withDocument(t);
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const api = server({ ban: async () => { await pending;return reply({ ok: true }); } });
  const root = createModerationReports({ fetcher: api.fetcher });
  await root.refresh();
  rows(root)[0].actions[0].click();
  const [confirm, cancel] = rows(root)[0].actions;
  const sent = confirm.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(confirm.disabled, true);assert.equal(cancel.disabled, true);
  confirm.click();
  release();await sent;
  assert.equal(api.calls.filter(call => call[1] === '/api/moderation/ban').length, 1);
});

test('a failed request shows nothing to a resident, and says so to a known moderator', async t => {
  withDocument(t);
  // Limits and outages answer before the route knows who is asking.
  for (const failure of [reply({ error: 'Too many requests. Try again shortly.' }, 429), reply({ error: 'The town is temporarily unavailable.' }, 503), reply({ error: 'Not found' }, 404)]) {
    const root = createModerationReports({ fetcher: server({ list: () => failure }).fetcher });
    await root.refresh();
    assert.equal(root.hidden, true, String(failure.status));
  }
  let failing = false;
  const root = createModerationReports({ fetcher: server({ list: () => failing ? reply({ error: 'The town is temporarily unavailable.' }, 503)
    : reply({ moderator: true, reports: [report('2026-10-26T10:00:00.000Z', 'harassment', 'pat', 'erin')] }) }).fetcher });
  await root.refresh();
  failing = true;await root.refresh();
  assert.equal(root.hidden, false);
  assert.equal(parts(root).status.textContent, 'Reports are unavailable right now.', 'not the outage text from another route');
  assert.deepEqual(rows(root).map(item => item.summary), ['erin: harassment'], 'the last list stays, under the failure');
  // Reopening Account often can reach the read limit; the list stays then too.
  failing = false;await root.refresh();
  const limited = createModerationReports({ fetcher: server({ list: () => reply({ moderator: true, error: 'Please wait a moment before refreshing reports.' }, 429) }).fetcher });
  await limited.refresh();
  assert.equal(parts(limited).status.textContent, 'Please wait a moment before refreshing reports.');
  // Once the server says the account no longer moderates, a later failure is a resident's.
  let answer = reply({ moderator: false });
  const demoted = createModerationReports({ fetcher: server({ list: () => answer }).fetcher });
  answer = reply({ moderator: true, reports: [] });await demoted.refresh();
  answer = reply({ moderator: false });await demoted.refresh();
  answer = reply({ error: 'The town is temporarily unavailable.' }, 503);await demoted.refresh();
  assert.equal(demoted.hidden, true);
});

test('ban failures read as plain sentences', async t => {
  withDocument(t);
  for (const [ban, shown] of [[() => reply({ error: 'waitlist_approval_required' }, 403), 'The ban didn’t change. Try again.'],
    [() => { throw new TypeError('Failed to fetch'); }, 'The ban didn’t change. Try again.'],
    [() => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); } }), 'The ban didn’t change. Try again.'],
    [() => reply({ error: 'Invalid moderation action.' }, 400), 'Invalid moderation action.']]) {
    const root = createModerationReports({ fetcher: server({ ban }).fetcher });
    await root.refresh();
    rows(root)[0].actions[0].click();
    await rows(root)[0].actions[0].click();
    assert.equal(parts(root).status.textContent, shown);
  }
});

test('when a ban leaves the group hidden, focus stays in the Account pane', async t => {
  withDocument(t);
  let moderator = true;
  const pane = { focus() { focused = pane; } };
  const api = server({ list: () => reply(moderator ? { moderator: true, reports: [report('2026-10-26T10:00:00.000Z', 'harassment', 'pat', 'erin')] } : { moderator: false }),
    ban: () => { moderator = false;return reply({ ok: true }); } });
  const root = createModerationReports({ fetcher: api.fetcher });
  root.closest = selector => selector === '[role="tabpanel"]' ? pane : null;
  await root.refresh();
  rows(root)[0].actions[0].click();
  await rows(root)[0].actions[0].click();
  assert.equal(root.hidden, true);
  assert.equal(focused, pane);
});

test('a report shows what it carries, when to respond by, overdue and closed states, and a Close that goes through the server', async t => {
  withDocument(t);
  const open = report('2026-10-26T10:00:00.000Z', 'harassment', 'pat', 'erin', false, false, { id: 'report-open', content: { quoted: '<b>go away</b>', chat: [{ at: null, text: 'first' }, { at: '2026-10-26T09:59:00.000Z', text: 'second' }] }, respondBy: '2026-10-27T10:00:00.000Z', overdue: false, closed: null });
  const overdue = report('2026-10-25T10:00:00.000Z', 'cheating', 'kim', 'sam', false, false, { id: 'report-late', content: null, respondBy: '2026-10-26T10:00:00.000Z', overdue: true, closed: null });
  const closed = report('2026-10-24T10:00:00.000Z', 'disruption', 'kim', 'mod2', false, true, { id: 'report-done', content: { quoted: 'hmm' }, respondBy: '2026-10-25T10:00:00.000Z', overdue: false, closed: { at: '2026-10-24T12:00:00.000Z', by: 'mod' } });
  const api = server({ reports: [open, overdue, closed] }), root = createModerationReports({ fetcher: api.fetcher });
  await root.refresh();
  const listed = rows(root);
  assert.deepEqual(listed.map(item => item.row.className), ['moderation-report', 'moderation-report moderation-report-overdue', 'moderation-report moderation-report-closed']);
  assert.match(listed[0].meta, /^Reported by pat, .*\. Respond by /);
  assert.equal(listed[0].row.children[1].children[2].getAttribute('datetime'), '2026-10-27T10:00:00.000Z', 'the response target is a time');
  assert.match(listed[1].meta, /\. Overdue, was due /);
  assert.match(listed[2].meta, /\. Closed by mod, /);
  // The quoted text and the chat lines are text, never markup.
  const [quote, chat] = listed[0].content.children;
  assert.deepEqual([quote.tagName, quote.textContent], ['BLOCKQUOTE', '<b>go away</b>']);
  assert.deepEqual([chat.tagName, chat.getAttribute('aria-label'), chat.children.map(line => line.textContent)], ['UL', 'erin’s last messages', ['first', 'second']]);
  assert.deepEqual(listed[1].content.children, [], 'nothing shown for a report that carries nothing');
  assert.deepEqual(listed.map(item => item.actions.map(button => button.textContent)), [['Ban erin…', 'Close report'], ['Ban sam…', 'Close report'], []], 'no Close on a closed report; staff can\'t be banned');
  await listed[1].actions[1].click();
  assert.deepEqual(api.calls.find(call => call[1] === '/api/moderation/reports/close'), ['POST', '/api/moderation/reports/close', 'token-1', { id: 'report-late' }]);
  assert.equal(parts(root).status.textContent, 'Report closed.');
  assert.equal(focused, parts(root).status);
  assert.deepEqual(rows(root).map(item => [item.row.className, item.actions.map(button => button.textContent)]),
    [['moderation-report', ['Ban erin…', 'Close report']], ['moderation-report moderation-report-closed', ['Ban sam…']], ['moderation-report moderation-report-closed', []]]);
  assert.match(rows(root)[1].meta, /\. Closed by mod, /);
});

test('a Close that is refused says why and keeps the report open; the row shows the change when the list can\'t reload', async t => {
  withDocument(t);
  const item = report('2026-10-26T10:00:00.000Z', 'harassment', 'pat', 'erin', false, false, { id: 'report-open', content: null, respondBy: '2026-10-27T10:00:00.000Z', overdue: false, closed: null });
  const refused = server({ reports: [item], close: () => reply({ error: 'That report isn’t here.' }, 404) }), root = createModerationReports({ fetcher: refused.fetcher });
  await root.refresh();
  await rows(root)[0].actions[1].click();
  assert.equal(parts(root).status.textContent, 'That report isn’t here.');
  assert.deepEqual(rows(root)[0].actions.map(button => [button.textContent, button.disabled]), [['Ban erin…', false], ['Close report', false]]);
  let limited = false;
  const api = server({ list: () => limited ? reply({ moderator: true, error: 'Please wait a moment before refreshing reports.' }, 429) : reply({ moderator: true, reports: [item] }), close: () => { limited = true;return reply({ ok: true }); } });
  const other = createModerationReports({ fetcher: api.fetcher });
  await other.refresh();
  await rows(other)[0].actions[1].click();
  assert.equal(parts(other).status.textContent, 'Report closed. Please wait a moment before refreshing reports.');
  assert.deepEqual(rows(other).map(entry => [entry.row.className, entry.actions.map(button => [button.textContent, button.disabled])]), [['moderation-report moderation-report-closed', [['Ban erin…', false]]]]);
  assert.match(rows(other)[0].meta, /\. Closed by you, /);
});
