#!/usr/bin/env node
// Accidental-deletion guard, not a security boundary against a repository owner.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

if(process.argv[2]==='prepared') {
  try {
    let deletions=readFileSync(0,'utf8').trim().split('\n').filter(Boolean).map(line=>line.split(' '))
      .filter(([,next,ref])=>/^0+$/.test(next)&&(/^(refs\/heads\/|refs\/tags\/archive\/)/.test(ref)));
    if(deletions.length) {
      const common=resolve(execFileSync('git',['rev-parse','--git-common-dir'],{encoding:'utf8'}).trim());
      // The files backend prunes loose copies after committing packed-refs.
      // Unlike logical deletion, this phase has no packed-refs lock and retains
      // the identical OID in both storage forms. Unknown layouts remain guarded.
      // Git refs/files-backend.c: prune_ref and files_transaction_prepare.
      deletions=deletions.filter(([old,,ref])=>{
        if(!/^[a-f0-9]{40,64}$/.test(old)||/^0+$/.test(old)||existsSync(join(common,'packed-refs.lock')))return true;
        try {
          const loose=readFileSync(join(common,ref),'utf8').trim();
          const packed=readFileSync(join(common,'packed-refs'),'utf8').split('\n');
          return loose!==old||!packed.includes(`${old} ${ref}`);
        } catch {return true;}
      });
      if(!deletions.length)process.exit(0);
      let permit;
      try {permit=JSON.parse(readFileSync(join(common,'river-oaks-retirement.lock','permit.json'),'utf8'));} catch { /* Fail closed below. */ }
      // Packed-ref deletion may report an unspecified (zero) old OID. Resolve it
      // while Git holds the transaction lock; never treat zero as proof.
      let oldHead=deletions[0]?.[0];
      if(deletions.length===1&&/^0+$/.test(oldHead)) {
        try {oldHead=execFileSync('git',['rev-parse','--verify',deletions[0][2]],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();} catch {oldHead=null;}
      }
      if(deletions.length!==1||!permit||!Number.isFinite(permit.expiresAt)||permit.expiresAt<Date.now()||permit.expiresAt>Date.now()+60_000||
        oldHead!==permit.head||deletions[0][2]!==`refs/heads/${permit.branch}`||
        ['main','master'].includes(permit.branch))throw new Error('Local ref deletion requires project:prune with verified delivery and restoration proof. Archive tags are protected.');
    }
  } catch(error) {process.stderr.write(`project-ref-guard: ${error.message}\n`);process.exitCode=1;}
}
