import { FuseV1Options, FuseVersion } from '@electron/fuses';

// Electron fuses for the packaged app. strictlyRequireAllFuses makes packaging
// fail if a new Electron adds a fuse nobody has decided on yet.
export const DESKTOP_FUSES = {
  version: FuseVersion.V1,
  strictlyRequireAllFuses: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  // The app loads only the hosted https game, never file:// pages.
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  // Left at Electron's defaults: encrypting the cookie store would add a
  // Keychain prompt, and the V8 snapshot and Wasm trap handlers are unrelated.
  [FuseV1Options.EnableCookieEncryption]: false,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  [FuseV1Options.WasmTrapHandlers]: true,
};
