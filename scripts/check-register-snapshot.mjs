#!/usr/bin/env node
// Feature PRs leave docs/project-management/tasks.json alone. The live register is
// in the common Git directory (task-register.mjs); the tracked file is a snapshot
// that only a register sweep updates. A branch that commits its own entry makes
// main's copy churn, and GitHub's update-branch cannot run the register merge
// driver, so every such change left other PRs dirty.
//
//   node scripts/check-register-snapshot.mjs <base-ref> <head-branch>
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const SNAPSHOT = 'docs/project-management/tasks.json';
export const SWEEP_BRANCH = /^docs\/register-sweep/;

export function snapshotChangeAllowed({ changed, headBranch }) {
  return !changed.includes(SNAPSHOT) || SWEEP_BRANCH.test(headBranch ?? '');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [baseRef, headBranch] = process.argv.slice(2);
  if (!baseRef) { process.stdout.write('check-register-snapshot: not a pull request; nothing to check\n'); process.exit(0); }
  const changed = execFileSync('git', ['diff', '--name-only', `origin/${baseRef}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
  if (snapshotChangeAllowed({ changed, headBranch })) process.stdout.write('check-register-snapshot: the task register snapshot is unchanged\n');
  else {
    process.stderr.write(`::error file=${SNAPSHOT}::This PR changes the task register snapshot. Record task changes in the live register (pnpm run register patch <id> --json '{...}') and drop them from the branch: git checkout origin/${baseRef} -- ${SNAPSHOT}. Only docs/register-sweep-* branches update the snapshot.\n`);
    process.exitCode = 1;
  }
}
