import test from 'node:test';
import assert from 'node:assert/strict';

// Just enough DOM for the play rail. Like browsers, changing a <details> element's
// `open` queues its toggle event instead of dispatching it synchronously.
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.queued = [];
    this.hidden = false; this.style = {}; this.isOpen = false;
    const classes = new Set();
    this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name), toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); } };
  }
  set innerHTML(_) { this.kbd = new Element('kbd'); }
  querySelector(selector) { return selector === 'kbd' ? this.kbd : null; }
  querySelectorAll() { return []; }
  setAttribute() {}
  append(...nodes) { this.children.push(...nodes); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  contains(node) { return node === this || this.children.some(child => child.contains?.(node)); }
  focus() { globalThis.document.activeElement = this; }
  get open() { return this.isOpen; }
  set open(value) { if (value !== this.isOpen) { this.isOpen = value; this.queued.push('toggle'); } }
  runQueuedEvents() { for (const type of this.queued.splice(0)) for (const listener of this.listeners[type] ?? []) listener(); }
}
function installDom(saved = {}) {
  const store = new Map(Object.entries(saved));
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define('document', { createElement: tag => new Element(tag), body: new Element('body'), activeElement: null });
  define('window', { matchMedia: () => ({ matches: false }) });
  define('navigator', { platform: 'MacIntel' });
  define('localStorage', { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) });
  define('MutationObserver', class { observe() {} });
  return store;
}
const key = 'river-oaks-play-rail-open';
const { createPlayDock } = await import('../src/play-dock.js');

test('closing the play rail from code saves the choice before its queued toggle event', () => {
  const store = installDom({ [key]: 'true' });
  const dock = createPlayDock();
  assert.equal(dock.element.open, true);
  dock.setOpen(false);
  // A reload before the toggle event runs must still find the rail closed.
  assert.equal(store.get(key), 'false');
  dock.element.runQueuedEvents();
  assert.equal(store.get(key), 'false');
});
test('opening from code and toggling the summary are both remembered', () => {
  const store = installDom({ [key]: 'false' });
  const dock = createPlayDock();
  assert.equal(dock.element.open, false);
  dock.setOpen(true);
  assert.equal(store.get(key), 'true');
  dock.element.runQueuedEvents();
  // A summary click changes `open` natively; the toggle event records it.
  dock.element.open = false; dock.element.runQueuedEvents();
  assert.equal(store.get(key), 'false');
});
