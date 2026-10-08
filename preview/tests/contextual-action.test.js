import test from 'node:test';
import assert from 'node:assert/strict';
import { contextualAction, primaryAction } from '../src/contextual-action.js';

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

const shown = (extra = {}) => ({ shown: true, disabled: false, busy: false, ...extra });
test('an action whose request is still running keeps the primary slot', () => {
  // Watering beside a lane planter with someone nearby: the busy water action
  // must not hand its slot (and a repeat tap) to Meet someone nearby.
  assert.equal(primaryAction({ interact: shown({ busy: true }), meet: shown() }), 'interact');
  assert.equal(primaryAction({ interact: shown({ busy: true }), meet: shown() }, { seated: true }), 'interact');
});
test('a disabled action that is not busy is unavailable', () => {
  // A doorway that needs an invitation is shown but cannot be used.
  assert.equal(primaryAction({ enter: shown({ disabled: true }), meet: shown() }), 'meet');
  assert.equal(primaryAction({ enter: { shown: false, disabled: false, busy: false }, meet: shown() }), 'meet');
});
test('only keyboard focus pins an action in place', () => {
  const inside = { enter: shown(), talk: shown() };
  // After clicking Step inside, the button keeps focus; the conversation still takes over.
  assert.equal(primaryAction(inside, { focused: 'enter', inPrimary: true, keyboard: false }), 'talk');
  assert.equal(primaryAction(inside, { focused: 'enter', inPrimary: true, keyboard: true }), 'enter');
  // A keyboard-focused busy action stays where it is too.
  assert.equal(primaryAction({ interact: shown({ busy: true }), enter: shown() }, { focused: 'interact', inPrimary: true, keyboard: true }), 'interact');
  // Focus on a secondary action never promotes it.
  assert.equal(primaryAction(inside, { focused: 'enter', inPrimary: false, keyboard: true }), 'talk');
});
