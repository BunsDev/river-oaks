import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { classify, validateTasks, inspectGit, reconcile, isOrphanGap } from '../project-status.mjs';

const delivered = { primary:false, branch:'fix/done', head:'a'.repeat(40), dirty:false, locked:false, active:false, merging:false, ancestorMain:true };
test('delivery proof never overrides dirty, active, locked, default or merging state', () => {
  for (const flag of ['dirty','active','locked','primary','merging']) {
    assert.equal(classify({...delivered,[flag]:true},[]).disposition,'preserve');
  }
  assert.equal(classify({...delivered,branch:'main'},[]).disposition,'preserve');
});
test('missing GitHub evidence, open PRs and a stale squash head cannot authorize retirement', () => {
  assert.equal(classify(delivered,null).disposition,'preserve');
  assert.equal(classify(delivered,[{state:'open',head:{ref:'fix/done',sha:delivered.head}}]).disposition,'preserve');
  assert.equal(classify({...delivered,ancestorMain:false},[{state:'closed',merged_at:'now',head:{ref:'fix/done',sha:'b'.repeat(40)}}]).disposition,'preserve');
  assert.equal(classify(delivered,[]).disposition,'review-retirement');
});
test('closed unmerged PR and bare merged-head claim are not patch-equivalence proof', () => {
  const branch={...delivered,ancestorMain:false};
  assert.equal(classify(branch,[{state:'closed',head:{ref:branch.branch,sha:branch.head}}]).disposition,'preserve');
  assert.equal(classify(branch,[{state:'closed',merged_at:'now',head:{ref:branch.branch,sha:branch.head}}]).disposition,'preserve');
});
test('register rejects duplicate ownership and false delivered status without evidence', () => {
  const t={id:'one',title:'One',status:'queued',branches:['fix/a'],owner:null,updatedAt:'2026-10-11T00:00:00Z',nextAction:'Inspect'};
  assert.deepEqual(validateTasks({schemaVersion:1,tasks:[t]}),[]);
  assert.ok(validateTasks({schemaVersion:1,tasks:[t,{...t,id:'two'}]}).some(x=>x.includes('fix/a')));
  assert.ok(validateTasks({schemaVersion:1,tasks:[{...t,status:'delivered'}]}).some(x=>x.includes('evidence')));
});
test('reconciliation surfaces unknown branches and resurrected retired refs', () => {
  const task={id:'done',status:'retired',branches:['fix/done'],nextAction:'Restore if needed'};
  const r=reconcile({branches:[delivered,{...delivered,branch:'fix/new'}],worktrees:[]},{tasks:[task]},[]);
  assert.ok(r.gaps.some(x=>x.includes('fix/new')));
  assert.ok(r.gaps.some(x=>x.includes('retired')));
});
test('real Git inventory preserves nested branch names and sees tracked, untracked and ignored state', t => {
  const root=mkdtempSync(join(tmpdir(),'river-project-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  writeFileSync(join(root,'.gitignore'),'.runtime/\n');writeFileSync(join(root,'file'),'one');git('add','.');git('commit','-m','base');git('update-ref','refs/remotes/origin/main','HEAD');
  git('switch','-c','feature/nested/work');writeFileSync(join(root,'file'),'two');writeFileSync(join(root,'draft'),'untracked');mkdirSync(join(root,'.runtime'));writeFileSync(join(root,'.runtime','fixture'),'opaque');
  const r=inspectGit(root);const w=r.worktrees[0];assert.equal(w.branch,'feature/nested/work');assert.equal(w.dirty,true);assert.equal(w.status.length,2);assert.ok(w.ignored.includes('.runtime/'));assert.equal(r.branches.length,2);
  const report=reconcile(r,{tasks:[]},null);assert.ok(report.gaps.length>0);assert.equal(git('status','--porcelain').split('\n').filter(Boolean).length,2);
});

test('registered owners remain preserved even without a process CWD', () => {
  const task={id:'owned',status:'active',branches:[delivered.branch],owner:'other-session',leaseUntil:'2026-10-11T08:00:00Z'};
  const snapshot={branches:[delivered],worktrees:[]};
  for(const now of ['2026-10-11T06:00:00Z','2026-10-11T09:00:00Z']) {
    const r=reconcile(snapshot,{tasks:[task]},[],Date.parse(now));
    assert.equal(r.branches[0].disposition,'preserve');
    assert.equal(r.branches[0].reason,'registered-owner');
  }
});
test('discovered open PR head divergence is a gap without a recorded PR number', () => {
  const task={id:'pending',status:'blocked',branches:[delivered.branch]};
  const pr={number:8,state:'open',head:{ref:delivered.branch,sha:'b'.repeat(40)}};
  const r=reconcile({branches:[delivered],worktrees:[]},{tasks:[task]},[pr]);
  assert.ok(r.gaps.some(gap=>gap.includes('local and PR heads differ')));
  assert.equal(r.branches[0].disposition,'preserve');
});

test('delivered local branches remain a reconciliation gap until actually retired', () => {
  const task={id:'done',status:'delivered',branches:[delivered.branch],owner:null};
  const r=reconcile({branches:[delivered],worktrees:[]},{tasks:[task]},[]);
  assert.ok(r.gaps.some(gap=>gap.includes('Pending local retirement: done (fix/done)')));
  const removed=reconcile({branches:[],worktrees:[]},{tasks:[{...task,status:'retired'}]},[]);
  assert.deepEqual(removed.gaps,[]);
});

test('protected default and primary branches never become retirement debt', () => {
  for(const branch of ['main','master','trunk','primary-checkout']) {
    const task={id:'delivered-on-protected',status:'delivered',branches:[branch],owner:null};
    const snapshot={defaultBranch:'trunk',branches:[{...delivered,branch}],worktrees:branch==='primary-checkout'?[{branch,primary:true}]:[]};
    const r=reconcile(snapshot,{tasks:[task]},[]);
    assert.ok(!r.gaps.some(gap=>gap.includes('Pending local retirement')));
  }
});

test('register edits held in a stash are reported until merged back', t => {
  const root=mkdtempSync(join(tmpdir(),'river-project-stash-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  git('init','-q','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  mkdirSync(join(root,'docs','project-management'),{recursive:true});
  const file=join(root,'docs','project-management','tasks.json');
  writeFileSync(file,'{"schemaVersion":1,"tasks":[]}\n');writeFileSync(join(root,'other'),'one');git('add','.');git('commit','-q','-m','base');
  writeFileSync(join(root,'other'),'two');git('stash','push','-q','-m','unrelated');
  assert.deepEqual(inspectGit(root).stashedRegister,[]);
  writeFileSync(file,'{"schemaVersion":1,"tasks":[{"id":"live"}]}\n');git('stash','push','-q','-m','!!GitHub_Desktop<main>');
  const snapshot=inspectGit(root);
  assert.deepEqual(snapshot.stashedRegister.map(s=>s.ref),['stash@{0}']);
  assert.ok(reconcile(snapshot,{tasks:[]},null).gaps.some(g=>g.includes('stash@{0}')&&g.includes('GitHub_Desktop')));
});
test('a register with conflict markers is named as such instead of a JSON parse error', t => {
  const root=mkdtempSync(join(tmpdir(),'river-project-markers-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  mkdirSync(join(root,'docs','project-management'),{recursive:true});
  writeFileSync(join(root,'docs','project-management','tasks.json'),'{\n<<<<<<< Updated upstream\n  "tasks": []\n=======\n  "tasks": [1]\n>>>>>>> Stashed changes\n}\n');
  const run=spawnSync(process.execPath,[new URL('../project-status.mjs',import.meta.url).pathname,'--repo',root],{encoding:'utf8'});
  assert.equal(run.status,2);
  assert.match(run.stderr,/conflict markers/);
});

// Orphan debt: checkouts no task accounts for, and records that point at checkouts
// which are gone. --allow-orphans turns those, and only those, into warnings.
function orphanFixture(t) {
  const base=mkdtempSync(join(tmpdir(),'river-status-'));
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  const root=join(base,'repo');mkdirSync(root);
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  writeFileSync(join(root,'file'),'base');git('add','.');git('commit','-m','base');
  git('update-ref','refs/remotes/origin/main',git('rev-parse','main'));
  return {base,root,git};
}

test('an unregistered detached worktree and a missing recorded worktree are orphan gaps',t=>{
  const f=orphanFixture(t);
  const detached=join(f.base,'comparison');f.git('worktree','add','--detach',detached,'main');
  const owned=join(f.base,'owned');f.git('worktree','add','--detach',owned,'main');
  const now=new Date().toISOString();
  const register={schemaVersion:1,tasks:[
    {id:'primary',title:'p',status:'delivered',branches:['main'],owner:null,updatedAt:now,nextAction:'x',evidence:[{}]},
    {id:'compare',title:'c',status:'queued',branches:[],owner:null,worktree:owned,updatedAt:now,nextAction:'x'},
    {id:'ghost',title:'g',status:'blocked',branches:['ghost'],owner:null,worktree:join(f.base,'gone'),updatedAt:now,nextAction:'x'},
    {id:'history',title:'h',status:'retired',branches:['old'],retiredBranches:['old'],owner:null,worktree:join(f.base,'also-gone'),updatedAt:now,nextAction:'x',evidence:[{}],archive:{old:{manifest:'/m'}}},
  ]};
  const gaps=reconcile(inspectGit(f.root),register,null).gaps;
  // Git reports worktree paths resolved; the temp directory may be a symlink.
  assert.ok(gaps.some(g=>g.startsWith(`Unregistered worktree: ${realpathSync(detached)} (detached HEAD)`)),gaps.join('\n'));
  assert.ok(!gaps.some(g=>g.includes(owned)),'a detached checkout a task records is not an orphan');
  assert.ok(gaps.some(g=>g===`ghost: recorded worktree path is missing: ${join(f.base,'gone')}; fix the record or restore the checkout`),gaps.join('\n'));
  assert.ok(!gaps.some(g=>g.includes('also-gone')),'retired records may point at removed checkouts');
  const orphan=gaps.filter(isOrphanGap),other=gaps.filter(g=>!isOrphanGap(g));
  assert.equal(orphan.length,2);
  assert.ok(other.some(g=>g.startsWith('ghost: no local branch')),'non-orphan gaps still fail the check');
});

test('an unregistered branch is an orphan gap; expired leases and pending retirements are not',t=>{
  const f=orphanFixture(t);
  f.git('branch','stray');
  const register={schemaVersion:1,tasks:[{id:'primary',title:'p',status:'delivered',branches:['main'],owner:null,updatedAt:new Date().toISOString(),nextAction:'x',evidence:[{}]}]};
  const gaps=reconcile(inspectGit(f.root),register,null).gaps;
  assert.deepEqual(gaps.filter(isOrphanGap),['Unregistered branch: stray']);
  assert.equal(isOrphanGap('Expired ownership lease: x; do not take over without reconciliation'),false);
  assert.equal(isOrphanGap('Pending local retirement: x (b); run project:prune and reconcile blockers'),false);
});

test('records whose restoration archive is gone from disk are a gap',t=>{
  const f=orphanFixture(t);
  const kept=join(f.base,'kept-manifest.json');writeFileSync(kept,'{}');
  const now=new Date().toISOString(),task=(id,archive)=>({id,title:id,status:'retired',branches:[],owner:null,updatedAt:now,nextAction:'x',evidence:[{}],archive});
  const register={schemaVersion:1,tasks:[
    {id:'primary',title:'p',status:'delivered',branches:['main'],owner:null,updatedAt:now,nextAction:'x',evidence:[{}]},
    task('kept',{old:{manifest:kept}}),
    task('lost',{old:{manifest:join(f.base,'gone/manifest.json'),bundle:join(f.base,'gone/history.bundle')}}),
    task('lost-flat',{manifest:'~/river-oaks-test-no-such-archive/manifest.json'}),
    task('in-repo',{manifest:'docs/project-management/retirement.json',ref:'refs/tags/v1'}),
  ]};
  const gaps=reconcile(inspectGit(f.root),register,null).gaps.filter(g=>g.includes('restoration archive'));
  assert.deepEqual(gaps,['2 task(s) point at restoration archives missing from this machine (lost, lost-flat); run project:archives before any restore, retirement or cancellation decision'],gaps.join('\n'));
  assert.ok(!isOrphanGap(gaps[0]),'a missing archive fails the check even with --allow-orphans');
});
