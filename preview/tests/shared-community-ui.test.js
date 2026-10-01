import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(`data:text/javascript,${encodeURIComponent("export async function load(url, context, next) { return url.endsWith('.css') ? {format:'module',source:'',shortCircuit:true} : next(url,context); }")}`, import.meta.url);
const { createCommunityPanel } = await import('../src/community-ui.js');
const { createWishPanel } = await import('../src/wishes-ui.js');

// Small DOM harness: exercise event promises and state ownership without WebGL.
function dom() {
  const nodes = [];
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.events = {}; this.attributes = {}; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; this.isConnected = true; this.classList = { contains: () => false, toggle() {} }; nodes.push(this); }
    append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
    prepend(item) { this.children.unshift(item); item.parent = this; }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, callback) { this.events[type] = callback; }
    async click() { if (!this.disabled) return this.events.click?.({}); }
    cloneNode() { const copy = new Element(this.tagName); copy.children = [...this.children]; return copy; }
    get options() { return this.children; }
    contains(item) { return this.children.some(child => child === item || child.contains(item)); }
    insertBefore(item, before) { item.remove(); item.parent = this; const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, item); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    focus() { document.activeElement = this; }
    closest() { return null; }
  }
  const doc = { createElement: tag => new Element(tag), querySelector: selector => nodes.find(node => `#${node.id}` === selector) ?? null, addEventListener() {}, hidden: false };
  doc.body = new Element('body'); doc.activeElement = doc.body;
  globalThis.document = doc;
  globalThis.window = { addEventListener() {} };
  return { host: new Element('main'), byId: id => doc.querySelector(`#${id}`) };
}
const world = { communityLocations: [{ id: 'a', name: 'Plaza', position: [0, 0, 0] }, { id: 'b', name: 'Café', position: [2, 0, 0] }] };
function setup(options = {}) {
  const elements = dom(), commands = [];
  const client = { async command(command) { commands.push(command); return { ok: true, message: 'Confirmed by town' }; } };
  const panel = createCommunityPanel({ host: elements.host, getVisitor: () => [0,0,0], getPersona: () => 'jevica', getMultiplayer: () => client, ...options });
  panel.setWorld(world);
  return { panel, commands, client, ...elements };
}

test('shared snapshots merge by id, keep personas/selection, and clear removed wishes', async () => {
  const { panel } = setup();
  const local = panel.state.locals[0], persona = local.persona;
  panel.state.selectedId = local.id;
  local.wish = { kind: 'dog' }; local.wishDisruption = 'noise';
  assert.equal(typeof panel.applyRemote, 'function');
  panel.applyRemote({ community: { running: true, elapsed: 42, selectedId: 'other' }, locals: [{ id: local.id, position: [5,6,0], wish: null, wishDisruption: null }], wishes: { ...panel.state.wishes, resolved: 1 } });
  assert.equal(panel.state.selectedId, local.id);
  assert.equal(local.persona, persona);
  assert.deepEqual(local.position, [5,6,0]);
  assert.equal(local.wish, undefined);
  assert.equal(local.wishDisruption, undefined);
  assert.equal(panel.state.elapsed, 42);
  panel.update(1, 1000);
  assert.equal(panel.state.elapsed, 42, 'render updates must not advance shared time');
  assert.equal(panel.autoInteract(local.id, 'ask').ok, false);
  assert.equal(local.needKnown, false);
});

test('shared selection awaits placement and sends focus only after success', async () => {
  let resolve;
  const { panel, commands } = setup({ onFocus: () => new Promise(done => { resolve = done; }) });
  const pending = panel.selectLocal(panel.state.locals[0].id);
  assert.equal(panel.state.selectedId, null);
  resolve(false);
  assert.equal(await pending, false);
  assert.deepEqual(commands, []);
});

