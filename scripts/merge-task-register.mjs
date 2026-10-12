#!/usr/bin/env node
// Git merge driver for docs/project-management/tasks.json: a three-way merge by
// task id. The primary checkout holds the live register uncommitted while
// branches commit their own entries, so a line merge (a branch update, a rebase,
// a GUI client's stash pop) leaves conflict markers and invalid JSON.
// install-project-hooks.mjs registers this driver; .gitattributes selects it.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sorted = value => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]))
  : Array.isArray(value) ? value.map(sorted) : value;
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const updated = task => { const time = Date.parse(task?.updatedAt); return Number.isFinite(time) ? time : -Infinity; };

// An earlier autostash pull left one id twice; keep the newest copy of each.
function byId(register) {
  const tasks = new Map();
  for (const task of register?.tasks ?? []) {
    const prior = tasks.get(task.id);
    if (!prior || updated(task) > updated(prior)) tasks.set(task.id, task);
  }
  return tasks;
}

// Changed on one side only: take that side, deletion included. Changed on both:
// the newer updatedAt wins, and a deletion never discards the other side's edit.
function pick(base, ours, theirs, notes, label) {
  if (same(ours, theirs)) return ours;
  if (same(base, ours)) return theirs;
  if (same(base, theirs)) return ours;
  if (ours === undefined) return theirs;
  if (theirs === undefined) return ours;
  if (updated(theirs) > updated(ours)) return theirs;
  if (updated(theirs) === updated(ours)) notes.push(`${label}: both sides changed it with the same updatedAt; kept the current side`);
  return ours;
}

export function mergeRegisters(base, ours, theirs) {
  const notes = [], register = {};
  const B = byId(base), O = byId(ours), T = byId(theirs);
  for (const key of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
    if (key === 'tasks') {
      register.tasks = [];
      for (const id of new Set([...O.keys(), ...T.keys()])) {
        const task = pick(B.get(id), O.get(id), T.get(id), notes, id);
        if (task !== undefined) register.tasks.push(task);
      }
    } else {
      const value = pick(base?.[key], ours[key], theirs[key], notes, key);
      if (value !== undefined) register[key] = value;
    }
  }
  return {register, notes};
}

function readRegister(path, emptyAllowed = false) {
  const text = readFileSync(path, 'utf8');
  if (emptyAllowed && !text.trim()) return {tasks: []};
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || !Array.isArray(value.tasks)) throw new Error('not a task register');
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Git passes the ancestor, the current version (rewritten in place) and the other version.
  const [basePath, currentPath, otherPath, name = 'docs/project-management/tasks.json'] = process.argv.slice(2);
  try {
    const {register, notes} = mergeRegisters(readRegister(basePath, true), readRegister(currentPath), readRegister(otherPath));
    const temporary = `${currentPath}.${randomUUID()}`;
    writeFileSync(temporary, JSON.stringify(register, null, 2) + '\n');
    renameSync(temporary, currentPath);
    for (const note of notes) process.stderr.write(`merge-task-register: ${name}: ${note}\n`);
  } catch (error) {
    // Not a parseable register (for example committed conflict markers): let Git's
    // line merge produce ordinary conflict markers for a person to resolve.
    process.stderr.write(`merge-task-register: ${name}: ${error.message}; using a line merge\n`);
    try { execFileSync('git', ['merge-file', '-L', 'current', '-L', 'base', '-L', 'other', currentPath, basePath, otherPath], {stdio: 'inherit'}); }
    catch (fallback) { process.exitCode = fallback.status || 1; }
  }
}
