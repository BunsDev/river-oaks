import test from 'node:test';
import assert from 'node:assert/strict';
import { createTownChatDock } from '../src/town-chat.js';

// Just enough of a phone page for the dock: a narrow viewport, focus, and a conversation
// close that behaves like community-ui.js: it cancels a selection still in flight and,
// while walking, returns focus to the scene.
function phone({ conversationOpen }) {
  const page = { dock: null, focused: null, cancelledSelections: 0 };
  class Element {
    constructor(id = '') { this.id = id; this.hidden = false; this.isConnected = true; this.listeners = {}; this.parts = {}; }
    append() {} before() {} after() {} remove() {}
    querySelector(selector) { return this.parts[selector] ??= new Element(selector); }
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
    dispatch(type) { for (const listener of this.listeners[type] ?? []) listener({}); }
    focus() { page.focused = this; }
    checkVisibility() { return true; }
  }
  const dialogue = new Element('community-dialogue'); dialogue.hidden = !conversationOpen;
  const close = new Element('community-close'), canvas = new Element('canvas-host');
  close.click = () => { page.cancelledSelections++; dialogue.hidden = true; canvas.focus(); };
  const elements = { '#viewport': new Element('viewport'), '#community-dialogue': dialogue, '#community-close': close, '#canvas-host': canvas };
  globalThis.document = {
    createElement: tag => { const element = new Element(); if (tag === 'details') page.dock = element; return element; },
    querySelector: selector => elements[selector] ?? null,
    querySelectorAll: () => [],
    get activeElement() { return page.focused; },
  };
  globalThis.matchMedia = query => ({ matches: query === '(max-width:900px)' });
  createTownChatDock(new Element('chat'));
  return { page, dialogue, canvas, field: new Element('chat-field') };
}

test('opening town chat on a phone cancels a pending selection and keeps focus in the chat field (#288)', () => {
  // The Town chat command focuses the field and opens the dock; the dock's toggle event
  // follows. The close it runs must still cancel a selection in flight (a late-response
  // fence), but with no conversation open it must not leave focus on the scene, where the
  // next text typed would walk the player.
  for (const conversationOpen of [false, true]) {
    const { page, dialogue, canvas, field } = phone({ conversationOpen });
    field.focus();
    page.dock.open = true; page.dock.dispatch('toggle');
    assert.equal(page.cancelledSelections, 1, 'a selection still in flight is cancelled');
    assert.equal(dialogue.hidden, true);
    assert.equal(page.focused, conversationOpen ? canvas : field, conversationOpen ? 'closing a conversation returns focus to the scene' : 'the chat field keeps focus');
  }
});
