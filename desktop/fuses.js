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
  // Cookies are encrypted with a key in a Keychain item the app creates. macOS lets
  // the same Developer ID-signed app back into that item after every update
  // (desktop/sign.js), so this waited for signing: each ad-hoc build had a new
  // signature, every update would have asked for Keychain access, and declining
  // would have left sessions unreadable. Cookies saved unencrypted by an earlier
  // build still read. The V8 snapshot and Wasm trap handlers are left at
  // Electron's defaults; they are unrelated.
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  [FuseV1Options.WasmTrapHandlers]: true,
};
