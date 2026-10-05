import test from 'node:test';
import assert from 'node:assert/strict';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { DESKTOP_FUSES } from '../fuses.js';

// With these on, any local program could run code as River Oaks, inheriting its
// macOS permissions: ELECTRON_RUN_AS_NODE=1, NODE_OPTIONS=--require, or
// --inspect on the packaged binary.
test('the packaged app turns off every way to run Node code as River Oaks', () => {
  assert.equal(DESKTOP_FUSES.version, FuseVersion.V1);
  assert.equal(DESKTOP_FUSES[FuseV1Options.RunAsNode], false);
  assert.equal(DESKTOP_FUSES[FuseV1Options.EnableNodeOptionsEnvironmentVariable], false);
  assert.equal(DESKTOP_FUSES[FuseV1Options.EnableNodeCliInspectArguments], false);
  assert.equal(DESKTOP_FUSES[FuseV1Options.EnableEmbeddedAsarIntegrityValidation], true);
  assert.equal(DESKTOP_FUSES[FuseV1Options.OnlyLoadAppFromAsar], true);
  assert.equal(DESKTOP_FUSES[FuseV1Options.GrantFileProtocolExtraPrivileges], false);
});

test('every fuse this Electron knows is decided, so a new one fails packaging', () => {
  assert.equal(DESKTOP_FUSES.strictlyRequireAllFuses, true);
  const known = Object.values(FuseV1Options).filter(value => typeof value === 'number');
  for (const fuse of known) assert.equal(typeof DESKTOP_FUSES[fuse], 'boolean', FuseV1Options[fuse]);
});
