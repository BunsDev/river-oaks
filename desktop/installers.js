import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, cp, lstat, mkdir, mkdtemp, readdir, readFile, readlink, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { arch as hostArch, tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { checkPackage, packagedPaths } from './package-check.js';
import { ICON_BASE, ICON_PNG_SIZES } from './package-options.js';
import { APP_COMPANY, APP_HOMEPAGE, APP_NAME, LINUX_EXECUTABLE, WINDOWS_EXECUTABLE, WINDOWS_INSTALL_ID } from './identity.js';

// Installers for the build desktop/package.js made (#372): a Squirrel.Windows
// Setup.exe on Windows, an AppImage and a .deb on Linux. Packaging, the fuse flip
// and the asar stay in package.js; this step starts from its output directory and
// refuses to wrap a build that package-check.js rejects (an unflipped or drifted
// fuse wire, a binary that is not this platform's Electron, an asar that is not
// exactly the staged files, or an app version other than package.json's).
//
//   pnpm run desktop:installers                    unsigned, for the host platform
//   pnpm run desktop:installers --sign test        Windows: ephemeral test certificate (CI rehearsal, never shipped)
//   pnpm run desktop:installers --sign artifact    Windows: Azure Artifact Signing (formerly Trusted Signing)

export const TARGETS = { 'win32-x64': ['squirrel'], 'linux-x64': ['appimage', 'deb'] };
const DEB_ARCH = { x64: 'amd64', arm64: 'arm64' };
const APPIMAGE_ARCH = { x64: 'x86_64', arm64: 'aarch64' };
const DESCRIPTION = 'Desktop client for TypeSafe Place, a shared town you explore with friends.';
// The .deb's Maintainer field needs an address; this is the GitHub identity that signs the commits.
const MAINTAINER = `${APP_COMPANY} <68980965+BunsDev@users.noreply.github.com>`;
// Debian's names for the Electron runtime's shared libraries. Ubuntu 24.04's
// 64-bit time_t packages (libgtk-3-0t64, libasound2t64, …) provide these names.
const DEB_DEPENDS = ['libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils', 'libatspi2.0-0', 'libuuid1', 'libsecret-1-0', 'libgbm1', 'libasound2'];

// Every tool fetched outside the pnpm lockfile, pinned to a release and its
// SHA-256 (GitHub's recorded asset digest and NuGet's package bytes, rechecked
// locally on 2026-10-15). A download whose hash differs is refused, never run.
export const TOOLS = {
  appimagetool: { version: '1.9.1', file: 'appimagetool-x86_64.AppImage', url: 'https://github.com/AppImage/appimagetool/releases/download/1.9.1/appimagetool-x86_64.AppImage', sha256: 'ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0', executable: true },
  // The static type-2 runtime: needs only fusermount3, not libfuse2, so the
  // AppImage starts on Ubuntu 24.04 without extra packages.
  appimageRuntime: { version: '20251108', file: 'runtime-x86_64', url: 'https://github.com/AppImage/type2-runtime/releases/download/20251108/runtime-x86_64', sha256: '2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d' },
  // signtool's dlib for Azure Artifact Signing. 1.0.128 (2026-03-30); later builds are newer than a month.
  artifactSigningClient: { version: '1.0.128', file: 'microsoft.artifactsigning.client.1.0.128.nupkg', url: 'https://api.nuget.org/v3-flatcontainer/microsoft.artifactsigning.client/1.0.128/microsoft.artifactsigning.client.1.0.128.nupkg', sha256: '74bd7d27e6ce1051409c38d9b46bc8df0400ecd643d51ffbf2ac00869061e40b' },
};

export function installerNames(version, arch) {
  return {
    setup: `TypeSafe-Place-${version}-windows-${arch}-Setup.exe`,
    appImage: `TypeSafe-Place-${version}-linux-${arch}.AppImage`,
    deb: `TypeSafe-Place-${version}-linux-${arch}.deb`,
  };
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// Refuses a file whose SHA-256 differs from the pinned one.
export async function verifyDownload(path, tool) {
  const actual = await sha256File(path);
  if (actual !== tool.sha256) throw new Error(`Refusing ${tool.file} ${tool.version}: SHA-256 ${actual} does not match the pinned ${tool.sha256}`);
  return actual;
}

// Downloads a pinned tool into the cache once. A cached copy is rehashed before
// every use, and a download lands under a temporary name until its hash matches.
export async function fetchTool(tool, cacheDir, { fetchImpl = fetch } = {}) {
  const path = join(cacheDir, tool.version, tool.file);
  try { await verifyDownload(path, tool); return path; } catch (error) { if (error.code !== 'ENOENT' && !/^Refusing/.test(error.message)) throw error; }
  await mkdir(dirname(path), { recursive: true });
  const response = await fetchImpl(tool.url);
  if (!response.ok) throw new Error(`Download of ${tool.file} ${tool.version} failed: HTTP ${response.status}`);
  const partial = `${path}.download`;
  await writeFile(partial, Buffer.from(await response.arrayBuffer()));
  try { await verifyDownload(partial, tool); } catch (error) { await rm(partial, { force: true }); throw error; }
  await rename(partial, path);
  if (tool.executable) await chmod(path, 0o755);
  return path;
}

// The checks desktop:package:check runs, on the same build, plus the target
// list: installers exist only for Windows x64 and Linux x64.
export async function preflight(root, platform = process.platform, arch = process.arch) {
  const target = `${platform}-${arch}`;
  if (!TARGETS[target]) return { ok: false, problems: [`no installer is built for ${target}; supported: ${Object.keys(TARGETS).join(', ')}`] };
  return checkPackage(root, platform, arch);
}

// Every file in the build, with its size, mode and SHA-256, so an installed copy
// can be compared with exactly what was packaged (desktop/installer-acceptance.js).
export async function buildManifest(dir) {
  const files = [];
  const walk = async current => {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name);
      const name = relative(dir, path).split(sep).join('/');
      if (entry.isSymbolicLink()) files.push({ path: name, link: await readlink(path) });
      else if (entry.isDirectory()) await walk(path);
      else { const info = await stat(path); files.push({ path: name, size: info.size, mode: (info.mode & 0o7777).toString(8), sha256: await sha256File(path) }); }
    }
  };
  await walk(dir);
  return files;
}

