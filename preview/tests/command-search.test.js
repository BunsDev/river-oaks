import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCommands } from '../src/command-search.js';

const actions = [
  { label: 'Explore · show or hide places and people', keys: '⌘B', terms: 'sidebar left rail', toggle: true },
  { label: 'Activities · show or hide controls', keys: '⌘Shift+B', terms: 'play right rail dock', toggle: true },
  { label: 'People · nearby and chat', keys: 'Alt+1' },
  { label: 'Explore · places and landmarks', keys: 'Alt+2' },
  { label: 'Settings', keys: 'Alt+3' },
];
const labels = query => matchCommands(actions, query).map(action => action.label);

test('typing a tab name puts the command that opens it first, ahead of rail toggles', () => {
  assert.equal(labels('places')[0], 'Explore · places and landmarks');
  assert.equal(labels('people')[0], 'People · nearby and chat');
  assert.equal(labels('explore')[0], 'Explore · places and landmarks');
  assert.ok(labels('places').includes('Explore · show or hide places and people'), 'the toggle remains selectable');
});
test('rail toggles are found by their documented names', () => {
  assert.deepEqual(labels('play'), ['Activities · show or hide controls']);
  assert.deepEqual(labels('rail'), ['Explore · show or hide places and people', 'Activities · show or hide controls']);
  assert.deepEqual(labels('sidebar'), ['Explore · show or hide places and people']);
});
test('an empty query keeps the authored order, and nothing matches nonsense', () => {
  assert.deepEqual(labels(''), actions.map(action => action.label));
  assert.deepEqual(labels('no such activity'), []);
});
