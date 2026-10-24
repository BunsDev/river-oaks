import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { archiveTip, planRetirement, restoreTest, retire } from '../project-prune.mjs';

function fixture(t) {
  const base=mkdtempSync(join(tmpdir(),'river-prune-'));
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  const root=join(base,'repo'), checkout=join(base,'feature'); mkdirSync(root);
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  writeFileSync(join(root,'file'),'base');writeFileSync(join(root,'.gitignore'),'.runtime/\n');git('add','.');git('commit','-m','base');
  git('worktree','add','-b','feature',checkout);
  writeFileSync(join(checkout,'file'),'delivered');git('-C',checkout,'commit','-am','feature');
  const head=git('rev-parse','feature');git('merge','--squash','feature');git('commit','-m','squash');
  const merge=git('rev-parse','main');git('update-ref','refs/remotes/origin/main',merge);
  const task={id:'fixture',status:'delivered',owner:null,branches:['feature'],pr:1,evidence:[{reviewedHead:head,merge}],retirement:{head,sessionsReviewedAt:new Date().toISOString(),releasedAt:new Date().toISOString()}};
  const pulls=[{number:1,state:'closed',merged_at:new Date().toISOString(),merge_commit_sha:merge,head:{ref:'feature',sha:head}}];
  const register={schemaVersion:1,tasks:[task]};const tasksPath=join(root,'tasks.json');
  const save=()=>writeFileSync(tasksPath,JSON.stringify(register)); save();
  return {root,checkout,git,head,merge,task,pulls,register,tasksPath,save,archiveRoot:join(base,'archives'),activity:{available:true,paths:[]}};
}
const options=f=>({...f,branch:'feature',expectedHead:f.head});
test('dry-run accepts fully proved squash delivery without changing refs or worktrees',t=>{
 const f=fixture(t);const p=planRetirement(options(f));assert.deepEqual(p.blockers,[]);assert.equal(f.git('rev-parse','feature'),f.head);assert.ok(existsSync(f.checkout));
});
test('fails closed for ownership, activity, ignored evidence, dirty files, locks and unknown remote',t=>{
 const f=fixture(t);const run=()=>planRetirement(options(f)).blockers;
 f.task.owner='session';assert.ok(run().includes('ownership-not-released'));f.task.owner=null;
 f.task.retirement.head='0'.repeat(40);assert.ok(run().includes('session-release-missing-or-stale'));f.task.retirement.head=f.head;
 f.activity.available=false;assert.ok(run().includes('activity-unknown'));f.activity.available=true;
 f.activity.paths=[join(f.checkout,'nested')];assert.ok(run().includes('active-process'));f.activity.paths=[];
 mkdirSync(join(f.checkout,'.runtime'));writeFileSync(join(f.checkout,'.runtime','receipt'),'preserve');assert.ok(run().includes('ignored-data'));rmSync(join(f.checkout,'.runtime'),{recursive:true});
 writeFileSync(join(f.checkout,'draft'),'preserve');assert.ok(run().includes('dirty'));rmSync(join(f.checkout,'draft'));
 f.git('worktree','lock',f.checkout);assert.ok(run().includes('locked'));f.git('worktree','unlock',f.checkout);
 f.pulls=null;assert.ok(run().includes('github-unknown'));
});
test('rejects wrong head, default branch, open PR and extra undelivered work',t=>{
 const f=fixture(t);assert.ok(planRetirement({...options(f),expectedHead:'0'.repeat(40)}).blockers.includes('head-changed'));
 assert.ok(planRetirement({...options(f),branch:'main'}).blockers.includes('protected-branch'));
 f.pulls.push({state:'open',head:{ref:'feature',sha:f.head}});assert.ok(planRetirement(options(f)).blockers.includes('open-pr'));f.pulls.pop();
 writeFileSync(join(f.checkout,'file'),'extra');f.git('-C',f.checkout,'commit','-am','extra');assert.ok(planRetirement(options(f)).blockers.includes('head-changed'));
});
test('apply restore-tests exact-tip bundle, removes only selected ref and records restoration',t=>{
 const f=fixture(t);f.archiveRoot=join(f.archiveRoot,"space ' and $(false)");const result=retire({...options(f),loadEvidence:()=>({register:f.register,pulls:f.pulls,activity:f.activity})});
 assert.equal(existsSync(f.checkout),false);assert.throws(()=>f.git('rev-parse','--verify','refs/heads/feature'));
 const saved=JSON.parse(readFileSync(f.tasksPath));assert.equal(saved.tasks[0].status,'retired');
 assert.ok(existsSync(result.bundle));assert.equal(f.git('rev-parse',result.tag),f.head);
 // The bundle carries only the squashed branch's own commit and builds on the default branch.
 assert.deepEqual(result.prerequisites,[f.git('rev-parse',`${f.head}^`)]);assert.deepEqual(result.base,{ref:'refs/remotes/origin/main',head:f.merge});
 const restored=join(f.archiveRoot,'recovery');f.git('init','--bare',restored);
 assert.throws(()=>f.git('-C',restored,'fetch',result.bundle,`${result.tag}:refs/heads/recovered`),/prerequisite/);
 f.git('-C',restored,'fetch',f.root,'refs/remotes/origin/main:refs/heads/main');
 f.git('-C',restored,'fetch',result.bundle,`${result.tag}:refs/heads/recovered`);assert.equal(f.git('-C',restored,'rev-parse','recovered'),f.head);
 execFileSync('sh',['-c',result.restoreCommand],{cwd:restored,stdio:'pipe'});assert.equal(f.git('-C',restored,'rev-parse','recovered'),f.head);
});
test('an unrelated missing registered worktree does not prevent verified retirement',t=>{
 const f=fixture(t),missing=join(f.root,'..','scratch','missing');
 f.git('worktree','add','-b','unrelated',missing);const unrelated=f.git('rev-parse','unrelated');
 rmSync(join(f.root,'..','scratch'),{recursive:true});
 const result=retire({...options(f),loadEvidence:()=>({register:f.register,pulls:f.pulls,activity:f.activity})});
 assert.equal(result.status,'retired');assert.equal(existsSync(f.checkout),false);
 assert.equal(f.git('rev-parse','unrelated'),unrelated);
 assert.ok(f.git('worktree','list','--porcelain').includes(missing),'unrelated registration is preserved');
});
test('archives inside a missing registered worktree remain forbidden',t=>{
 const f=fixture(t),missing=join(f.root,'..','scratch','missing');
 f.git('worktree','add','-b','unrelated',missing);rmSync(join(f.root,'..','scratch'),{recursive:true});
 f.archiveRoot=join(missing,'recovery');
 assert.throws(()=>retire({...options(f),loadEvidence:()=>({register:f.register,pulls:f.pulls,activity:f.activity})}),/outside all worktrees/);
 assert.equal(existsSync(f.checkout),true);assert.equal(f.git('rev-parse','feature'),f.head);
});
test('a tip already on the default branch archives only its own commit',t=>{
 const f=fixture(t);f.git('merge','--no-ff','-m','merge feature','feature');f.git('update-ref','refs/remotes/origin/main',f.git('rev-parse','main'));
 const directory=join(f.archiveRoot,'merged');mkdirSync(directory,{recursive:true});
 const tag='refs/tags/archive/worktree-prune/merged';f.git('update-ref',tag,f.head);
 const restore=join(directory,'restore.git');
 const result=archiveTip({root:f.root,tag,expectedHead:f.head,bundle:join(directory,'history.bundle'),restore});
 assert.deepEqual(result.prerequisites,[f.git('rev-parse',`${f.head}^`)]);
 assert.equal(f.git('-C',restore,'rev-parse',tag),f.head);
 // The tip's commit, its tree and its one changed file; everything else comes through alternates.
 const counts=Object.fromEntries(f.git('-C',restore,'count-objects','-v').split('\n').map(line=>line.split(': ')));
 assert.equal(Number(counts.count)+Number(counts['in-pack']),3);
 assert.equal(readFileSync(join(restore,'objects','info','alternates'),'utf8').trim(),realpathSync(join(f.root,'.git','objects')));
});
test('the restore test reads the bundle pack even when alternates already reach the tip',t=>{
 const f=fixture(t),base=f.git('rev-parse',`${f.head}^`);
 const directory=join(f.archiveRoot,'corrupt');mkdirSync(directory,{recursive:true});
 const tag='refs/tags/archive/worktree-prune/corrupt';f.git('update-ref',tag,f.head);
 const bundle=join(directory,'history.bundle');f.git('bundle','create',bundle,tag,`^${base}`);
 const data=readFileSync(bundle);data[data.indexOf('\n\n')+2+40]^=0xff;writeFileSync(bundle,data);
 assert.throws(()=>restoreTest({root:f.root,tag,expectedHead:f.head,bundle,restore:join(directory,'restore.git')}),/bundle failed/);
});
test('without a default-branch ref the bundle stays self-contained',t=>{
 const f=fixture(t);f.git('update-ref','-d','refs/remotes/origin/main');
 const directory=join(f.archiveRoot,'standalone');mkdirSync(directory,{recursive:true});
 const tag='refs/tags/archive/worktree-prune/standalone';f.git('update-ref',tag,f.head);
 const bundle=join(directory,'history.bundle'),restore=join(directory,'restore.git');
 const result=archiveTip({root:f.root,tag,expectedHead:f.head,bundle,restore});
 assert.deepEqual(result.prerequisites,[]);assert.equal(result.base,undefined);
 assert.equal(existsSync(join(restore,'objects','info','alternates')),false);
 const fresh=join(f.archiveRoot,'fresh');f.git('init','--bare',fresh);f.git('-C',fresh,'fetch',bundle,`${tag}:refs/heads/recovered`);
 assert.equal(f.git('-C',fresh,'rev-parse','recovered'),f.head);
});
test('changed ownership after archive prevents removal',t=>{
 const f=fixture(t);let calls=0;
 assert.throws(()=>retire({...options(f),loadEvidence:()=>{calls++;if(calls===2) f.task.owner='resumed';return {register:f.register,pulls:f.pulls,activity:f.activity};}}),/ownership-not-released/);
 assert.ok(existsSync(f.checkout));assert.equal(f.git('rev-parse','feature'),f.head);
});

