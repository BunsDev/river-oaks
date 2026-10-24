import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cancelDetached, cancelStale, planCancellation, planDetachedCancellation, pythonFor, resumeCancellation } from '../project-prune-cancel.mjs';

function fixture(t){
  const base=mkdtempSync(join(tmpdir(),'river-cancel-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const root=join(base,'repo'),checkout=join(base,'feature');mkdirSync(root);
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  writeFileSync(join(root,'file'),'base');writeFileSync(join(root,'.gitignore'),'.runtime/\n');git('add','.');git('commit','-m','base');
  git('worktree','add','-b','feature',checkout);writeFileSync(join(checkout,'file'),'unfinished');
  git('-C',checkout,'commit','-am','unfinished');const head=git('rev-parse','feature');
  writeFileSync(join(checkout,'file'),'unsaved edit');writeFileSync(join(checkout,'untracked'),'local note');
  mkdirSync(join(checkout,'.runtime'));writeFileSync(join(checkout,'.runtime','receipt'),'private local evidence');
  const task={id:'fixture',title:'Unfinished fixture',status:'active',branches:['feature'],owner:'old-session',leaseUntil:new Date(Date.now()-3600000).toISOString(),updatedAt:new Date().toISOString(),nextAction:'Continue work',filesOwned:[],requiredChecks:[]};
  const register={schemaVersion:1,tasks:[task]},tasksPath=join(root,'tasks.json');writeFileSync(tasksPath,JSON.stringify(register));
  const pulls=[{number:1,state:'open',updated_at:new Date().toISOString(),head:{ref:'feature',sha:head}}];
  const activity={available:true,paths:[]};
  const options={root,branch:'feature',expectedHead:head,register,pulls,activity,now:Date.now()+13*3600000};
  return {base,root,checkout,git,head,task,register,tasksPath,pulls,activity,options};
}

test('12-hour cancellation fails closed for recent touches and live activity',t=>{
  const f=fixture(t);
  assert.ok(planCancellation({...f.options,now:Date.now()}).blockers.includes('touched-within-cutoff'));
  assert.equal(planCancellation(f.options).eligible,true);
  f.activity.paths=[f.checkout];assert.ok(planCancellation(f.options).blockers.includes('active-process'));f.activity.paths=[];
  f.pulls[0].updated_at=new Date(f.options.now).toISOString();
  assert.ok(planCancellation(f.options).blockers.includes('touched-within-cutoff'));
});

test('explicit six-hour cutoff accepts work older than six hours but newer than twelve',t=>{
  const f=fixture(t),now=Date.now()+7*3600000;
  assert.ok(planCancellation({...f.options,now,staleHours:12}).blockers.includes('touched-within-cutoff'));
  assert.equal(planCancellation({...f.options,now,staleHours:6}).eligible,true);
});

test('authorized stale cancellation restores Git and local files before guarded removal',t=>{
  const f=fixture(t),hooks=join(f.root,'hooks');mkdirSync(hooks);
  const external=join(f.base,'external');mkdirSync(external);writeFileSync(join(external,'keep'),'outside checkout');
  symlinkSync(external,join(f.checkout,'node_modules'));
  chmodSync(join(f.checkout,'.runtime','receipt'),0o666);
  linkSync(join(f.checkout,'.runtime','receipt'),join(f.checkout,'.runtime','receipt-hardlink'));
  const guard=new URL('../project-ref-guard.mjs',import.meta.url).pathname;
  writeFileSync(join(hooks,'reference-transaction'),`#!/bin/sh\nexec node '${guard}' "$@"\n`,{mode:0o755});f.git('config','core.hooksPath',hooks);
  const archiveRoot=join(f.base,'archives');
  const result=cancelStale({...f.options,tasksPath:f.tasksPath,archiveRoot,loadEvidence:()=>({register:f.register,pulls:f.pulls,activity:f.activity})});
  assert.equal(result.status,'cancelled-local');assert.equal(existsSync(f.checkout),false);
  assert.throws(()=>f.git('rev-parse','--verify','refs/heads/feature'));
  assert.equal(f.git('rev-parse',result.tag),f.head);
  const manifest=JSON.parse(readFileSync(result.localFiles[0].manifest));
  assert.equal(manifest.entries['file'].sha256.length,64);
  assert.equal(manifest.entries['untracked'].sha256.length,64);
  assert.equal(manifest.entries['.runtime/receipt'].sha256.length,64);
  assert.equal(manifest.entries['.runtime/receipt'].mode,0o666);
  assert.equal(manifest.entries['.runtime/receipt-hardlink'].sha256,manifest.entries['.runtime/receipt'].sha256);
  assert.equal(manifest.entries.node_modules.target,external);
  assert.equal(readFileSync(join(external,'keep'),'utf8'),'outside checkout');
  assert.ok(existsSync(result.localFiles[0].archive));
  const saved=JSON.parse(readFileSync(f.tasksPath));
  assert.equal(saved.tasks[0].status,'queued');assert.deepEqual(saved.tasks[0].branches,[]);
  assert.ok(saved.tasks[0].archive.feature);
});

test('cancellation bundles only the commits the default branch lacks',t=>{
  const f=fixture(t),base=f.git('rev-parse','main');f.git('update-ref','refs/remotes/origin/main',base);
  const result=cancelStale({...f.options,tasksPath:f.tasksPath,archiveRoot:join(f.base,'archives'),loadEvidence:()=>({register:f.register,pulls:f.pulls,activity:f.activity})});
  assert.equal(result.status,'cancelled-local');assert.deepEqual(result.prerequisites,[base]);
  const restored=join(f.base,'recovery');f.git('init','--bare',restored);
  f.git('-C',restored,'fetch',f.root,'main:main');f.git('-C',restored,'fetch',result.bundle,`${result.tag}:refs/heads/recovered`);
  assert.equal(f.git('-C',restored,'rev-parse','recovered'),f.head);
});

test('verified partial archive can resume when nested ignored Git data survives clean',t=>{
  const f=fixture(t),hooks=join(f.root,'hooks');mkdirSync(hooks);
  const guard=new URL('../project-ref-guard.mjs',import.meta.url).pathname;
  writeFileSync(join(hooks,'reference-transaction'),`#!/bin/sh\nexec node '${guard}' "$@"\n`,{mode:0o755});f.git('config','core.hooksPath',hooks);
  const nested=join(f.checkout,'.runtime','nested');mkdirSync(nested);
  execFileSync('git',['init',nested],{stdio:'pipe'});
  const archiveRoot=join(f.base,'archives');
  assert.throws(()=>cancelStale({...f.options,tasksPath:f.tasksPath,archiveRoot,loadEvidence:()=>({register:f.register,pulls:f.pulls,activity:f.activity})}),/Worktree still has local files/);
  assert.ok(existsSync(f.checkout));
  const archives=execFileSync('find',[archiveRoot,'-maxdepth','2','-name','manifest.json'],{encoding:'utf8'}).trim().split('\n');
  assert.equal(archives.length,1);
  const result=resumeCancellation({root:f.root,branch:'feature',expectedHead:f.head,tasksPath:f.tasksPath,manifestPath:archives[0],loadEvidence:()=>({register:f.register,pulls:f.pulls,activity:f.activity})});
  assert.equal(result.status,'cancelled-local');assert.equal(existsSync(f.checkout),false);
  assert.ok(existsSync(result.localFiles[0].archive));
});

test('old detached comparison worktree is archived and removed without touching its source branch',t=>{
  const f=fixture(t),detached=join(f.base,'comparison');
  f.git('worktree','add','--detach',detached,f.head);
  writeFileSync(join(detached,'local-comparison'),'unfinished local note');
  const options={root:f.root,path:detached,expectedHead:f.head,activity:f.activity,now:Date.now()+13*3600000};
  assert.ok(planDetachedCancellation({...options,now:Date.now()}).blockers.includes('touched-within-cutoff'));
  assert.equal(planDetachedCancellation(options).eligible,true);
  const result=cancelDetached({...options,archiveRoot:join(f.base,'archives'),loadEvidence:()=>({activity:f.activity})});
  assert.equal(result.status,'cancelled-local');assert.equal(existsSync(detached),false);
  assert.equal(f.git('rev-parse','feature'),f.head);
  assert.ok(existsSync(result.localFiles.archive));
});

test('worktree snapshots run on the repository locked interpreter when it exists',t=>{
  const root=mkdtempSync(join(tmpdir(),'river-oaks-python-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  assert.equal(pythonFor(root),'python3','without uv sync it falls back to python3 on PATH');
  mkdirSync(join(root,'.venv/bin'),{recursive:true});writeFileSync(join(root,'.venv/bin/python'),'');
  assert.equal(pythonFor(root),join(root,'.venv/bin/python'),'never a PATH python3 older than the lock');
});

test('the --cancel-stale command reaches its plan instead of deadlocking on its own import',t=>{
  const base=mkdtempSync(join(tmpdir(),'river-cancel-cli-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const origin=join(base,'origin.git'),root=join(base,'repo');mkdirSync(root);
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','--bare','-b','main',origin);git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  writeFileSync(join(root,'file'),'base');git('add','.');git('commit','-m','base');git('remote','add','origin',origin);git('push','-q','origin','main');
  git('branch','feature');
  const cli=fileURLToPath(new URL('../project-prune.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[cli,'--cancel-stale','--branch','feature','--expected-head',git('rev-parse','feature')],{cwd:root,encoding:'utf8',timeout:30_000});
  // Past the fetch and the cancel module's import, the plan asks for GitHub evidence, which a local origin cannot give.
  assert.equal(result.status,2,result.stderr);
  assert.match(result.stderr,/^project-prune: GitHub evidence requires a github\.com origin$/m);
});
