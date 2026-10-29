import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_CONFIRM_MS, createBlockList, createBlockUI, createBlockedPlayersSettings } from '../src/player-blocks.js';

class Element {
  constructor() { this.children = [];this.dataset = {};this.attributes = {};this.events = {};this.textContent = '';this.hidden = false;this.disabled = false; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) { this.events[type] = listener; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
}
function withDocument(t) {
  const prior = globalThis.document;t.after(() => { globalThis.document = prior; });
  globalThis.document = { createElement: () => new Element() };
}
// A town that answers like /api/blocks: the list it holds, and every call it was asked.
function town(initial = []) {
  const blocked = new Map(initial.map(item => [item.id, item.name])), calls = [];
  const names = { pat: 'Pat', kim: 'Kim' };
  const request = async (action, data) => {
    calls.push([action, data?.peerId ?? null]);
    if (action === 'add') blocked.set(data.peerId, names[data.peerId]);
    if (action === 'remove') blocked.delete(data.peerId);
    return action === 'list' ? { blocked: [...blocked].map(([id, name]) => ({ id, name })) } : { ok: true };
  };
  return { request, calls };
}

test('the block list follows the town, and a reply for an earlier session is dropped', async () => {
  const blocks = createBlockList(), seen = [];
  blocks.subscribe(() => seen.push(blocks.entries().length));
  await assert.rejects(blocks.refresh(), /Sign in/);
  const { request, calls } = town([{ id: 'kim', name: 'Kim' }]);
  blocks.attach(request);await blocks.refresh();
  assert.equal(blocks.loaded, true);assert.equal(blocks.has('kim'), true);
  await blocks.block('pat');
  assert.deepEqual(calls, [['list', null], ['add', 'pat'], ['list', null]]);
  assert.deepEqual(blocks.entries().map(item => item.id).sort(), ['kim', 'pat']);
  // Signing out while a list is in flight: the late reply is not shown to the next session.
  let release;blocks.attach(() => new Promise(resolve => { release = resolve; }));
  const late = blocks.refresh();blocks.attach(null);release({ blocked: [{ id: 'pat', name: 'Pat' }] });await late;
  assert.equal(blocks.loaded, false);assert.deepEqual(blocks.entries(), []);
  assert.ok(seen.length >= 3);
});

test('Block asks once more, Unblock does not, and labels follow a rename', async t => {
  withDocument(t);
  const { request, calls } = town(), blocks = createBlockList();blocks.attach(request);await blocks.refresh();
  const timers = new Map();let next = 1;
  const said = [], ui = createBlockUI({ blocks, announce: text => said.push(text),
    setTimer: (fn, ms) => { assert.equal(ms, BLOCK_CONFIRM_MS);timers.set(next, fn);return next++; }, clearTimer: id => timers.delete(id) });
  const row = new Element();row.dataset.name = 'Pat';
  const button = ui.rosterButton(row, { id: 'pat', name: 'Pat' });
  assert.equal(row.children[0], button);
  assert.deepEqual([button.textContent, button.getAttribute('aria-label')], ['Block', 'Block Pat']);
  await button.events.click();
  assert.deepEqual([button.textContent, button.getAttribute('aria-label')], ['Confirm block', 'Confirm blocking Pat']);
  assert.deepEqual(calls.slice(1), [], 'nothing is sent before the second press');
  assert.match(said.at(-1), /Press again to confirm/);
  // The confirmation lapses.
  [...timers.values()][0]();timers.clear();
  assert.equal(button.textContent, 'Block');
  await button.events.click();await button.events.click();
  assert.deepEqual(calls.slice(1), [['add', 'pat'], ['list', null]]);
  assert.equal(timers.size, 0, 'the lapse timer is cleared once confirmed');
  assert.equal(said.at(-1), 'You blocked Pat. They are not told.');
  row.dataset.name = 'Patricia';blocks.attach(request);await blocks.refresh();
  assert.deepEqual([button.textContent, button.getAttribute('aria-label')], ['Unblock', 'Unblock Patricia']);
  await button.events.click();
  assert.deepEqual(calls.slice(-2), [['remove', 'pat'], ['list', null]]);
  assert.equal(button.textContent, 'Block');
  // A refusal is said aloud and the button works again.
  blocks.attach(async action => { if (action === 'list') return { blocked: [] }; throw new Error('Please wait before changing blocks.'); });
  await blocks.refresh();
  await button.events.click();await button.events.click();
  assert.equal(said.at(-1), 'Please wait before changing blocks.');assert.equal(button.disabled, false);
  await button.events.click();ui.forgetRow('pat');assert.equal(timers.size, 0, 'forgetting a row clears its confirmation');
  ui.dispose();
});

test('Settings lists everyone blocked, each with Unblock, and says when there is no one', async t => {
  withDocument(t);
  const blocks = createBlockList(), settings = createBlockedPlayersSettings({ blocks });
  const [, list, empty, status] = settings.children;
  assert.equal(empty.textContent, 'Residents you block appear here while you’re in town.');
  assert.equal(list.hidden, true);assert.equal(status.getAttribute('role'), 'status');
  const { request } = town([{ id: 'pat', name: 'Pat' }, { id: 'kim', name: 'Kim' }]);
  blocks.attach(request);await blocks.refresh();
  assert.deepEqual(list.children.map(item => item.children[0].textContent), ['Pat', 'Kim']);
  assert.equal(empty.hidden, true);
  const unblockKim = list.children[1].children[1];
  assert.equal(unblockKim.getAttribute('aria-label'), 'Unblock Kim');
  await unblockKim.events.click();
  assert.deepEqual(list.children.map(item => item.children[0].textContent), ['Pat']);
  assert.equal(status.textContent, 'You unblocked Kim.');
  await list.children[0].children[1].events.click();
  assert.equal(list.hidden, true);assert.equal(empty.textContent, 'You haven’t blocked anyone.');
  settings.dispose();
});

for (const action of ['block', 'unblock']) test(`${action} completing after account switch never refreshes the next account or announces success`, async t => {
  withDocument(t);
  const blocks = createBlockList();
  let release;
  blocks.attach(async kind => kind === 'list' ? { blocked: action === 'unblock' ? [{ id: 'pat', name: 'Pat' }] : [] }
    : new Promise(resolve => { release = resolve; }));
  await blocks.refresh();
  const said = [], ui = createBlockUI({ blocks, announce: text => said.push(text) });
  const row = new Element(); row.dataset.name = 'Pat';
  const button = ui.rosterButton(row, { id: 'pat', name: 'Pat' });
  if (action === 'block') await button.events.click();
  const pending = button.events.click();
  let nextReads = 0;
  blocks.attach(async () => { nextReads++; return { blocked: [{ id: 'kim', name: 'Kim' }] }; });
  release({ ok: true }); await pending;
  assert.equal(nextReads, 0);
  assert.deepEqual(blocks.entries(), []);
  assert.ok(!said.some(text => /^You (blocked|unblocked)/.test(text)));
  ui.dispose();
});

test('a refusal or malformed acknowledgement never becomes a successful block', async t => {
  withDocument(t);
  for (const answer of [{ ok: false, error: 'Refused.' }, {}, null]) {
    const blocks = createBlockList();
    blocks.attach(async action => action === 'list' ? { blocked: [] } : answer);
    await blocks.refresh();
    const said = [], ui = createBlockUI({ blocks, announce: text => said.push(text) });
    const row = new Element(); row.dataset.name = 'Pat';
    const button = ui.rosterButton(row, { id: 'pat' });
    await button.events.click(); await button.events.click();
    assert.ok(!said.some(text => text.startsWith('You blocked')), JSON.stringify(answer));
    assert.equal(blocks.has('pat'), false);
    ui.dispose();
  }
});

test('an older list reply cannot undo a confirmed block', async () => {
  const blocks = createBlockList(); let release, reads = 0;
  blocks.attach(async action => action !== 'list' ? { ok: true } : ++reads === 1
    ? new Promise(resolve => { release = resolve; }) : { blocked: [{ id: 'pat', name: 'Pat' }] });
  const old = blocks.refresh();
  await blocks.block('pat'); release({ blocked: [] }); await old;
  assert.equal(blocks.has('pat'), true);
});

test('a failed initial load is recoverable in Settings and never presented as an empty list', async t => {
  withDocument(t);
  const blocks = createBlockList(), settings = createBlockedPlayersSettings({ blocks });
  let unavailable = true;
  blocks.attach(async () => { if (unavailable) throw new Error('Blocking is unavailable.'); return { blocked: [{ id: 'pat', name: 'Pat' }] }; });
  await settings.refresh();
  const [, list, empty, status, retry] = settings.children;
  assert.equal(blocks.loaded, false); assert.equal(list.hidden, true);
  assert.match(status.textContent, /unavailable/);
  assert.doesNotMatch(empty.textContent, /haven’t blocked/);
  unavailable = false; await retry.events.click();
  assert.equal(list.children[0].children[0].textContent, 'Pat');
  blocks.attach(null);
  assert.equal(list.hidden, true); assert.equal(status.textContent, '');
  settings.dispose();
});

test('malformed lists do not erase the last confirmed list', async () => {
  const blocks = createBlockList(); let malformed = false;
  blocks.attach(async () => malformed ? {} : { blocked: [{ id: 'pat', name: 'Pat' }] });
  await blocks.refresh(); malformed = true;
  await assert.rejects(blocks.refresh());
  assert.equal(blocks.has('pat'), true);
});

test('removing a roster row cancels its pending confirmation and ignores late completion', async t => {
  withDocument(t);
  const blocks = createBlockList(); let release;
  blocks.attach(async action => action === 'list' ? { blocked: [] } : new Promise(resolve => { release = resolve; }));
  await blocks.refresh();
  const said = [], ui = createBlockUI({ blocks, announce: text => said.push(text) });
  const row = new Element(); row.dataset.name = 'Pat';
  const button = ui.rosterButton(row, { id: 'pat' });
  await button.events.click(); const pending = button.events.click();
  ui.forgetRow('pat'); release({ ok: true }); await pending;
  assert.ok(!said.some(text => text.startsWith('You blocked')));
  ui.dispose();
});

test('Settings clears old success and late replies on sign-out, and a detached row cannot affect another account', async t => {
  withDocument(t);
  const blocks = createBlockList(), settings = createBlockedPlayersSettings({ blocks });
  let release;
  blocks.attach(async action => action === 'list' ? { blocked: [{ id: 'pat', name: 'Pat' }] }
    : new Promise(resolve => { release = resolve; }));
  await blocks.refresh();
  const [, list, , status] = settings.children, oldButton = list.children[0].children[1];
  const pending = oldButton.events.click();
  let writes = 0;
  blocks.attach(async action => { if (action !== 'list') writes++; return { blocked: [{ id: 'kim', name: 'Kim' }] }; });
  await blocks.refresh(); release({ ok: true }); await pending;
  assert.equal(status.textContent, '');
  oldButton.disabled = false; await oldButton.events.click();
  assert.equal(writes, 0);
  assert.equal(list.children[0].children[0].textContent, 'Kim');
  settings.dispose();
});

test('refreshing Settings clears a previous operation error after recovery', async t => {
  withDocument(t);
  const blocks = createBlockList(), settings = createBlockedPlayersSettings({ blocks });
  blocks.attach(async action => { if (action !== 'list') throw new Error('Try later.'); return { blocked: [{ id: 'pat', name: 'Pat' }] }; });
  await settings.refresh();
  await settings.children[1].children[0].children[1].events.click();
  assert.match(settings.children[3].textContent, /Try later/);
  await settings.refresh();
  assert.equal(settings.children[3].textContent, '');
  settings.dispose();
});

test('a confirmed write followed by a failed refresh never announces success, and Refresh recovers it', async t => {
  withDocument(t);
  const blocks = createBlockList(), { request } = town(); let failList = false;
  blocks.attach(async (action, data) => { if (action === 'list' && failList) throw new Error('List unavailable.'); return request(action, data); });
  await blocks.refresh();
  const said = [], ui = createBlockUI({ blocks, announce: text => said.push(text) });
  const row = new Element(); row.dataset.name = 'Pat'; const button = ui.rosterButton(row, { id: 'pat' });
  await button.events.click(); failList = true; await button.events.click();
  assert.equal(said.at(-1), 'List unavailable.'); assert.ok(!said.some(text => text.startsWith('You blocked')));
  failList = false; await blocks.refresh();
  assert.equal(button.textContent, 'Unblock');
  ui.dispose();
});

test('a confirmation from a previous account cannot submit a one-click block for the next account', async t => {
  withDocument(t);
  const blocks = createBlockList(), first = town(), next = town();
  blocks.attach(first.request); await blocks.refresh();
  const ui = createBlockUI({ blocks }); const row = new Element(); row.dataset.name = 'Pat';
  const button = ui.rosterButton(row, { id: 'pat' });
  await button.events.click(); blocks.attach(next.request); await blocks.refresh();
  await button.events.click();
  assert.deepEqual(next.calls, [['list', null]]);
  assert.equal(button.textContent, 'Confirm block');
  ui.dispose();
});
