import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_NAME, APP_COMPANY, APP_BUNDLE_ID, LINUX_EXECUTABLE, WINDOWS_EXECUTABLE } from './identity.js';

// One source (typesafe-place.svg); desktop/icon/build.mjs derives the rest.
export const ICON_BASE = 'desktop/icon/typesafe-place';
export const ICON_PNG_SIZES = [16, 32, 48, 64, 128, 256, 512];
const ICON_EXTENSION = { darwin: '.icns', win32: '.ico' };

export function packagedBinary(path, platform) {
  return join(path, platform === 'darwin' ? `${APP_NAME}.app` : platform === 'win32' ? WINDOWS_EXECUTABLE : LINUX_EXECUTABLE);
}

// The packager completes `icon` with the platform extension itself. Checking the
// file here turns a lost asset into a packaging failure instead of a silent default icon.
export async function packagerOptions({ root, stage, pkg, platform, arch }) {
  const icon = join(root, ICON_BASE);
  const file = `${icon}${ICON_EXTENSION[platform] ?? '.png'}`;
  // Linux reads no icon from the binary; its launcher entry (an installer concern) uses the PNGs.
  const check = platform in ICON_EXTENSION ? file : join(root, 'desktop/icon/png', '256.png');
  try { if (!(await stat(check)).isFile()) throw new Error(); } catch { throw new Error(`Desktop icon is missing: ${check}. Run node desktop/icon/build.mjs.`); }
  return {
    dir: stage, out: join(root, 'dist/desktop'), name: APP_NAME, icon,
    executableName: platform === 'linux' ? LINUX_EXECUTABLE : APP_NAME,
    appBundleId: APP_BUNDLE_ID, appCategoryType: 'public.app-category.adventure-games',
    // macOS shows this when the game first asks for the microphone (shared voice, only after Unmute).
    extendInfo: { NSMicrophoneUsageDescription: 'TypeSafe Place uses your microphone for voice chat with nearby residents, only after you choose to unmute.' },
    ...(platform === 'win32' && { win32metadata: { CompanyName: APP_COMPANY, ProductName: APP_NAME, FileDescription: APP_NAME, InternalName: 'TypeSafePlace', OriginalFilename: WINDOWS_EXECUTABLE } }),
    electronVersion: pkg.devDependencies.electron, platform, arch, asar: true, overwrite: true, prune: false,
  };
}
