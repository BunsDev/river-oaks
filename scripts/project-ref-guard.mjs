#!/usr/bin/env node
// Accidental-deletion guard, not a security boundary against a repository owner.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

if(process.argv[2]==='prepared') {
  try {
    const deletions=readFileSync(0,'utf8').trim().split('\n').filter(Boolean).map(line=>line.split(' '))
      .filter(([,next,ref])=>/^0+$/.test(next)&&(/^(refs\/heads\/|refs\/tags\/archive\/)/.test(ref)));
    if(deletions.length) {
      const common=resolve(execFileSync('git',['rev-parse','--git-common-dir'],{encoding:'utf8'}).trim());
      let permit;
      try {permit=JSON.parse(readFileSync(join(common,'river-oaks-retirement.lock','permit.json'),'utf8'));} catch { /* Fail closed below. */ }
      if(deletions.length!==1||!permit||!Number.isFinite(permit.expiresAt)||permit.expiresAt<Date.now()||permit.expiresAt>Date.now()+60_000||
        deletions[0][0]!==permit.head||deletions[0][2]!==`refs/heads/${permit.branch}`||
        ['main','master'].includes(permit.branch))throw new Error('Local ref deletion requires project:prune with verified delivery and restoration proof. Archive tags are protected.');
    }
  } catch(error) {process.stderr.write(`project-ref-guard: ${error.message}\n`);process.exitCode=1;}
}
