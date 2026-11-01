import test from 'node:test';
import assert from 'node:assert/strict';
import { boardView, formatMiles } from '../src/cycling-leaderboard.js';
import { BOARDS, boardValue, formatBoardValue } from '../src/leaderboard-boards.js';

test('miles on the board read to one decimal', () => {
  assert.equal(formatMiles(0), '0.0 mi');
  assert.equal(formatMiles(3.14159), '3.1 mi');
  assert.equal(formatMiles(12.96), '13.0 mi');
});

test('distances show in miles and hours played in hours', () => {
  assert.equal(boardValue('walking', 1609.344 * 2.25), 2.3);
  assert.equal(boardValue('played', 5400), 1.5);
  assert.equal(formatBoardValue('played', 1.5), '1.5 h');
  assert.equal(formatBoardValue('motorcycle', 4), '4.0 mi');
  assert.equal(BOARDS[0].id, 'cycling', 'the sheet opens on cycling');
});

// The viewer's row is the one the server marks `you`. It once came from matching the roster
// name, which a refresh dropped until the next snapshot re-sent it.
test('the sheet highlights the row the server marks as yours, and footers you only below the list', () => {
  const cycling = BOARDS.find(board => board.id === 'cycling'), played = BOARDS.find(board => board.id === 'played');
  const page = { top: [{ rank: 1, name: 'Alice', value: 4 }, { rank: 2, name: 'Alice', value: 1.2, you: true }], me: { rank: 2, value: 1.2 } };
  const view = boardView(cycling, page);
  assert.deepEqual(view.rows.map(row => row.mine), [false, true], 'a namesake above you is not you');
  assert.equal(view.footer, null);
  assert.equal(view.badge, '1.2 mi');
  assert.deepEqual(boardView(played, { top: [{ rank: 1, name: 'Bob', value: 9 }], me: { rank: 40, value: 0.5 } }).footer, 'You: #40 · 0.5 h');
  assert.deepEqual(boardView(cycling, { top: [], me: null }), { rows: [], empty: true, footer: null, badge: null });
  assert.equal(boardView(cycling, null).empty, false, 'nothing read yet is not an empty board');
});
