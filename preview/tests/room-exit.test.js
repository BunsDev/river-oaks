import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { storeRoomsFor } from '../src/store-rooms.js';
import { ROOM_EXIT_REACH, nearRoomExit } from '../src/room-exit.js';

const rooms = storeRoomsFor(JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url))));
const at = (room, a, d) => room.toWorld(a, d);

test('Step outside is offered near the street door, never from deep inside a venue like the IPIC auditorium', () => {
  const ipic = rooms.find(room => room.interior === 'ipic-photo-v1');
  assert.equal(ROOM_EXIT_REACH, 12);
  assert.equal(nearRoomExit(ipic, at(ipic, 0, 1)), true, 'reception, by the doors');
  assert.equal(nearRoomExit(ipic, at(ipic, 0, 5.5)), true, 'the back of reception');
  assert.equal(nearRoomExit(ipic, at(ipic, -4.525, 20.6)), false, 'the lounge sofa');
  assert.equal(nearRoomExit(ipic, at(ipic, -0.6, 31)), false, 'a front-row recliner');
});

test('every ordinary shop keeps Step outside everywhere inside it', () => {
  const shops = rooms.filter(room => room.depth <= ROOM_EXIT_REACH);
  assert.ok(shops.length >= 25, `${shops.length} shops`);
  for (const room of shops) assert.equal(nearRoomExit(room, at(room, 0, room.depth - 0.5)), true, `${room.name}: back wall`);
});
