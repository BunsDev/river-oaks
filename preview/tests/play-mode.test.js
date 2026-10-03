import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_MODE_KEY } from '../src/multiplayer-mode.js';
import { createPlayMode } from '../src/play-mode.js';

// Just enough of a page for the control: elements, attributes, containment,
// and clicks that run their own listeners, bubble, then reach the document.
class FakeElement {
  constructor(document, tag) {
    Object.assign(this, { ownerDocument: document, tagName: tag.toUpperCase(), children: [], parent: null, attributes: new Map(), dataset: {}, listeners: new Map(), hidden: false, textContent: '', className: '', id: '', type: '' });
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  contains(node) { for (let current = node; current; current = current.parent) if (current === this) return true; return false; }
  focus() { this.ownerDocument.activeElement = this; }
  find(match) { return match(this) ? this : this.children.map(child => child.find(match)).find(Boolean) ?? null; }
  click() {
    const event = { type: 'click', target: this };
    for (let node = this; node; node = node.parent) for (const listener of node.listeners.get('click') ?? []) listener(event);
    for (const listener of this.ownerDocument.listeners.get('click') ?? []) listener(event);
  }
}
function openTab(storage, active, { remembered = true } = {}) {
  const document = { listeners: new Map(), activeElement: null, createElement: tag => new FakeElement(document, tag), addEventListener: FakeElement.prototype.addEventListener };
  const viewport = new FakeElement(document, 'main'), changes = [], previous = globalThis.document;
  globalThis.document = document;
  try { createPlayMode({ viewport, storage, active, remembered, onChange: mode => changes.push(mode) }); }
  finally { globalThis.document = previous; }
  const [toggle, options] = viewport.children[0].children;
  return { toggle, options, changes, button: mode => options.find(node => node.dataset.playMode === mode) };
}
const sharedStorage = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

test('each tab compares a choice with the mode it is running, not the shared preference', () => {
  const storage = sharedStorage(), first = openTab(storage, 'solo'), second = openTab(storage, 'solo');
  first.toggle.click(); first.button('multiplayer').click();
  assert.deepEqual(first.changes, ['multiplayer']);
  // The first tab's switch stored multiplayer before it reloaded.
  storage.values.set(PLAY_MODE_KEY, 'multiplayer');
  second.toggle.click();
  assert.equal(second.toggle.textContent, 'Single player · Change', 'the label shows this tab, not the other one');
  assert.equal(second.button('solo').getAttribute('aria-pressed'), 'true');
  second.button('multiplayer').click();
  assert.deepEqual(second.changes, ['multiplayer'], 'the shared preference must not swallow the switch');
});

test('choosing the running mode stays put and brings the remembered choice back in line', () => {
  const storage = sharedStorage();
  storage.values.set(PLAY_MODE_KEY, 'multiplayer');
  const tab = openTab(storage, 'solo');
  tab.toggle.click();
  assert.equal(tab.options.hidden, false);
  tab.button('solo').click();
  assert.deepEqual(tab.changes, [], 'no reload for the mode already running');
  assert.equal(tab.options.hidden, true);
  assert.equal(storage.values.get(PLAY_MODE_KEY), 'solo');
});

test('a choice the browser did not keep says it lasts for this visit', () => {
  const tab = openTab(sharedStorage(), 'multiplayer', { remembered: false });
  assert.equal(tab.toggle.textContent, 'Multiplayer · Change');
  assert.match(tab.options.children.at(-1).textContent, /did not save your choice, so it lasts for this visit/);
  assert.doesNotMatch(openTab(sharedStorage(), 'solo').options.children.at(-1).textContent, /this visit/);
});
