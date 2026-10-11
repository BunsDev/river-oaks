import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { classify, validateTasks, inspectGit, reconcile } from '../project-status.mjs';

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
