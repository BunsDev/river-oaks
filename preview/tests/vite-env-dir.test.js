import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const resolve = () => resolveConfig({ configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)), logLevel: 'silent' }, 'serve');

test('the dev client reads VITE_* flags from the repo-root env files the shared town reads', async () => {
  const previous = process.env.RIVER_OAKS_ACCEPTANCE_FIXTURE;
  delete process.env.RIVER_OAKS_ACCEPTANCE_FIXTURE;
  try {
    const config = await resolve();
    assert.equal(config.envDir.replace(/\/$/, ''), repoRoot.replace(/\/$/, ''));
    assert.notEqual(config.envDir, config.root);
  } finally {
    if (previous !== undefined) process.env.RIVER_OAKS_ACCEPTANCE_FIXTURE = previous;
  }
});

test('acceptance runs read no env files, so local flags never change a journey', async () => {
  const previous = process.env.RIVER_OAKS_ACCEPTANCE_FIXTURE;
  process.env.RIVER_OAKS_ACCEPTANCE_FIXTURE = '1';
  try {
    assert.equal((await resolve()).envDir, false);
  } finally {
    if (previous === undefined) delete process.env.RIVER_OAKS_ACCEPTANCE_FIXTURE;
    else process.env.RIVER_OAKS_ACCEPTANCE_FIXTURE = previous;
  }
});
