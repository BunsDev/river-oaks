import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAY_PANES, nextPlayTab, playPaneFor } from '../src/play-rail-tabs.js';

const panel = (...classes) => ({ matches: selector => selector.split(',').some(part => classes.includes(part.trim().slice(1))) });

test('every rail panel finds its own tab, and unknown panels go to More', () => {
  assert.deepEqual(PLAY_PANES.map(pane => pane.id), ['character', 'rides', 'photo', 'cycling', 'birds', 'guide', 'build', 'office', 'more']);
  for (const [classes, id] of [[['player-controls'], 'character'], [['player-settings'], 'rides'], [['photo-tools'], 'photo'], [['cycling-board'], 'cycling'],
    [['bird-cams'], 'birds'], [['salon-guide-entry'], 'guide'], [['shared-build-controls'], 'build'], [['office-panel'], 'office'], [['something-new'], 'more']])
    assert.equal(playPaneFor(panel(...classes)).id, id, classes.join(' '));
  for (const pane of PLAY_PANES) assert.ok(pane.label && pane.icon.startsWith('<svg') && pane.icon.includes('aria-hidden="true"'), pane.id);
});

test('arrow, Home and End keys move through the visible tabs and wrap', () => {
  const visible = ['character', 'rides', 'photo', 'birds'];
  assert.equal(nextPlayTab(visible, 'character', 'ArrowRight'), 'rides');
  assert.equal(nextPlayTab(visible, 'birds', 'ArrowRight'), 'character');
  assert.equal(nextPlayTab(visible, 'character', 'ArrowLeft'), 'birds');
  assert.equal(nextPlayTab(visible, 'photo', 'Home'), 'character');
  assert.equal(nextPlayTab(visible, 'rides', 'End'), 'birds');
  assert.equal(nextPlayTab(visible, 'rides', 'Enter'), null);
  // A tab that disappeared (its panel was hidden) restarts from the first one.
  assert.equal(nextPlayTab(visible, 'cycling', 'ArrowRight'), 'character');
});
