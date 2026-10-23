import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTACK_KEY, describeHit, nearestRival, rivalFigures, starsLabel, starsOf, starsText } from '../src/crime-ui.js';
import { createResidentGestures } from '../src/resident-gestures.js';
import { poseFor } from '../src/crime-poses.js';

const rival = (change = {}) => ({ id: 'rival:westcreek', name: 'Westcreek rival', appearance: 'sable-human', position: [-2908, -1320, 17.8], yaw: 1, health: 75, maxHealth: 100, incapacitated: false, staggered: false, ...change });

test('wanted stars read the same to the eye and to a screen reader', () => {
  assert.deepEqual([0, 2, 5].map(starsText), ['☆☆☆☆☆', '★★☆☆☆', '★★★★★']);
  assert.equal(starsLabel(2), 'Wanted level: 2 of 5 stars');
  assert.equal(starsOf({ wanted: [['alice', 3]] }, 'alice'), 3);
  assert.equal(starsOf({ wanted: [['alice', 3]] }, 'bob'), 0);
  assert.equal(starsOf(undefined, 'bob'), 0);
});

test('the HUD offers the nearest rival from the town\'s position and says when it is in reach', () => {
  const crime = { targets: [rival(), rival({ id: 'rival:far', position: [-2800, -1440, 18] })] };
  assert.equal(nearestRival({ position: [-2906.6, -1320, 17.8] }, crime).inReach, true);
  assert.equal(nearestRival({ position: [-2905, -1320, 17.8] }, crime).inReach, false);
  assert.equal(nearestRival({ position: [-2765, -1295, 18] }, crime), null, 'far from every rival');
  assert.equal(nearestRival(null, crime), null);
  assert.equal(ATTACK_KEY, 'KeyT');
});

test('hits are described only from the town\'s reply', () => {
  assert.equal(describeHit({ health: 75, incapacitated: false, stars: 1 }, 'Westcreek rival'), 'Hit landed. Westcreek rival has 75 health left. Wanted level 1 of 5.');
  assert.equal(describeHit({ health: 0, incapacitated: true, stars: 4 }, 'Westcreek rival'), 'Hit landed. Westcreek rival is down. Wanted level 4 of 5.');
});

test('rivals render as figures that stagger when hit and double over while down', () => {
  const [standing, hit, down] = rivalFigures({ targets: [rival(), rival({ staggered: true }), rival({ health: 0, incapacitated: true })] });
  assert.deepEqual([standing.gesture, hit.gesture, down.gesture], [null, 'stagger', 'down']);
  assert.equal(down.name, 'Westcreek rival · down');
  assert.deepEqual([standing.altitude, standing.vehicle, standing.sitting], [0, null, null]);
  assert.deepEqual(rivalFigures(undefined), []);
  // Existing poses, not new ones: garment bakes stay valid. Each reads differently from rest.
  assert.deepEqual(['shove', 'stagger', 'down', 'wave', null].map(poseFor), ['throw-release', 'startled', 'bow', 'wave', null]);
  const settle = action => { const gestures = createResidentGestures();let pose;for (let i = 0; i < 90; i++)pose = gestures.update(action, 0.016);return JSON.stringify(pose); };
  const poses = ['shove', 'stagger', 'down', 'continue'].map(gesture => settle(poseFor(gesture)));
  assert.equal(new Set(poses).size, 4);
  const still = createResidentGestures({ reducedMotion: true });
  assert.equal(JSON.stringify(still.update(poseFor('shove'), 0.016)), settle('continue'));
});
