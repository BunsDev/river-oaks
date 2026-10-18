import test from 'node:test';
import assert from 'node:assert/strict';
import {SHARED_APPEARANCES} from '../src/shared-appearances.js';
import {characterWardrobeMatrix} from '../audit/character-wardrobe-matrix.js';

test('wardrobe coverage follows every catalog bundle without giving human forms beast motion', () => {
  const rows = characterWardrobeMatrix();
  assert.equal(new Set(rows.map(row => `${row.appearanceId}/${row.pose}`)).size, rows.length);
  for (const look of SHARED_APPEARANCES) {
    const cases = rows.filter(row => row.appearanceId === look.id);
    assert.equal(cases.length, 5, look.id);
    for (const pose of ['idle', 'sit', 'wave', 'walk', 'run']) assert(cases.some(row => row.pose === pose));
    for (const row of cases) {
      assert.equal(row.rig, look.rig ?? look.id);
      assert.equal(row.costume, look.costume ?? null);
      assert.equal(look.form, 'human');
      assert(row.frames.every((frame, i) => Number.isInteger(frame) && frame >= 144 && (!i || frame > row.frames[i - 1])));
      assert.equal(row.frames.length, row.speed > 0 ? 4 : 1);
    }
  }
});
