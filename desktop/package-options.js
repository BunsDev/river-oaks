import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { APP_NAME, APP_COMPANY, APP_BUNDLE_ID, LINUX_EXECUTABLE, WINDOWS_EXECUTABLE } from './identity.js';

// One source (typesafe-place.svg); desktop/icon/build.mjs derives the rest.
export const ICON_BASE = 'desktop/icon/typesafe-place';
export const ICON_PNG_SIZES = [16, 32, 48, 64, 128, 256, 512];
const ICON_EXTENSION = { darwin: '.icns', win32: '.ico' };

export function packagedBinary(path, platform) {
  return join(path, platform === 'darwin' ? `${APP_NAME}.app` : platform === 'win32' ? WINDOWS_EXECUTABLE : LINUX_EXECUTABLE);
}

// The packager downloads the Electron zip through @electron/get, which checks it
// against SHASUMS256.txt fetched from github.com on every run, cached zip or not,
// unless it is given checksums. A slow github.com then fails packaging (Desktop run
// 39960884564). The installed electron package ships the same list as checksums.json,
// pinned by pnpm-lock.yaml; electron's own install.js verifies with it.
async function electronChecksums(root, version, platform, arch) {
  const file = join(root, 'node_modules/electron/checksums.json');
  const checksums = JSON.parse(await readFile(file, 'utf8'));
  const zip = `electron-v${version}-${platform}-${arch}.zip`;
  if (!/^[0-9a-f]{64}$/.test(checksums[zip] ?? ''))
    throw new Error(`${file} lists no checksum for ${zip}: the installed electron is not package.json's. Run pnpm install --frozen-lockfile.`);
  return checksums;
}

// Only a failed connection or a server error is worth another try. A checksum
// mismatch, a missing release or any other failure ends packaging at once.
const TRANSIENT_CODES = new Set(['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EPIPE']);
export function isTransientNetworkError(error) {
  for (let cause = error, depth = 0; cause && depth < 5; cause = cause.cause, depth++) {
    if (TRANSIENT_CODES.has(cause.code)) return true;
    const status = cause.name === 'HTTPError' ? cause.response?.status : undefined;
    if (status === 429 || status >= 500) return true;
  }
  return false;
}
const reason = error => { const codes = []; for (let cause = error, depth = 0; cause && depth < 5; cause = cause.cause, depth++) codes.push(cause.code ?? cause.response?.status ?? cause.message); return codes.filter(Boolean).join(' < '); };
export async function withNetworkRetry(task, { delays = [10_000, 30_000], sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), warn = console.warn } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await task(); } catch (error) {
      if (attempt >= delays.length || !isTransientNetworkError(error)) throw error;
      warn(`Electron download failed (${reason(error)}); retrying in ${delays[attempt] / 1000} s (${attempt + 1}/${delays.length})`);
      await sleep(delays[attempt]);
    }
  }
}

// The packager completes `icon` with the platform extension itself. Checking the
// file here turns a lost asset into a packaging failure instead of a silent default icon.
export async function packagerOptions({ root, stage, pkg, platform, arch, env = process.env }) {
  const icon = join(root, ICON_BASE);
  const file = `${icon}${ICON_EXTENSION[platform] ?? '.png'}`;
  // Linux reads no icon from the binary; its launcher entry (an installer concern) uses the PNGs.
  const check = platform in ICON_EXTENSION ? file : join(root, 'desktop/icon/png', '256.png');
  try { if (!(await stat(check)).isFile()) throw new Error(); } catch { throw new Error(`Desktop icon is missing: ${check}. Run node desktop/icon/build.mjs.`); }
  const checksums = await electronChecksums(root, pkg.devDependencies.electron, platform, arch);
  return {
    // electron_config_cache is the download cache electron's install.js also uses.
    download: { checksums, ...(env.electron_config_cache && { cacheRoot: env.electron_config_cache }) },
    dir: stage, out: join(root, 'dist/desktop'), name: APP_NAME, icon,
    executableName: platform === 'linux' ? LINUX_EXECUTABLE : APP_NAME,
    appBundleId: APP_BUNDLE_ID, appCategoryType: 'public.app-category.adventure-games',
    // macOS shows this when the game first asks for the microphone (shared voice, only after Unmute).
    extendInfo: { NSMicrophoneUsageDescription: 'TypeSafe Place uses your microphone for voice chat with nearby residents, only after you choose to unmute.' },
    ...(platform === 'win32' && { win32metadata: { CompanyName: APP_COMPANY, ProductName: APP_NAME, FileDescription: APP_NAME, InternalName: 'TypeSafePlace', OriginalFilename: WINDOWS_EXECUTABLE } }),
    electronVersion: pkg.devDependencies.electron, platform, arch, asar: true, overwrite: true, prune: false,
  };
}
