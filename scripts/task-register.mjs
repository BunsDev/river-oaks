#!/usr/bin/env node
// The live task register: one JSON file in the common Git directory, shared by
// every worktree and changed only under a short lock, like the land queue. Git
// never reads or writes it, so a pull, a branch switch or a GUI client's stash
// cannot move it. The tracked docs/project-management/tasks.json is a snapshot,
// changed only by a register sweep.
//
// Older instructions edited the primary checkout's tracked copy instead. Every
// read absorbs such an edit by task id (newer updatedAt wins, as in the merge
// driver) and puts the tracked file back to its committed content, so the
// primary checkout stays clean and a pull never meets a modified register.
//
//   pnpm run --silent register path                 # print the live register's path
//   pnpm run --silent register show [<id>]          # print the register, or one task
//   pnpm run register patch <id> --json '{...}' [--unset a,b] [--create]
//   pnpm run register absorb                        # absorb a legacy edit now
//   pnpm run register snapshot [--out <file>]       # write the live register out (sweeps)
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mergeRegisters } from './merge-task-register.mjs';
import { validateTasks } from './project-status.mjs';

export const REGISTER = 'docs/project-management/tasks.json';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

export function registerPaths(root) {
  const common = resolve(root, git(root, 'rev-parse', '--git-common-dir').trim());
  const primary = git(root, 'worktree', 'list', '--porcelain').split('\n').find(line => line.startsWith('worktree '))?.slice('worktree '.length) ?? null;
  const live = join(common, 'river-oaks-tasks.json');
  return { live, lock: `${live}.lock`, primary, tracked: primary && join(primary, REGISTER) };
}

// A plain directory lock: it guards a few milliseconds of work, so one older than
// 30 s was abandoned by a process that died holding it.
export function withRegisterLock(lock, action) {
  for (let tries = 0; ; tries++) {
    try { mkdirSync(lock); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try { if (Date.now() - statSync(lock).mtimeMs > 30000) { rmdirSync(lock); continue; } } catch { continue; }
      if (tries > 400) throw new Error(`The task register lock is held: ${lock}`);
      pause(25);
    }
  }
  try { return action(); } finally { rmdirSync(lock); }
}

const parse = text => {
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || !Array.isArray(value.tasks)) throw new Error('not a task register');
  return value;
};
const write = (path, register) => {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(register, null, 2) + '\n'); renameSync(temporary, path);
};
const committed = primary => { try { return git(primary, 'show', `HEAD:${REGISTER}`); } catch { return null; } };

// Under the lock: create the live register if it is missing, then fold in any edit
// made to the primary's tracked copy and restore that copy to its committed text.
// A tracked copy that does not parse (conflict markers) is left for a person.
function absorbLocked(paths, { resetPrimary = true } = {}) {
  const { live, tracked, primary } = paths, result = { created: false, absorbed: false, reset: false, notes: [] };
  const working = tracked && existsSync(tracked) ? readFileSync(tracked, 'utf8') : null, head = primary ? committed(primary) : null;
  if (!existsSync(live)) {
    const seed = [working, head].find(text => { try { return text !== null && parse(text); } catch { return false; } });
    write(live, seed ? parse(seed) : { schemaVersion: 1, tasks: [] }); result.created = true;
    if (seed === working && working !== head) result.absorbed = true;
  } else if (working !== null && working !== head) {
    let edited;
    try { edited = parse(working); } catch { result.notes.push(`${REGISTER} in the primary checkout does not parse; resolve it by hand`); return result; }
    const { register, notes } = mergeRegisters(head === null ? { tasks: [] } : parse(head), parse(readFileSync(live, 'utf8')), edited);
    write(live, register); result.absorbed = true; result.notes.push(...notes);
  }
  // Restore only the text that was absorbed: a write that landed meanwhile stays for next time.
  if (resetPrimary && result.absorbed && head !== null && readFileSync(tracked, 'utf8') === working) { writeFileSync(tracked, head); result.reset = true; }
  return result;
}

export function absorbPrimaryRegister(root, options) {
  const paths = registerPaths(root);
  return withRegisterLock(paths.lock, () => absorbLocked(paths, options));
}

