import test from 'node:test';
import assert from 'node:assert/strict';
import { GREETING_FACING_ANGLE, facedPeer } from '../src/greetings-ui.js';

// The walking pose: position [east, up, -north] and the camera's yaw. Yaw 0 looks north and a
// positive yaw turns toward the west, as walking-ui's lookAt sets it.
const pose = (yaw, east = 0, north = 0) => ({ position: [east, 1.68, -north], yaw });
const peer = (id, east, north) => ({ id, position: [east, north, 0] });

test('the person you face is the one within the cone, nearest to straight ahead', () => {
  assert.equal(GREETING_FACING_ANGLE, 40 * Math.PI / 180);
  const ahead = peer('ahead', 0, 2), aside = peer('aside', 2, 0), slight = peer('slight', 0.8, 2);
  assert.equal(facedPeer(pose(0), [ahead])?.id, 'ahead');
  assert.equal(facedPeer(pose(0), [aside]), null, 'beside you is not faced');
  assert.equal(facedPeer(pose(0), [slight, ahead])?.id, 'ahead', 'straight ahead wins over slightly aside');
  assert.equal(facedPeer(pose(0), [slight])?.id, 'slight', 'about 22 degrees off is still faced');
  assert.equal(facedPeer(pose(Math.PI / 2), [aside, peer('west', -2, 0)])?.id, 'west', 'turned a quarter left, you face the west');
  assert.equal(facedPeer(pose(Math.PI), [ahead]), null, 'behind you is not faced');
  assert.equal(facedPeer(null, [ahead]), null);
  assert.equal(facedPeer(pose(0, 5, 5), [peer('same', 5, 5)]), null, 'no direction to a body at your own spot');
});
