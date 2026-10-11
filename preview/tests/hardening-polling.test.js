// Hardening (billing): clients back off when the server keeps refusing them.
// In production /v1/companion does not exist (404) and a capped or unconfigured
// chauffeur answers without a decision; polling those every 1.5-2.5 s forever
// costs a billed function call each time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionBrain } from '../src/prince-companion.js';
import { createChauffeur } from '../src/chauffeur.js';

const flush = () => new Promise(resolve => setImmediate(resolve));

test('the companion backs off to at most one try a minute while its bridge is missing, and recovers', async () => {
  let clock = 0, calls = 0, failing = true;
  const brain = createCompanionBrain({now: () => clock, decide: async packet => {
    calls++;
    if (failing) throw new Error('Companion bridge unavailable');
    return {schema_version: 1, tick: packet.tick, generation: packet.generation, candidate_id: 'beside', source: 'jev', confidence: 1};
  }});
  const context = {player_speed: 0, gap_m: 1};
  for (clock = 0; clock <= 300_000; clock += 100) { brain.update(context);await flush(); }
  assert.ok(calls <= 12, `five minutes without a bridge made ${calls} calls (was 120)`);
  failing = false;const before = calls;
  for (; clock <= 360_000; clock += 100) { brain.update(context);await flush(); }
  assert.ok(calls - before >= 10, `after one success the normal cadence returns (${calls - before} calls in a minute)`);
  brain.dispose();
});

test('the chauffeur backs off while the server refuses or has no decision, and recovers', async () => {
  let now = 0, calls = 0, mode = 'refused';
  const brain = createChauffeur({clock: () => now, fetcher: async (_url, options) => {
    calls++;
    const request = JSON.parse(options.body);
    if (mode === 'refused') return {ok: false, json: async () => ({})};
    if (mode === 'capped') return {ok: true, json: async () => ({schema_version: 1, tick: request.tick, generation: request.generation, source: 'unavailable', reason: 'budget_exhausted', candidate_id: null, confidence: null})};
    return {ok: true, json: async () => ({schema_version: 1, tick: request.tick, generation: request.generation, source: 'jev', candidate_id: 'cruise', confidence: .9})};
  }});
  const pose = {position: [0, 0, 0], yaw: 0, speed: 1, vehicle: 'rolls'}, route = [[-4, 0], [-10, 0], [-200, 0]];
  brain.request({mode: 'tour'}, route);
  const drive = async until => { for (; now <= until; now += 100) { brain.input(pose, {}, .1);await flush(); } };
  await drive(120_000);
  assert.ok(calls <= 10, `two minutes of refusals made ${calls} calls (was 80)`);
  mode = 'capped';calls = 0;
  await drive(240_000);
  assert.ok(calls <= 5, `a capped budget is not polled every 1.5 s (${calls} calls)`);
  mode = 'ok';calls = 0;
  await drive(310_000);
  assert.ok(calls >= 15, `a good decision restores the normal cadence (${calls} calls)`);
  brain.dispose();
});
