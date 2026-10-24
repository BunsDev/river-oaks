import test from 'node:test';
import assert from 'node:assert/strict';
import { createTownChatDock } from '../src/town-chat.js';

// Just enough of a phone page for the dock: a narrow viewport, a conversation that closes
// the way community-ui.js does (focus returns to the scene while walking), and focus.
function phone({ conversationOpen }) {
  const page = { dock: null, focused: null, closes: 0 };
  class Element {
    constructor(id = '') { this.id = id; this.hidden = false; this.listeners = {}; this.parts = {}; }
    append() {} before() {} after() {} remove() {}
    querySelector(selector) { return this.parts[selector] ??= new Element(selector); }
    addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
    dispatch(type) { for (const listener of this.listeners[type] ?? []) listener({}); }
    focus() { page.focused = this; }
    checkVisibility() { return true; }
  }
  const dialogue = new Element('community-dialogue'); dialogue.hidden = !conversationOpen;
  const close = new Element('community-close'), canvas = new Element('canvas-host');
  close.click = () => { page.closes++; dialogue.hidden = true; canvas.focus(); };
  const elements = { '#viewport': new Element('viewport'), '#community-dialogue': dialogue, '#community-close': close, '#canvas-host': canvas };
  globalThis.document = {
    createElement: tag => { const element = new Element(); if (tag === 'details') page.dock = element; return element; },
    querySelector: selector => elements[selector] ?? null,
    querySelectorAll: () => [],
  };
  globalThis.matchMedia = query => ({ matches: query === '(max-width:900px)' });
  createTownChatDock(new Element('chat'));
  return { page, dialogue };
}

test('opening town chat on a phone leaves focus in the chat field unless it closes a conversation (#288)', () => {
  // The Town chat command focuses the field and opens the dock, and the dock's toggle
  // event follows. Closing a conversation that is not open must not send focus to the
  // scene, where the text typed next would walk the player.
  for (const conversationOpen of [false, true]) {
    const { page, dialogue } = phone({ conversationOpen });
    const field = { focus() {} }; page.focused = field;
    page.dock.open = true; page.dock.dispatch('toggle');
    assert.equal(page.closes, conversationOpen ? 1 : 0, conversationOpen ? 'an open conversation closes' : 'nothing is closed');
    assert.equal(dialogue.hidden, true);
    if (!conversationOpen) assert.equal(page.focused, field, 'the chat field keeps focus');
  }
});