test('shared controls send intentions without changing shared state and show rejection', async () => {
  const { panel, commands, client, byId } = setup();
  const local = panel.state.locals[0];
  assert.equal(await panel.selectLocal(local.id), true);
  assert.deepEqual(commands.shift(), { type: 'focus', localId: local.id });
  await byId('community-run').click();
  assert.equal(panel.state.running, false);
  assert.deepEqual(commands.shift(), { type: 'scenario', action: 'start' });
  await byId('community-ask').click();
  assert.equal(local.needKnown, false);
  assert.deepEqual(commands.shift(), { type: 'support', localId: local.id, action: 'ask' });
  client.command = async command => { commands.push(command); return { ok: false, message: 'Only the wish owner can undo it.' }; };
  byId('wish-choice').value = 'dog';
  await byId('wish-grant').click();
  assert.equal(local.wish, undefined);
  assert.deepEqual(commands.shift(), { type: 'wish', localId: local.id, kind: 'dog' });
  assert.match(byId('wish-status').textContent, /Only the wish owner/);
  assert.equal(byId('community-reset').disabled, true);
  assert.equal(byId('community-scenario').disabled, true);
  assert.equal(byId('community-life').disabled, true);
});

test('wish actions stay busy until confirmation and restore focus after success', async () => {
  const { byId } = dom();
  let resolve;
  const panel = createWishPanel({ onGrant: () => new Promise(done => { resolve = done; }), onUndo: async () => ({ ok: true }), onSelect: async () => false });
  const state = { locals: [{ id: 'a' }], wishes: { trouble: 0, affected: 0, resolved: 0 } };
  panel.update(state, state.locals[0], 'jevica');
  const pending = byId('wish-grant').click();
  assert.equal(byId('wish-grant').disabled, true);
  state.locals[0].wish = { kind: 'dog', phase: 'gift', message: 'Woof' };
  panel.update(state, state.locals[0], 'jevica');
  resolve({ ok: true }); await pending;
  assert.equal(document.activeElement, byId('wish-undo'));
});

test('solo scenario controls still mutate local state', async () => {
  const { panel, byId } = setup({ getMultiplayer: () => null });
  await byId('community-run').click();
  assert.equal(panel.state.running, true);
  panel.update(1, 1000);
  assert.ok(panel.state.elapsed > 0);
});

test('nearby selection tries the next candidate after asynchronous refusal', async () => {
  const attempted = [];
  const { panel } = setup({ onFocus: async local => { attempted.push(local.id); return attempted.length > 1; } });
  assert.equal(await panel.meetNearby(), true);
  assert.deepEqual(attempted, panel.state.locals.map(local => local.id));
  assert.equal(panel.state.selectedId, panel.state.locals[1].id);
});

test('shared conversation does not request or apply local inference', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('No local inference in shared mode'); };
  try {
    const { panel, byId } = setup();
    await panel.selectLocal(panel.state.locals[0].id);
    const before = panel.state.locals[0].action;
    await byId('community-about').click();
    assert.equal(calls, 0);
    assert.equal(panel.state.locals[0].action, before);
  } finally { globalThis.fetch = original; }
});

test('shared residents greet an account without treating every visitor as Jevica',async()=>{
  const {panel,byId}=setup();
  assert.equal(await panel.selectLocal(panel.state.locals[0].id),true);
  assert.doesNotMatch(byId('community-speech').textContent,/Jevica!/);
});

test('wish confirmation waits for snapshot before moving focus to undo', async () => {
  const { byId } = dom();
  const panel = createWishPanel({ onGrant: async () => ({ok:true}), onUndo: async () => ({ok:true}), onSelect: async () => false });
  const local = {id:'a'}, state = {locals:[local],wishes:{trouble:0,affected:0,resolved:0}};
  panel.update(state,local,'jevica');
  byId('wish-grant').focus();
  await byId('wish-grant').click();
  assert.equal(document.activeElement,byId('wish-grant'));
  local.wish = {kind:'dog',phase:'gift',message:'Woof'};
  panel.update(state,local,'jevica');
  assert.equal(document.activeElement,byId('wish-undo'));
});
