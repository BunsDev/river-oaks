#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

try {
  const git=args=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const common=resolve(git(['rev-parse','--git-common-dir']));
  const destination=join(common,'river-oaks-hooks');
  let existing='';try {existing=git(['config','--get','core.hooksPath']);} catch { /* unset */ }
  if(existing&&existing!=='.githooks'&&resolve(existing)!==destination)throw new Error(`Existing core.hooksPath=${existing}; integrate the guards there before replacing it.`);
  const marker=join(destination,'.river-oaks-managed');
  if(existsSync(destination)&&!existsSync(marker))throw new Error('Unmanaged hook directory exists; preserve it for review.');
  mkdirSync(destination,{recursive:true});writeFileSync(marker,'1\n');
  const nodePath="'"+process.execPath.replaceAll("'","'\\''")+"'";
  const files={
    'pre-commit':readFileSync(new URL('../.githooks/pre-commit',import.meta.url)),
    'reference-transaction':readFileSync(new URL('../.githooks/reference-transaction',import.meta.url),'utf8').replace("installed_node=''",()=>`installed_node=${nodePath}`),
    'project-ref-guard.mjs':readFileSync(new URL('./project-ref-guard.mjs',import.meta.url)),
  };
  for(const [name,contents] of Object.entries(files)){
    const target=join(destination,name),temp=`${target}.${randomUUID()}`;
    writeFileSync(temp,contents,{mode:0o755});renameSync(temp,target);
  }
  git(['config','--local','core.hooksPath',destination]);
  process.stdout.write('Installed shared secret and local ref retirement guards for all worktrees.\n');
} catch(error){process.stderr.write(`install-project-hooks: ${error.message}\n`);process.exitCode=1;}
