import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphicsReloadState, graphicsReloadBlocker } from '../src/graphics-reload-state.js';

test('explicit reload preserves permitted UI/drafts once in the same world, without saving authority', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const state = createGraphicsReloadState({ storage, scope: '/|town', now: () => 100 });
  assert.equal(state.save({ settings: true, settingsTab: 'settings-tab-2', chatDraft: 'Unsent hello', position: [1, 2], identity: 'private' }), true);
  assert.deepEqual(state.take(), { settings: true, settingsTab: 'settings-tab-2', chatDraft: 'Unsent hello' });
  assert.equal(state.take(), null);
  state.save({ settings: true });
  assert.equal(createGraphicsReloadState({ storage, scope: '/|another', now: () => 100 }).take(), null);
});

test('blocked storage refuses reload preservation and expired state is discarded', () => {
  const unavailable = createGraphicsReloadState({ storage: { setItem() { throw new Error('quota'); } }, scope: '/' });
  assert.equal(unavailable.save({ chatDraft: 'Do not lose this' }), false);
  let value;
  const storage = { getItem: () => value, setItem: (key, next) => { value = next; }, removeItem: () => { value = null; } };
  createGraphicsReloadState({ storage, scope: '/', now: () => 0 }).save({ settings: true });
  assert.equal(createGraphicsReloadState({ storage, scope: '/', now: () => 600001 }).take(), null);
});

test('fallback refuses to discard photos, framing or another open sheet', () => {
  assert.equal(graphicsReloadBlocker({ photoActive: true }), 'photo');
  assert.equal(graphicsReloadBlocker({ photoRetained: true }), 'photo');
  assert.equal(graphicsReloadBlocker({ dialogs: ['profile-dialog'] }), 'dialog');
  assert.equal(graphicsReloadBlocker({ dialogs: ['settings-dialog'] }), null);
});