test('installed reference hook blocks direct branch deletion but permits verified retirement',t=>{
 const f=fixture(t);
 const hooks=join(f.root,'hooks');mkdirSync(hooks);
 const modulePath=new URL('../project-ref-guard.mjs',import.meta.url).pathname;
 writeFileSync(join(hooks,'reference-transaction'),`#!/bin/sh\nexec node '${modulePath.replaceAll("'","'\\''")}' "$@"\n`,{mode:0o755});
 f.git('config','core.hooksPath',hooks);
 assert.throws(()=>f.git('branch','-D','feature'));
 // A branch without a worktree proves the rejection is from the hook, not Git's checkout guard.
 f.git('branch','spare');assert.throws(()=>f.git('update-ref','-d','refs/heads/spare',f.git('rev-parse','spare')));
 const result=retire({...options(f),loadEvidence:()=>({register:f.register,pulls:f.pulls,activity:f.activity})});
 assert.equal(result.status,'retired');assert.equal(f.git('rev-parse','spare'),f.merge);
 assert.throws(()=>f.git('update-ref','-d',result.tag,f.head));
});

test('a checkout switching branches during final recheck is preserved',t=>{
 const f=fixture(t);let calls=0;
 assert.throws(()=>retire({...options(f),loadEvidence:()=>{
   if(++calls===3)f.git('-C',f.checkout,'switch','-c','other-task');
   return {register:f.register,pulls:f.pulls,activity:f.activity};
 }}),/registrations changed/);
 assert.ok(existsSync(f.checkout));assert.equal(f.git('-C',f.checkout,'branch','--show-current'),'other-task');
 assert.equal(f.git('rev-parse','feature'),f.head);
});

