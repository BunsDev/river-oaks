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