/** The live register's path, created and up to date with any legacy edit. */
export function ensureLiveRegister(root, options) { absorbPrimaryRegister(root, options); return registerPaths(root).live; }

export function readLiveRegister(root, options) {
  const paths = registerPaths(root);
  return withRegisterLock(paths.lock, () => { absorbLocked(paths, options); return parse(readFileSync(paths.live, 'utf8')); });
}

// Change the live register under the lock. A change that adds validation errors
// the register did not already have is refused and nothing is written.
export function updateLiveRegister(root, mutate, options) {
  const paths = registerPaths(root);
  return withRegisterLock(paths.lock, () => {
    absorbLocked(paths, options);
    const register = parse(readFileSync(paths.live, 'utf8')), before = new Set(validateTasks(register));
    const next = mutate(register) ?? register, added = validateTasks(next).filter(error => !before.has(error));
    if (added.length) throw new Error(`Refusing to write an invalid register:\n${added.join('\n')}`);
    write(paths.live, next);
    return next;
  });
}

// What project:status reads by default: the live register in a Git checkout, the
// file itself elsewhere. A tracked copy with conflict markers is returned as is,
// so the caller names the markers instead of hiding them behind the live copy.
export function defaultRegisterText(root) {
  let paths;
  try { paths = registerPaths(root); } catch { return readFileSync(resolve(root, REGISTER), 'utf8'); }
  const tracked = paths.tracked && existsSync(paths.tracked) ? readFileSync(paths.tracked, 'utf8') : '';
  if (/^(<{7}|>{7})( |$)/m.test(tracked)) return tracked;
  return JSON.stringify(readLiveRegister(root), null, 2) + '\n';
}

/** Apply a field patch to one task: set the given fields, drop the unset ones, stamp updatedAt. */
export function patchTask(register, id, fields, { unset = [], create = false } = {}) {
  let task = register.tasks.find(item => item.id === id);
  if (!task) {
    if (!create) throw new Error(`No task ${id} in the live register; pass --create to add it`);
    task = { id }; register.tasks.push(task);
  }
  Object.assign(task, fields);
  for (const key of unset) delete task[key];
  if (!('updatedAt' in fields)) task.updatedAt = stamp();
  return register;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2), root = process.cwd();
  const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  try {
    if (command === 'path') process.stdout.write(`${ensureLiveRegister(root)}\n`);
    else if (command === 'show') {
      const register = readLiveRegister(root), id = args[0];
      const value = id ? register.tasks.find(task => task.id === id) : register;
      if (!value) throw new Error(`No task ${id} in the live register`);
      process.stdout.write(JSON.stringify(value, null, 2) + '\n');
    } else if (command === 'patch') {
      const id = args[0], json = option('--json');
      if (!id || id.startsWith('--') || json === undefined) throw new Error("Usage: register patch <id> --json '{...}' [--unset a,b] [--create]");
      const fields = JSON.parse(json);
      if (!fields || typeof fields !== 'object' || Array.isArray(fields) || 'id' in fields) throw new Error('--json must be an object of fields, without id');
      const unset = option('--unset')?.split(',').filter(Boolean) ?? [];
      updateLiveRegister(root, register => patchTask(register, id, fields, { unset, create: args.includes('--create') }));
      process.stdout.write(`${id} updated in ${registerPaths(root).live}\n`);
    } else if (command === 'absorb') {
      const result = absorbPrimaryRegister(root);
      process.stdout.write(JSON.stringify({ live: registerPaths(root).live, ...result }, null, 2) + '\n');
    } else if (command === 'snapshot') {
      const out = resolve(root, option('--out') ?? REGISTER), register = readLiveRegister(root);
      const temporary = `${out}.${randomUUID()}.tmp`;
      try { writeFileSync(temporary, JSON.stringify(register, null, 2) + '\n'); renameSync(temporary, out); }
      catch (error) { try { unlinkSync(temporary); } catch { /* Nothing to clean. */ } throw error; }
      process.stdout.write(`Wrote ${register.tasks.length} tasks to ${out}\n`);
    } else throw new Error('Usage: register <path|show|patch|absorb|snapshot>');
  } catch (error) { process.stderr.write(`register: ${error.message}\n`); process.exitCode = 1; }
}