test('new checkout appearing before ref deletion is preserved',t=>{
 const f=fixture(t);f.git('worktree','remove',f.checkout);let calls=0;
 assert.throws(()=>retire({...options(f),loadEvidence:()=>{
   if(++calls===3)f.git('worktree','add',f.checkout,'feature');
   return {register:f.register,pulls:f.pulls,activity:f.activity};
 }}),/registrations changed|still checked out/);
 assert.ok(existsSync(f.checkout));assert.equal(f.git('rev-parse','feature'),f.head);
});

test('hidden tracked edits under skip-worktree and assume-unchanged are preserved',t=>{
 const f=fixture(t);
 for(const flag of ['skip-worktree','assume-unchanged']) {
   f.git('-C',f.checkout,'update-index',`--${flag}`,'file');writeFileSync(join(f.checkout,'file'),'uncommitted hidden work');
   assert.ok(planRetirement(options(f)).blockers.includes('index-flags-require-review'));
   assert.throws(()=>retire({...options(f),loadEvidence:()=>({register:f.register,pulls:f.pulls,activity:f.activity})}),/index-flags/);
   assert.equal(readFileSync(join(f.checkout,'file'),'utf8'),'uncommitted hidden work');
   writeFileSync(join(f.checkout,'file'),'delivered');f.git('-C',f.checkout,'update-index',`--no-${flag}`,'file');
 }
});

