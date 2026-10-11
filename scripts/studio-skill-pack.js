import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const hash = value => createHash('sha256').update(value).digest('hex');
const marker = '.world-design-pack.json';
const repository = 'https://github.com/BunsDev/river-oaks';
export const WORLD_DESIGN_SKILLS = Object.freeze([
  'reference-board', 'blockout-builder', 'map-scale-blockout', 'player-path-collision',
  'blockout-review', 'room-logic', 'modular-kit-checker', 'camera-framing', 'developer-view',
  'shape-language-depth', 'reference-scene-comparison', 'lighting-pbr-diagnostics',
  'vegetation-placement-collision', 'world-workflow', 'studio-world-design',
]);
const skillPath = name => `.agents/skills/${name}/SKILL.md`;

function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')
    || value.includes(':') || value.startsWith('/') || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe pack path: ${value}`);
  }
  return value;
}
async function statOrMissing(target) {
  try { return await lstat(target); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
// Hosts must hold exclusive ownership during install. Reject every existing symlink,
// including ancestors, rather than accepting a path that happens to resolve inside.
async function safePath(target) {
  const absolute = path.resolve(target), parsed = path.parse(absolute);
  let current = parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await statOrMissing(current);
    if (stat?.isSymbolicLink()) throw new Error(`Unsafe symlink: ${current}`);
    if (current !== absolute && stat && !stat.isDirectory()) throw new Error(`Unsafe path ancestor: ${current}`);
  }
  return absolute;
}
async function readSafeBytes(target) {
  await safePath(target);
  if (!(await lstat(target)).isFile()) throw new Error(`Expected regular file: ${target}`);
  // O_NONBLOCK also prevents a swapped-in FIFO from hanging between lstat and open.
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!(await handle.stat()).isFile()) throw new Error(`Expected regular file: ${target}`);
    return await handle.readFile();
  } finally { await handle.close(); }
}
async function readSafe(target) {
  return (await readSafeBytes(target)).toString('utf8');
}
function visibleMarkdown(content) {
  // Keep offsets while removing fenced/inline code, where example links are not requirements.
  return content.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, value => value.replace(/[^\n]/g, ' '))
    .replace(/(`+)([^`]|(?!\1)`)*?\1/g, value => ' '.repeat(value.length));
}
function markdownLinks(content) {
  const text = visibleMarkdown(content), links = [];
  for (const expression of [/\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/g,
    /^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm]) {
    for (const match of text.matchAll(expression)) {
      const raw = match[1], start = match.index + match[0].indexOf(raw);
      links.push({ target: raw.replace(/^<|>$/g, ''), start, length: raw.length });
    }
  }
  return links.sort((a, b) => a.start - b.start);
}
function anchors(content) {
  const ids = new Set(), counts = new Map();
  for (const match of content.matchAll(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1].toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = counts.get(slug) || 0;
    ids.add(count ? `${slug}-${count}` : slug); counts.set(slug, count + 1);
  }
  for (const match of content.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]);
  return ids;
}
function resolveLocal(from, target) {
  if (/^(?:https?:|mailto:)/i.test(target)) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('/') || target.includes('\\')) throw new Error(`Unsafe link in ${from}: ${target}`);
  const [rawPath, fragment = ''] = target.split('#');
  const decoded = decodeURIComponent(rawPath.split('?')[0]);
  const relative = decoded ? path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded)) : from;
  safeRelative(relative);
  if (relative.startsWith('.runtime/') || relative.split('/').some(part => part === '.git' || part.startsWith('.env'))) {
    throw new Error(`Unsafe private link in ${from}: ${target}`);
  }
  return { path: relative, fragment: decodeURIComponent(fragment) };
}

