import test from 'node:test';
import assert from 'node:assert/strict';
import { contextualAction } from '../src/contextual-action.js';

test('standing up takes priority while seated even with someone in talking reach', () => {
  assert.equal(contextualAction({ seated: true, interact: true, talk: true }), 'interact');
});
test('a nearby conversation precedes the doorway, with other actions still selectable', () => {
  assert.equal(contextualAction({ talk: true, enter: true, interact: true, meet: true }), 'talk');
  assert.equal(contextualAction({ enter: true, interact: true, meet: true }), 'enter');
  assert.equal(contextualAction({ interact: true, meet: true }), 'interact');
  assert.equal(contextualAction({ meet: true }), 'meet');
});
test('unavailable actions never become a primary prompt', () => {
  assert.equal(contextualAction({}), null);
  assert.equal(contextualAction({ seated: true, interact: false, talk: true }), 'talk');
  assert.equal(contextualAction({ enter: false, meet: true }), 'meet');
});