// `sha256sum -c` format: hash, two spaces, file name.
export function sumsFile(entries) {
  return entries.map(({ name, sha256 }) => `${sha256}  ${name}\n`).join('');
}

// --- Linux -----------------------------------------------------------------

export function desktopEntry({ appImage = false, version } = {}) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${APP_NAME}`,
    `Comment=${DESCRIPTION}`,
    `Exec=${LINUX_EXECUTABLE}`,
    `Icon=${LINUX_EXECUTABLE}`,
    'Terminal=false',
    'Categories=Game;AdventureGame;',
    // Electron's window class is the app name (app.setName in main.js), so the
    // dock groups the running window under this entry.
    `StartupWMClass=${APP_NAME}`,
    ...(appImage ? [`X-AppImage-Version=${version}`] : []),
    '',
  ].join('\n');
}

export function debControl({ version, arch, installedSize }) {
  if (!DEB_ARCH[arch]) throw new Error(`no Debian architecture for ${arch}`);
  return [
    `Package: ${LINUX_EXECUTABLE}`,
    `Version: ${version}`,
    `Architecture: ${DEB_ARCH[arch]}`,
    `Maintainer: ${MAINTAINER}`,
    `Installed-Size: ${installedSize}`,
    `Depends: ${DEB_DEPENDS.join(', ')}`,
    'Section: games',
    'Priority: optional',
    `Homepage: ${APP_HOMEPAGE}`,
    `Description: ${APP_NAME} desktop client`,
    ` ${DESCRIPTION}`,
    ' It signs in through GitHub in the system browser and opens the hosted town.',
    '',
  ].join('\n');
}

const LINUX_DIR = fileURLToPath(new URL('./linux/', import.meta.url));

async function treeSize(dir) {
  let bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) bytes += (await stat(join(entry.parentPath, entry.name))).size;
  }
  return bytes;
}

// Installed files must be readable by every user. The packager's output
// folder is created 0700 (a temporary directory moved into place), and a copy
// keeps that mode, so directories become 0755, files gain read for all and lose
// group/other write, and anything its owner can execute becomes executable by all.
export async function normalizeModes(dir) {
  await chmod(dir, 0o755);
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    const path = join(entry.parentPath, entry.name);
    if (entry.isDirectory()) await chmod(path, 0o755);
    else if (entry.isFile()) {
      const mode = (await stat(path)).mode & 0o7777;
      await chmod(path, (mode | 0o444 | (mode & 0o100 ? 0o111 : 0)) & ~0o022);
    }
  }
}

// The packaged tree and the icons, laid out under `prefix` (the .deb's root or the AppImage's AppDir).
async function stageLinux(root, build, prefix) {
  const app = join(prefix, 'usr/lib', LINUX_EXECUTABLE);
  await mkdir(dirname(app), { recursive: true });
  await cp(build, app, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true });
  await normalizeModes(app);
  for (const size of ICON_PNG_SIZES) {
    const icons = join(prefix, `usr/share/icons/hicolor/${size}x${size}/apps`);
    await mkdir(icons, { recursive: true });
    await copyFile(join(root, 'desktop/icon/png', `${size}.png`), join(icons, `${LINUX_EXECUTABLE}.png`));
  }
  return app;
}

async function buildDeb({ root, build, out, version, arch, name }) {
  const stage = await mkdtemp(join(tmpdir(), 'typesafe-place-deb-'));
  try {
    const app = await stageLinux(root, build, stage);
    await chmod(stage, 0o755);
    // Chromium's setuid sandbox helper: root-owned (dpkg-deb --root-owner-group)
    // and setuid, for systems where unprivileged user namespaces are unavailable.
    await chmod(join(app, 'chrome-sandbox'), 0o4755);
    await mkdir(join(stage, 'usr/bin'), { recursive: true });
    await symlink(`../lib/${LINUX_EXECUTABLE}/${LINUX_EXECUTABLE}`, join(stage, 'usr/bin', LINUX_EXECUTABLE));
    await mkdir(join(stage, 'usr/share/applications'), { recursive: true });
    await writeFile(join(stage, 'usr/share/applications', `${LINUX_EXECUTABLE}.desktop`), desktopEntry());
    await mkdir(join(stage, 'usr/share', LINUX_EXECUTABLE), { recursive: true });
    await copyFile(join(LINUX_DIR, 'apparmor-profile'), join(stage, 'usr/share', LINUX_EXECUTABLE, 'apparmor-profile'));
    await mkdir(join(stage, 'DEBIAN'));
    await writeFile(join(stage, 'DEBIAN/control'), debControl({ version, arch, installedSize: Math.ceil(await treeSize(stage) / 1024) }));
    for (const script of ['postinst', 'postrm']) { await copyFile(join(LINUX_DIR, script), join(stage, 'DEBIAN', script)); await chmod(join(stage, 'DEBIAN', script), 0o755); }
    await run('dpkg-deb', ['--root-owner-group', '-Zxz', '--build', stage, join(out, name)]);
  } finally { await rm(stage, { recursive: true, force: true }); }
}

async function buildAppImage({ root, build, out, version, arch, name, tools }) {
  const appDir = await mkdtemp(join(tmpdir(), 'typesafe-place-appdir-'));
  try {
    await stageLinux(root, build, appDir);
    await chmod(appDir, 0o755);
    // The runtime mounts the image and starts AppRun; Electron resolves the
    // symlink through /proc/self/exe and finds its resources beside the binary.
    await symlink(`usr/lib/${LINUX_EXECUTABLE}/${LINUX_EXECUTABLE}`, join(appDir, 'AppRun'));
    await writeFile(join(appDir, `${LINUX_EXECUTABLE}.desktop`), desktopEntry({ appImage: true, version }));
    await copyFile(join(root, 'desktop/icon/png/256.png'), join(appDir, `${LINUX_EXECUTABLE}.png`));
    await symlink(`${LINUX_EXECUTABLE}.png`, join(appDir, '.DirIcon'));
    const appimagetool = await fetchTool(TOOLS.appimagetool, tools);
    const runtime = await fetchTool(TOOLS.appimageRuntime, tools);
    // appimagetool is itself an AppImage; extract-and-run needs no FUSE on the build host.
    await run(appimagetool, ['--no-appstream', '--runtime-file', runtime, appDir, join(out, name)], { env: { ...process.env, ARCH: APPIMAGE_ARCH[arch], APPIMAGE_EXTRACT_AND_RUN: '1', VERSION: version } });
    await chmod(join(out, name), 0o755);
  } finally { await rm(appDir, { recursive: true, force: true }); }
}

// --- Windows ---------------------------------------------------------------

// electron-winstaller's nuspec template copies these names from the build; any
// other top-level file or folder (LICENSES.chromium.html, version, or whatever a
// later Electron adds) is passed as an additional file, so the installed copy
// matches the packaged one file for file.
const NUSPEC_COVERED = [/^locales$/, /^resources$/, /\.bin$/, /\.dll$/, /\.pak$/, /\.exe\.config$/, /\.exe\.sig$/, /^icudtl\.dat$/, /^Squirrel\.exe$/, /^LICENSE$/, /^swiftshader$/, /^vk_swiftshader_icd\.json$/];
export async function nuspecAdditionalFiles(build, exe = WINDOWS_EXECUTABLE) {
  const extra = [];
  for (const entry of await readdir(build, { withFileTypes: true })) {
    if (entry.name === exe || NUSPEC_COVERED.some(pattern => pattern.test(entry.name))) continue;
    // A single file's target names the file, as the template's LICENSE does: NuGet
    // reads `lib\net45` alone as a file called net45, which collides with the folder.
    extra.push({ src: entry.isDirectory() ? `${entry.name}\\**` : entry.name, target: `lib\\net45\\${entry.name}` });
  }
  return extra.sort((a, b) => a.src.localeCompare(b.src));
}

// signtool arguments Squirrel passes for every PE file it packs (the app, its
// DLLs and Squirrel's Update.exe) and for Setup.exe. Artifact Signing reads its
// account from metadata.json and signs with the identity azure/login federated
// (Azure CLI credential only); the test mode signs with a throwaway certificate
// the CI job created and trusts only on its own runner.
export const ARTIFACT_SIGNING_TIMESTAMP = 'http://timestamp.acs.microsoft.com';
export function signingParams(mode, { dlib, metadata, thumbprint } = {}) {
  if (mode === 'artifact') {
    if (!dlib || !metadata) throw new Error('Artifact Signing needs the dlib and metadata.json paths');
    return `/v /fd SHA256 /tr ${ARTIFACT_SIGNING_TIMESTAMP} /td SHA256 /dlib "${dlib}" /dmdf "${metadata}"`;
  }
  if (mode === 'test') {
    if (!/^[0-9A-F]{40}$/i.test(thumbprint ?? '')) throw new Error('Test signing needs RIVER_OAKS_TEST_SIGNING_THUMBPRINT, the SHA-1 thumbprint of a certificate in CurrentUser\\My');
    return `/v /fd SHA256 /sha1 ${thumbprint}`;
  }
  throw new Error(`Unknown signing mode ${mode}; use test or artifact`);
}

// Names only: the values are account identifiers from repository variables, not
// credentials. The credential is the OIDC token azure/login exchanged.
export const ARTIFACT_SIGNING_VARIABLES = ['RIVER_OAKS_SIGNING_ENDPOINT', 'RIVER_OAKS_SIGNING_ACCOUNT', 'RIVER_OAKS_SIGNING_PROFILE'];
export function artifactSigningMetadata(env = process.env) {
  const missing = ARTIFACT_SIGNING_VARIABLES.filter(name => !env[name]);
  if (missing.length) throw new Error(`Artifact Signing is not configured: ${missing.join(', ')} unset`);
  if (!/^https:\/\/[a-z0-9]+\.codesigning\.azure\.net\/?$/.test(env.RIVER_OAKS_SIGNING_ENDPOINT)) throw new Error('RIVER_OAKS_SIGNING_ENDPOINT must be a regional https://<region>.codesigning.azure.net endpoint');
  return {
    Endpoint: env.RIVER_OAKS_SIGNING_ENDPOINT, CodeSigningAccountName: env.RIVER_OAKS_SIGNING_ACCOUNT, CertificateProfileName: env.RIVER_OAKS_SIGNING_PROFILE,
    ExcludeCredentials: ['EnvironmentCredential', 'ManagedIdentityCredential', 'WorkloadIdentityCredential', 'SharedTokenCacheCredential', 'VisualStudioCredential', 'VisualStudioCodeCredential', 'AzurePowerShellCredential', 'AzureDeveloperCliCredential', 'InteractiveBrowserCredential'],
  };
}

// The newest Windows SDK signtool (x64), which supports /dlib. Squirrel looks for
// signtool.exe in the working directory, then beside Squirrel.exe, then on PATH;
// the vendor copy below has none, so PATH decides.
export async function findSigntool(env = process.env) {
  if (env.RIVER_OAKS_SIGNTOOL) return env.RIVER_OAKS_SIGNTOOL;
  const kits = join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Windows Kits', '10', 'bin');
  const versions = (await readdir(kits).catch(() => [])).filter(name => /^10\.\d+\.\d+\.\d+$/.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) { const path = join(kits, version, 'x64', 'signtool.exe'); if (await stat(path).then(() => true, () => false)) return path; }
  throw new Error(`No signtool.exe under ${kits}; install the Windows SDK or set RIVER_OAKS_SIGNTOOL`);
}

// A private copy of electron-winstaller's vendor folder: pnpm skips the
// package's install script (only Electron and esbuild may run scripts), which
// would have copied the host's 7-Zip into place, and signing needs the vendor's
// old signtool.exe out of the way. node_modules is never modified.
async function prepareVendor(root, { signing }) {
  const vendor = await mkdtemp(join(tmpdir(), 'typesafe-place-squirrel-'));
  await cp(join(root, 'node_modules/electron-winstaller/vendor'), vendor, { recursive: true });
  const sevenZip = hostArch() === 'arm64' ? 'arm64' : 'x64';
  await copyFile(join(vendor, `7z-${sevenZip}.exe`), join(vendor, '7z.exe'));
  await copyFile(join(vendor, `7z-${sevenZip}.dll`), join(vendor, '7z.dll'));
  if (signing) await rm(join(vendor, 'signtool.exe'));
  return vendor;
}

async function buildSquirrel({ root, build, out, version, arch, name, sign, tools }) {
  const { createWindowsInstaller } = await import('electron-winstaller');
  const work = await mkdtemp(join(tmpdir(), 'typesafe-place-squirrel-app-'));
  const vendor = await prepareVendor(root, { signing: Boolean(sign) });
  const env = { ...process.env };
  try {
    // electron-winstaller writes Squirrel.exe into the app folder; give it a copy
    // so dist/desktop stays exactly what package.js produced.
    const app = join(work, basename(build));
    await cp(build, app, { recursive: true });
    let signWithParams;
    if (sign) {
      const signtool = await findSigntool();
      process.env.PATH = `${dirname(signtool)}${delimiter}${process.env.PATH}`;
      if (sign === 'artifact') {
        const client = await fetchTool(TOOLS.artifactSigningClient, tools);
        // A .nupkg is a zip. The vendor's 7-Zip, not `tar`: Git Bash puts GNU tar, which cannot read zips, first on PATH.
        const unpacked = join(work, 'artifact-signing');
        await run(join(vendor, '7z.exe'), ['x', client, `-o${unpacked}`, '-y', '-bso0']);
        const metadata = join(work, 'artifact-signing-metadata.json');
        await writeFile(metadata, JSON.stringify(artifactSigningMetadata(), null, 2));
        signWithParams = signingParams('artifact', { dlib: join(unpacked, 'bin', 'x64', 'Azure.CodeSigning.Dlib.dll'), metadata });
      } else signWithParams = signingParams(sign, { thumbprint: process.env.RIVER_OAKS_TEST_SIGNING_THUMBPRINT });
      console.log(`Signing with ${signtool} (${sign})`);
    }
    await createWindowsInstaller({
      appDirectory: app, outputDirectory: out, vendorDirectory: vendor,
      exe: WINDOWS_EXECUTABLE, name: WINDOWS_INSTALL_ID, title: APP_NAME, version,
      authors: APP_COMPANY, owners: APP_COMPANY, description: DESCRIPTION,
      // Shown by Installed apps. Squirrel downloads it at install time; the repository is public.
      iconUrl: 'https://raw.githubusercontent.com/BunsDev/river-oaks/main/desktop/icon/typesafe-place.ico',
      setupIcon: join(root, `${ICON_BASE}.ico`), setupExe: name,
      noMsi: true, noDelta: true, additionalFiles: await nuspecAdditionalFiles(build),
      ...(signWithParams && { signWithParams }),
    });
  } finally {
    process.env.PATH = env.PATH;
    await rm(work, { recursive: true, force: true });
    await rm(vendor, { recursive: true, force: true });
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
    child.on('error', error => reject(new Error(`${basename(command)} could not start: ${error.message}`)));
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${basename(command)} exited with ${signal ?? code}`)));
  });
}

