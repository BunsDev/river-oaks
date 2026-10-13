import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlazaStage, STAGE_REACH } from '../src/plaza-stage.js';
import { plazaSalonPlan } from '../src/plaza-salon-plan.js';
import { createResidentGestures } from '../src/resident-gestures.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url), 'utf8'));
const { stage } = plazaSalonPlan(world);
// Walking poses are in scene coordinates: east, eye height, south (-north).
const poseAt = (distance, extra = {}) => ({ position: [stage.x + Math.sin(stage.heading) * distance, 20, -(stage.north - Math.cos(stage.heading) * distance)], altitude: 0, ...extra });

function setup({ players = [], pose = poseAt(stage.radius + 0.5), connected = true } = {}) {
  const sent = [], applied = [], notices = [], views = [];
  const multiplayer = {
    connected, identity: { id: 'me' }, snapshot: { players },
    async command(message) { sent.push(message); return { ok: true, player: { id: 'me', performing: message.action === 'take' } }; },
  };
  const walking = { getPose: () => pose, applyServerPose: player => applied.push(player), notify: text => notices.push(text) };
  const view = { setLive: on => views.push(on) };
  const plaza = createPlazaStage({ walking, getMultiplayer: () => multiplayer, getStageView: () => view });
  plaza.setWorld(world);
  return { plaza, sent, applied, notices, views, multiplayer, setPose: next => { pose = next; } };
}

test('beside a free stage, X offers to take it and applies the town\'s answer', async () => {
  const { plaza, sent, applied } = setup();
  const action = plaza.interaction();
  assert.equal(action.label, 'Take the stage');
  assert.equal(action.disabled, false);
  action.run(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent, [{ type: 'stage', action: 'take' }]);
  assert.equal(applied[0].performing, true);
});

test('the stage is offered only within reach, on foot and connected', () => {
  assert.equal(setup({ pose: poseAt(stage.radius + STAGE_REACH + 0.5) }).plaza.interaction(), null);
  assert.equal(setup({ pose: poseAt(stage.radius + 0.5, { sitting: { buildId: 'b', slot: 0 } }) }).plaza.interaction(), null);
  assert.equal(setup({ pose: poseAt(stage.radius + 0.5, { altitude: 2 }) }).plaza.interaction(), null);
  assert.equal(setup({ connected: false }).plaza.interaction(), null);
});

test('another performer holds the stage; the performer is offered the way down', async () => {
  const busy = setup({ players: [{ id: 'other', name: 'Alice', performing: true }] }).plaza.interaction();
  assert.equal(busy.label, 'Alice is performing');
  assert.equal(busy.disabled, true);
  const onStage = setup({ players: [{ id: 'me', name: 'Me', performing: true }], pose: poseAt(0) });
  const action = onStage.plaza.interaction();
  assert.equal(action.label, 'Step down from the stage');
  action.run(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(onStage.sent, [{ type: 'stage', action: 'leave' }]);
});

test('stage lights follow whether anyone in town is performing, without repeating', () => {
  const { plaza, views, multiplayer } = setup();
  plaza.update(); plaza.update();
  multiplayer.snapshot = { players: [{ id: 'other', performing: true }] };
  plaza.update(); plaza.update();
  multiplayer.snapshot = { players: [] };
  plaza.update();
  assert.deepEqual(views, [false, true, false]);
  plaza.setWorld(world); plaza.update();
  assert.deepEqual(views, [false, true, false, false], 'a rebuilt stage is told its state again');
});

test('the perform pose holds the microphone and sways, and reduced motion keeps still', () => {
  const gestures = createResidentGestures();
  let pose;
  for (let i = 0; i < 120; i++) pose = gestures.update('perform', 1 / 60, i / 60);
  assert.ok(pose.upperarm_l[0] < -0.6, 'the left arm is raised to the microphone');
  const sway = pose.spine_03[2];
  for (let i = 120; i < 160; i++) pose = gestures.update('perform', 1 / 60, i / 60);
  assert.notEqual(pose.spine_03[2], sway, 'the body sways to the beat');
  const still = createResidentGestures({ reducedMotion: true }).update('perform', 1 / 60, 1);
  assert.ok(Object.values(still).every(axes => axes.every(value => value === 0)));
});
