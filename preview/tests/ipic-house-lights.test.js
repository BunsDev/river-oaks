import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { storeRoomsFor } from '../src/store-rooms.js';
import { buildIpicInterior } from '../src/ipic-interior.js';
import { HOUSE_LIGHTS_DIMMED, houseLightTarget, nextHouseLight } from '../src/ipic-screening-ui.js';

const room = storeRoomsFor(JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)))).find(item => item.interior === 'ipic-photo-v1');

test('the auditorium\'s own lights are the house lights; reception and the lounge keep theirs', () => {
  const built = buildIpicInterior(room, { textures: false }), lights = built.userData.lightPositions;
  const local = light => room.toLocal(light.position.x, -light.position.z);
  const house = lights.filter(light => light.house), other = lights.filter(light => !light.house);
  assert.equal(house.length, 16, 'two rows of downlights along the auditorium wing, over the house and the foyer behind it');
  assert.ok(house.every(light => local(light)[1] > 27), 'all over the auditorium');
  assert.ok(other.every(light => local(light)[1] < 27), 'reception, escalators and lounge stay lit');
});

test('house lights dim while a film plays in IPIC, and come back up when it stops or the visitor leaves', () => {
  assert.equal(HOUSE_LIGHTS_DIMMED, 0.25);
  assert.equal(houseLightTarget({ status: 'playing', inside: true }), HOUSE_LIGHTS_DIMMED);
  for (const view of [{ status: 'paused', inside: true }, { status: 'ended', inside: true }, { status: 'stopped', inside: true }, { status: 'playing', inside: false }, {}])
    assert.equal(houseLightTarget(view), 1, JSON.stringify(view));
  // Eased, not snapped: about a second to settle, and never past the target.
  let level = 1;
  for (let i = 0; i < 6; i++) level = nextHouseLight(level, HOUSE_LIGHTS_DIMMED, 1 / 6);
  assert.ok(level > HOUSE_LIGHTS_DIMMED && level < 0.45, `after 1 s: ${level}`);
  for (let i = 0; i < 60; i++) level = nextHouseLight(level, HOUSE_LIGHTS_DIMMED, 1 / 6);
  assert.ok(Math.abs(level - HOUSE_LIGHTS_DIMMED) < 1e-3);
  assert.equal(nextHouseLight(0.5, 1, 0), 0.5);
});