/** Build a deterministic, UTF-8, host-readable knowledge pack. No writes or network. */
export async function buildWorldDesignPack(root) {
  root = await realpath(root);
  let revision = null;
  try {
    const result = await run('git', ['-C', root, 'rev-parse', 'HEAD']);
    if (/^[a-f0-9]{40,64}$/.test(result.stdout.trim())) revision = result.stdout.trim();
  } catch { /* Exported source trees can still build; repository references are labeled unpinned. */ }
  const queue = WORLD_DESIGN_SKILLS.map(skillPath), originals = new Map(), replacements = new Map(), references = [];
  const localLinks = [];
  while (queue.length) {
    const relative = queue.shift();
    if (originals.has(relative)) continue;
    safeRelative(relative);
    const content = await readSafe(path.join(root, relative));
    originals.set(relative, content);
    if (relative.startsWith('.agents/skills/')) {
      // Repository skills also name a few required guides as root-relative code spans.
      // Preserve their authored text; hosts resolve these paths from the pack root.
      for (const match of content.matchAll(/`(docs\/[a-zA-Z0-9_./-]+\.md)`/g)) {
        safeRelative(match[1]); queue.push(match[1]);
      }
    }
    for (const link of markdownLinks(content)) {
      const local = resolveLocal(relative, link.target);
      if (!local) continue;
      const target = path.join(root, local.path);
      await safePath(target);
      const stat = await statOrMissing(target);
      if (!stat) throw new Error(`Missing required link in ${relative}: ${link.target}`);
      if (stat.isFile() && local.path.endsWith('.md')) {
        localLinks.push({ from: relative, ...local }); queue.push(local.path);
      } else {
        if (!stat.isFile() && !stat.isDirectory()) throw new Error(`Unsafe link target: ${local.path}`);
        const url = `${repository}/${stat.isDirectory() ? 'tree' : 'blob'}/${revision || 'main'}/${local.path.split('/').map(encodeURIComponent).join('/')}${local.fragment ? `#${encodeURIComponent(local.fragment)}` : ''}`;
        const sourceSha256 = stat.isFile() ? hash(await readSafeBytes(target)) : null;
        references.push({ from: relative, path: local.path, url, sha256: sourceSha256, revisionPinned: Boolean(revision) });
        const edits = replacements.get(relative) || [];
        edits.push({ ...link, url }); replacements.set(relative, edits);
      }
    }
  }
  const linkWarnings = [];
  for (const link of localLinks) {
    if (link.fragment && !anchors(originals.get(link.path)).has(link.fragment)) {
      if (link.from.startsWith('.agents/skills/') || link.from === 'docs/level-design-skills.md') {
        throw new Error(`Missing required anchor: ${link.from} -> ${link.path}#${link.fragment}`);
      }
      linkWarnings.push({ ...link, code: 'missing-reference-anchor' });
    }
  }
  const files = [...originals.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([relative, original]) => {
    let content = original;
    for (const edit of (replacements.get(relative) || []).sort((a, b) => b.start - a.start)) {
      content = content.slice(0, edit.start) + edit.url + content.slice(edit.start + edit.length);
    }
    return { path: relative, content, sha256: hash(content) };
  });
  const manifest = {
    formatVersion: 1, id: 'river-oaks-world-design', version: '1.0.0', repository, sourceRevision: revision,
    entrypoint: skillPath('studio-world-design'), linkWarnings,
    skills: WORLD_DESIGN_SKILLS.map(name => ({ name, path: skillPath(name) })),
    files: files.map(({ path: relative, content, sha256 }) => ({ path: relative, sha256, bytes: Buffer.byteLength(content) })),
    repositoryReferences: references.sort((a, b) => `${a.from}:${a.path}:${a.url}`.localeCompare(`${b.from}:${b.path}:${b.url}`, 'en')),
  };
  return { manifest: { ...manifest, sha256: hash(JSON.stringify(manifest)) }, files };
}

function validatePack(pack) {
  const { sha256, ...manifest } = pack?.manifest || {};
  if (manifest.formatVersion !== 1 || manifest.id !== 'river-oaks-world-design' || manifest.version !== '1.0.0'
    || hash(JSON.stringify(manifest)) !== sha256 || !Array.isArray(pack.files)
    || pack.files.length !== manifest.files?.length
    || JSON.stringify(manifest.skills) !== JSON.stringify(WORLD_DESIGN_SKILLS.map(name => ({ name, path: skillPath(name) })))) {
    throw new Error('Invalid pack manifest or hash');
  }
  const seen = new Set();
  for (const [index, file] of pack.files.entries()) {
    safeRelative(file.path);
    const entry = manifest.files[index];
    if (file.path === marker || !file.path.endsWith('.md') || seen.has(file.path)
      || file.path !== entry.path || typeof file.content !== 'string' || hash(file.content) !== file.sha256
      || file.sha256 !== entry.sha256 || Buffer.byteLength(file.content) !== entry.bytes) throw new Error(`Pack file hash/path mismatch: ${file.path}`);
    seen.add(file.path);
  }
  if (WORLD_DESIGN_SKILLS.some(name => !seen.has(skillPath(name)))) throw new Error('Missing required pack skill');
}
const manifestText = pack => `${JSON.stringify(pack.manifest, null, 2)}\n`;

