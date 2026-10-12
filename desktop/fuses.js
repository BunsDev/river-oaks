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
  // Cookie encryption stays off until the app ships with Developer ID signing
  // (a release gate in docs/security-review.md). The cookie store's key lives in
  // the Keychain item the app creates; macOS trusts the same signed app with it
  // across updates, but each ad-hoc build has a new signature, so every update
  // would ask for Keychain access, and declining leaves sessions unreadable.
  // Turn it on in the same release that adds signing. The V8 snapshot and Wasm
  // trap handlers are left at Electron's defaults; they are unrelated.
  [FuseV1Options.EnableCookieEncryption]: false,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  [FuseV1Options.WasmTrapHandlers]: true,
};
