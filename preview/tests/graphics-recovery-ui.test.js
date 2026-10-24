import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphicsRecoveryUI } from '../src/graphics-recovery-ui.js';

function fixture(t) {
  const previous = { document: globalThis.document, MutationObserver: globalThis.MutationObserver };
  t.after(() => Object.assign(globalThis, previous));
  const observers = new Set(), dialogs = [];
  class Element extends EventTarget {
    children = []; attributes = {}; dataset = {}; hidden = false; isConnected = true;
    append(...items) { for (const item of items) { if (item.parentNode) item.parentNode.children = item.parentNode.children.filter(child => child !== item); item.parentNode = this; this.children.push(item); } }
    contains(item) { return this === item || this.children.some(child => child.contains(item)); }
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() { document.activeElement = this; }
    getClientRects() { return [{}]; }
  }
  globalThis.document = { createElement: () => new Element(), querySelectorAll: () => dialogs.filter(dialog => dialog.open), documentElement: new Element() };
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() { observers.add(this); }
    disconnect() { observers.delete(this); }
  };
  const viewport = new Element(), host = new Element(), dialog = new Element(); dialogs.push(dialog); host.focus();
  let retries = 0;
  const ui = createGraphicsRecoveryUI({ viewport, focusTarget: host, retry: () => retries++ });
  const panel = viewport.children[0], button = panel.children[1];
  return { ui, viewport, host, dialog, panel, button, observers, get retries() { return retries; }, mutate() { for (const observer of observers) observer.callback(); } };
}

test('the restoration status follows opening and closing dialogs without stealing focus', t => {
  const f = fixture(t); f.dialog.open = true; f.ui.update('lost');
  assert.equal(f.panel.parentNode, f.dialog); assert.equal(document.activeElement, f.host);
  f.dialog.open = false; f.mutate(); assert.equal(f.panel.parentNode, f.viewport);
  f.dialog.open = true; f.mutate(); assert.equal(f.panel.parentNode, f.dialog);
  f.ui.update('ok'); assert.equal(f.observers.size, 0); assert.equal(f.panel.hidden, true);
});

test('retry retains focus and cannot run twice while restoring', t => {
  const f = fixture(t); f.ui.update('failed'); f.button.focus();
  f.button.dispatchEvent(new Event('click')); assert.equal(f.retries, 1);
  f.ui.update('restoring'); f.button.dispatchEvent(new Event('click')); assert.equal(f.retries, 1);
  assert.equal(document.activeElement, f.button); assert.equal(f.button.hidden, false);
  f.dialog.open = true; f.mutate(); assert.equal(document.activeElement, f.button);
  f.ui.update('ok'); assert.equal(document.activeElement, f.host);
});