test('hook installation is shared across checkouts and preserves custom hooks',t=>{
 const f=fixture(t);const installer=new URL('../install-project-hooks.mjs',import.meta.url).pathname;
 execFileSync(process.execPath,[installer],{cwd:f.root,stdio:'pipe'});
 const installed=f.git('config','core.hooksPath');assert.ok(installed.includes('river-oaks-hooks'));
 f.git('branch','spare');assert.throws(()=>f.git('-C',f.checkout,'update-ref','-d','refs/heads/spare',f.merge));
 execFileSync(process.execPath,[installer],{cwd:f.checkout,stdio:'pipe'});assert.equal(f.git('config','core.hooksPath'),installed);
 f.git('config','core.hooksPath','custom-hooks');assert.throws(()=>execFileSync(process.execPath,[installer],{cwd:f.root,stdio:'pipe'}));assert.equal(f.git('config','core.hooksPath'),'custom-hooks');
});

test('missing or expired deletion permits fail closed',t=>{
 const f=fixture(t);const installer=new URL('../install-project-hooks.mjs',import.meta.url).pathname;
 execFileSync(process.execPath,[installer],{cwd:f.root,stdio:'pipe'});f.git('branch','spare');
 const lock=join(f.root,'.git','river-oaks-retirement.lock');mkdirSync(lock);
 for(const expiresAt of [undefined,null,Date.now()-1,Date.now()+120_000]) {
   writeFileSync(join(lock,'permit.json'),JSON.stringify({branch:'spare',head:f.merge,expiresAt}));
   assert.throws(()=>f.git('update-ref','-d','refs/heads/spare',f.merge));
   assert.equal(f.git('rev-parse','spare'),f.merge);
 }
});

test('shared guard permits verified deletion of a packed branch from a linked checkout',t=>{
 const f=fixture(t);f.git('pack-refs','--all');
 const runner=join(f.root,'..','runner');f.git('worktree','add','-b','maintenance',runner);
 const installer=new URL('../install-project-hooks.mjs',import.meta.url).pathname;
 execFileSync(process.execPath,[installer],{cwd:runner,stdio:'pipe'});
 const lock=join(f.root,'.git','river-oaks-retirement.lock');mkdirSync(lock);
 writeFileSync(join(lock,'permit.json'),JSON.stringify({branch:'feature',head:f.merge,expiresAt:Date.now()+60_000}));
 assert.throws(()=>f.git('update-ref','-d','refs/heads/feature',f.head));assert.equal(f.git('rev-parse','feature'),f.head);
 rmSync(lock,{recursive:true});
 execFileSync('/bin/sh',[join(f.git('config','core.hooksPath'),'reference-transaction'),'aborted'],{cwd:runner,env:{...process.env,PATH:'/usr/bin:/bin'},stdio:'pipe'});

 const result=retire({...options(f),root:runner,loadEvidence:()=>({register:f.register,pulls:f.pulls,activity:f.activity})});
 assert.equal(result.status,'retired');assert.equal(f.git('-C',runner,'branch','--show-current'),'maintenance');
});

test('packing refs preserves all logical refs without allowing actual deletion',t=>{
 const f=fixture(t);f.git('tag','archive/fixture',f.head);
 const installer=new URL('../install-project-hooks.mjs',import.meta.url).pathname;
 execFileSync(process.execPath,[installer],{cwd:f.root,stdio:'pipe'});
 const before=f.git('show-ref');f.git('pack-refs','--all');assert.equal(f.git('show-ref'),before);
 // An identical loose and packed ref must still require a permit for real deletion.
 mkdirSync(join(f.root,'.git','refs','heads'),{recursive:true});
 writeFileSync(join(f.root,'.git','refs','heads','feature'),f.head+'\n');
 assert.throws(()=>f.git('update-ref','-d','refs/heads/feature',f.head));
 assert.throws(()=>f.git('update-ref','-d','refs/tags/archive/fixture',f.head));
 assert.equal(f.git('show-ref'),before);
});

test('an exact-tip source alias can retire while the task retains its other branch',t=>{
 const f=fixture(t);f.git('branch','source-alias',f.head);f.task.branches.push('source-alias');f.save();
 const result=retire({...options(f),branch:'source-alias',loadEvidence:()=>({register:f.register,pulls:f.pulls,activity:f.activity})});
 assert.equal(result.status,'retired');assert.equal(f.git('rev-parse','feature'),f.head);assert.ok(existsSync(f.checkout));
 const task=JSON.parse(readFileSync(f.tasksPath)).tasks[0];assert.equal(task.status,'delivered');assert.deepEqual(task.retiredBranches,['source-alias']);
 f.git('branch','source-alias',f.head);
 assert.ok(planRetirement({...options(f),branch:'source-alias',register:{tasks:[task]}}).blockers.includes('previously-retired-ref-reappeared'));
});
