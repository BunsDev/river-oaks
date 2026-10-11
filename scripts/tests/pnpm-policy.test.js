import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const script=fileURLToPath(new URL('../enforce-pnpm.mjs',import.meta.url));
const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url)));
test('package-manager guard accepts pinned pnpm and rejects npm, yarn, missing and wrong versions',t=>{
 const cwd=mkdtempSync(join(tmpdir(),'river-pnpm-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 writeFileSync(join(cwd,'package.json'),JSON.stringify({packageManager:'pnpm@10.34.5'}));
 const run=agent=>spawnSync(process.execPath,[script],{cwd,encoding:'utf8',env:{...process.env,npm_config_user_agent:agent}});
 assert.equal(run('pnpm/10.34.5 npm/? node/v24.0.0').status,0);
 for(const agent of ['npm/11.0.0','yarn/1.22.0','','pnpm/10.0.0']) {const result=run(agent);assert.equal(result.status,1);assert.match(result.stderr,/pnpm@10.34.5/);}
 writeFileSync(join(cwd,'package-lock.json'),'{}');assert.equal(run('pnpm/10.34.5').status,1);
});
test('repository declares one pinned package manager and guards each public script',()=>{
 assert.equal(pkg.packageManager,'pnpm@10.34.5');
 for(const name of Object.keys(pkg.scripts).filter(name=>!name.startsWith('pre') && !['postinstall','install'].includes(name)))
   assert.match(pkg.scripts[`pre${name}`]??'',/enforce-pnpm/);
 assert.equal(existsSync(new URL('../../package-lock.json',import.meta.url)),false);
 assert.equal(existsSync(new URL('../../pnpm-lock.yaml',import.meta.url)),true);
});
