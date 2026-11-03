import test from 'node:test';
import assert from 'node:assert/strict';
import { devTownEnv } from '../vite-town.js';

test('the development town takes Studio saves unless the release control is set', () => {
  assert.equal(devTownEnv({}).RIVER_OAKS_CHARACTER_STUDIO, '1');
  assert.equal(devTownEnv({ RIVER_OAKS_CHARACTER_STUDIO: '' }).RIVER_OAKS_CHARACTER_STUDIO, '1');
  assert.equal(devTownEnv({ RIVER_OAKS_CHARACTER_STUDIO: '0' }).RIVER_OAKS_CHARACTER_STUDIO, '0', 'pausing still works in development');
  const env = { RIVER_OAKS_DEV_TOWN_PORT: '8788' };
  assert.equal(devTownEnv(env).RIVER_OAKS_DEV_TOWN_PORT, '8788');
  assert.equal(env.RIVER_OAKS_CHARACTER_STUDIO, undefined, 'the loaded environment is not mutated');
});

test('the development town serves the experimental land expansion unless a revision is set', () => {
  assert.equal(devTownEnv({}).RIVER_OAKS_DISTRICT_REVISION, 'woodland-heights-1');
  assert.equal(devTownEnv({ RIVER_OAKS_DISTRICT_REVISION: '' }).RIVER_OAKS_DISTRICT_REVISION, 'woodland-heights-1');
  assert.equal(devTownEnv({ RIVER_OAKS_DISTRICT_REVISION: 'river-oaks-garage-1' }).RIVER_OAKS_DISTRICT_REVISION, 'river-oaks-garage-1', 'an explicit revision still wins');
  assert.equal(devTownEnv({ RIVER_OAKS_ACCEPTANCE_FIXTURE: '1' }).RIVER_OAKS_DISTRICT_REVISION, undefined, 'acceptance fixtures keep the garage default');
  assert.equal(devTownEnv({ RIVER_OAKS_ACCEPTANCE_FIXTURE: '1', RIVER_OAKS_DISTRICT_REVISION: 'bayou-heights-1' }).RIVER_OAKS_DISTRICT_REVISION, 'bayou-heights-1');
  const env = {};
  devTownEnv(env);
  assert.equal(env.RIVER_OAKS_DISTRICT_REVISION, undefined, 'the loaded environment is not mutated');
});