/** Read-only verification, including all ancestors and installed-file symlinks. */
export async function verifyWorldDesignPack(pack, destination) {
  validatePack(pack);
  const errors = [];
  const expected = [{ path: marker, content: manifestText(pack) }, ...pack.files];
  for (const file of expected) {
    try {
      const actual = await readSafeBytes(path.join(destination, file.path));
      if (hash(actual) !== hash(file.content)) errors.push({ path: file.path, code: 'hash-mismatch' });
    } catch (error) {
      errors.push({ path: file.path, code: error.code === 'ENOENT' ? 'missing-file' : 'unsafe-path', message: error.message });
    }
  }
  return { ok: errors.length === 0, version: pack.manifest.version, sha256: pack.manifest.sha256, checked: expected.length, errors };
}

async function assertOwnedContents(pack, destination) {
  const files = new Set([marker, ...pack.files.map(file => file.path)]), directories = new Set();
  for (const file of files) {
    for (let parent = path.posix.dirname(file); parent !== '.'; parent = path.posix.dirname(parent)) directories.add(parent);
  }
  const pending = [''];
  while (pending.length) {
    const relative = pending.pop();
    for (const name of await readdir(path.join(destination, relative))) {
      const entry = relative ? `${relative}/${name}` : name;
      const target = await safePath(path.join(destination, entry));
      const stat = await lstat(target);
      if (stat.isDirectory() && directories.has(entry)) pending.push(entry);
      else if (!stat.isFile()) throw new Error(`Expected regular file or owned directory: ${entry}`);
      else if (!files.has(entry)) throw new Error(`Unexpected unrelated content in pack workspace: ${entry}`);
    }
  }
}

/** Install in a host-owned new pack workspace, or resume an identical owned pack.
 * Host must serialize access; this is not a sandbox against concurrent hostile renames.
 * No merge, update, identity creation, credentials, tools, or runtime activation occurs.
 */
export async function installWorldDesignPack(pack, destination) {
  validatePack(pack);
  destination = await safePath(destination);
  const stat = await statOrMissing(destination);
  if (stat && !stat.isDirectory()) throw new Error('Install destination must be a new directory');
  let missing = pack.files, writeMarker = true;
  if (stat && (await readdir(destination)).length) {
    const installedMarker = path.join(destination, marker);
    if (!await statOrMissing(installedMarker)) throw new Error('Install requires an empty new workspace; existing identity/workspace is protected');
    if (hash(await readSafeBytes(installedMarker)) !== hash(manifestText(pack))) throw new Error('Existing pack manifest differs');
    // Preflight the entire tree before writing anything, including paths that follow
    // a missing file. Matching ownership metadata does not authorize other content.
    await assertOwnedContents(pack, destination);
    const result = await verifyWorldDesignPack(pack, destination);
    const conflicts = result.errors.filter(error => error.code !== 'missing-file');
    if (conflicts.length) throw new Error(`Existing pack differs or has unsafe paths: ${conflicts.map(error => `${error.code} ${error.message || error.path}`).join('; ')}`);
    const missingPaths = new Set(result.errors.map(error => error.path));
    missing = pack.files.filter(file => missingPaths.has(file.path));
    writeMarker = false;
  }
  await mkdir(destination, { recursive: true });
  // Write ownership before payloads so interruption can resume verified missing files.
  // A truncated/changed file still requires explicit host recovery; never replace it.
  const writes = [...(writeMarker ? [{ path: marker, content: manifestText(pack) }] : []), ...missing];
  for (const file of writes) {
    const target = path.join(destination, file.path);
    await safePath(target);
    await mkdir(path.dirname(target), { recursive: true });
    await safePath(target);
    const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(file.content, 'utf8'); } finally { await handle.close(); }
  }
  return { ...await verifyWorldDesignPack(pack, destination), installed: missing.length, unchanged: pack.files.length - missing.length, destination };
}