// Builds every installer for the host target into `out` and writes SHA256SUMS
// over them, plus the build manifest the acceptance step compares installs with.
export async function buildInstallers({ root, platform = process.platform, arch = process.arch, out, sign = null, tools = join(root, '.runtime/installer-tools') }) {
  const check = await preflight(root, platform, arch);
  if (!check.ok) throw new Error(`Refusing to build installers from ${check.dir ?? 'this build'}:\n- ${check.problems.join('\n- ')}`);
  if (sign && platform !== 'win32') throw new Error('--sign applies to the Windows installer only');
  const version = check.app.version;
  const build = packagedPaths(root, platform, arch).dir;
  const names = installerNames(version, arch);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const produced = [];
  if (platform === 'win32') {
    await buildSquirrel({ root, build, out, version, arch, name: names.setup, sign, tools });
    // Setup.exe for people; the full package and RELEASES for a later Squirrel updater.
    produced.push(names.setup, `${WINDOWS_INSTALL_ID}-${version}-full.nupkg`, 'RELEASES');
  } else {
    await buildDeb({ root, build, out, version, arch, name: names.deb });
    await buildAppImage({ root, build, out, version, arch, name: names.appImage, tools });
    produced.push(names.appImage, names.deb);
  }
  const listed = (await readdir(out)).sort();
  const unexpected = listed.filter(file => !produced.includes(file));
  const absent = produced.filter(file => !listed.includes(file));
  if (unexpected.length || absent.length) throw new Error(`Installer output differs from the expected files: unexpected ${JSON.stringify(unexpected)}, missing ${JSON.stringify(absent)}`);
  const entries = [];
  for (const name of produced) entries.push({ name, sha256: await sha256File(join(out, name)), bytes: (await lstat(join(out, name))).size });
  await writeFile(join(out, 'SHA256SUMS'), sumsFile(entries));
  const manifest = { app: APP_NAME, version, platform, arch, signed: sign ?? 'unsigned', files: await buildManifest(build) };
  await writeFile(join(out, `build-manifest-${platform}-${arch}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  return { version, platform, arch, signed: manifest.signed, out, installers: entries, fuses: check.fuses, asar: { missing: check.missing, unexpected: check.unexpected } };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // pnpm passes a `--` separator through; accept it.
  const { values } = parseArgs({ args: process.argv.slice(2).filter((arg, index) => index > 0 || arg !== '--'), options: { sign: { type: 'string' }, out: { type: 'string' } } });
  const root = fileURLToPath(new URL('../', import.meta.url));
  // A test-signed build is a rehearsal and goes to its own folder, never next to the shipped ones.
  const out = values.out ?? join(root, values.sign === 'test' ? 'dist/installers-test-signed' : 'dist/installers');
  try { console.log(JSON.stringify(await buildInstallers({ root, out, sign: values.sign ?? null }), null, 2)); }
  catch (error) { console.error(error.message); process.exit(1); }
}
