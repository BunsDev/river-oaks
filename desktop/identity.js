// The packaged app's identity on every platform. package-options.js reads these
// for the packager; main.js reads them at runtime. Keep the IDs stable: the
// bundle ID names the macOS app and its Keychain items, and the app user model
// ID is how Windows groups the taskbar button, notifications and jump list.
export const APP_NAME = 'TypeSafe Place';
export const APP_COMPANY = 'Jev Works';
export const APP_BUNDLE_ID = 'works.jev.river-oaks';
// Windows AppUserModelID: no spaces, at most 128 characters, same identity as the bundle ID.
export const APP_USER_MODEL_ID = 'works.jev.river-oaks';
// Linux launchers and desktop entries get a space-free binary; macOS and Windows keep the product name.
export const LINUX_EXECUTABLE = 'typesafe-place';
export const WINDOWS_EXECUTABLE = `${APP_NAME}.exe`;
