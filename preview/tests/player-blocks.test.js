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
  blocks.attach(async () => { throw new Error('Please wait before changing blocks.'); });
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
