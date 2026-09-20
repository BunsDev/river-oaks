import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunity, interactWithLocal } from '../src/community.js';
import { supportAvailability } from '../src/community-presentation.js';

const world = { buildings: Array.from({ length: 24 }, (_, i) => ({ id: `house-${i}`, center: [i * 25, 0, 0], size: [12, 14, 9] })) };

test('visible support availability agrees with the simulation across prerequisites and resource limits', () => {
  const cases = [
    () => {},
    state => { state.running = true; },
    (state, local) => { local.needKnown = true; },
    (state, local) => { state.running = true; local.needKnown = true; },
    (state, local) => { state.running = true; local.needKnown = true; state.supplies = 0; },
    (state, local) => { state.running = true; local.needKnown = true; state.helpBudget = 0; },
    (state, local) => { state.running = true; local.needKnown = true; local.cooldownUntil = 120; },
    (state, local) => { state.running = true; local.needKnown = true; local.status = 'aid_en_route'; },
    (state, local) => { state.running = true; local.needKnown = true; local.status = 'supported'; },
    (state, local) => { state.running = true; local.needKnown = true; local.status = 'unmet'; },
    (state, local) => { state.running = true; local.needKnown = true; local.priority = false; },
    (state, local) => { state.running = true; local.needKnown = true; state.status = 'success'; },
    (state, local) => { state.running = true; local.needKnown = true; state.status = 'failed'; },
  ];
  for (const setup of cases) {
    const state = createCommunity(world), local = state.locals[0];
    setup(state, local);
    const before = structuredClone(state);
    const availability = supportAvailability(state, local);
    assert.deepEqual(state, before, 'presentation must not spend resources or alter the simulation');
    for (const action of ['supply', 'dispatch']) {
      const result = interactWithLocal(structuredClone(state), local.id, action);
      assert.equal(availability[action] === null, result.ok, `${action}: ${result.reason}`);
      if (!result.ok) assert.ok(availability[action].length > 0, 'disabled actions explain why');
    }
  }
});

test('cooldown and exhausted resources explain each action independently', () => {
  const state = createCommunity(world), local = state.locals[0];
  state.running = true; local.needKnown = true; local.cooldownUntil = 120;
  assert.match(supportAvailability(state, local).supply, /2:00/);
  assert.equal(supportAvailability(state, local).dispatch, null);
  state.elapsed = 120; state.helpBudget = 0;
  assert.equal(supportAvailability(state, local).supply, null);
  assert.match(supportAvailability(state, local).dispatch, /visits/);
  state.supplies = 1;
  assert.match(supportAvailability(state, local).supply, /2 kits.*1 available/);
});

test('known resolved requests do not suggest starting the clock would enable support', () => {
  const state = createCommunity(world), local = state.locals[0];
  local.needKnown = true; local.status = 'supported';
  assert.deepEqual(supportAvailability(state, local), { supply: 'No further support needed.', dispatch: 'No further support needed.' });
});
