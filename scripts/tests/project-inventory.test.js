// The inventory classifies every local branch and worktree from the same
// evidence project:prune reads. These fixtures build real repositories; nothing
// is removed, and GitHub is a canned list of pull requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildInventory, buildRemoteInventory } from '../project-inventory.mjs';
import { inspectGit } from '../project-status.mjs';

function fixture(t) {
  const base=mkdtempSync(join(tmpdir(),'river-inventory-'));
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  const root=join(base,'repo');mkdirSync(root);
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  git('remote','add','origin','git@github.com:acme/repo.git');
  writeFileSync(join(root,'file'),'base');writeFileSync(join(root,'.gitignore'),'.runtime/\n');git('add','.');git('commit','-m','base');
  const base0=git('rev-parse','main');
  // delivered: one commit, squash-merged into main, merged PR at the exact head.
  const delivered=join(base,'delivered');git('worktree','add','-b','delivered',delivered);
  writeFileSync(join(delivered,'file'),'delivered');git('-C',delivered,'commit','-am','delivered');
  const deliveredHead=git('rev-parse','delivered');git('merge','--squash','delivered');git('commit','-m','squash');
  const merge=git('rev-parse','main');
  git('update-ref','refs/remotes/origin/main',merge);git('update-ref','refs/remotes/origin/delivered',deliveredHead);
  git('branch','--set-upstream-to=origin/delivered','delivered');
  // orphan: a branch with no commits of its own and no register task.
  const orphan=join(base,'orphan');git('worktree','add','-b','orphan',orphan,'main');
  // detached: a comparison checkout nothing owns.
  const detached=join(base,'comparison');git('worktree','add','--detach',detached,base0);
  // active: owned work with its own commit and an open PR.
  const active=join(base,'active');git('worktree','add','-b','active',active,'main');
  writeFileSync(join(active,'file'),'active');git('-C',active,'commit','-am','active');const activeHead=git('rev-parse','active');
  git('update-ref','refs/remotes/origin/active',activeHead);git('update-ref','refs/remotes/origin/stale',base0);
  git('branch','--set-upstream-to=origin/active','active');
  const now=new Date().toISOString();
  const register={schemaVersion:1,tasks:[
    {id:'delivered-task',title:'d',status:'delivered',branches:['delivered'],owner:null,pr:1,updatedAt:now,nextAction:'x',evidence:[{merge}]},
    {id:'active-task',title:'a',status:'active',branches:['active'],owner:'someone',leaseUntil:new Date(Date.now()+3600e3).toISOString(),updatedAt:now,nextAction:'x'},
    {id:'ghost',title:'g',status:'blocked',branches:['ghost'],owner:null,worktree:join(base,'gone'),updatedAt:now,nextAction:'x'},
  ]};
  const pulls=[
    {number:1,state:'closed',merged_at:now,merge_commit_sha:merge,head:{ref:'delivered',sha:deliveredHead}},
    {number:2,state:'open',merged_at:null,merge_commit_sha:null,head:{ref:'active',sha:activeHead}},
  ];
  return {root,git,register,pulls,deliveredHead,merge,activity:{available:true,paths:[]},archives:{entries:[]}};
}

test('classifies delivered, active, orphan, zero-commit and detached checkouts',t=>{
  const f=fixture(t);
  const report=buildInventory({root:f.root,snapshot:inspectGit(f.root),register:f.register,pulls:f.pulls,activity:f.activity,archives:f.archives});
  const by=Object.fromEntries(report.rows.map(r=>[r.branch??'(detached)',r]));
  assert.equal(by.main.cls,'primary');
  assert.equal(by.delivered.cls,'retire-candidate','merged at the exact head; only the session release is missing');
  assert.deepEqual(by.delivered.blockers,['session-release-missing-or-stale']);
  assert.equal(by.delivered.pr.mergedExact,1);
  assert.equal(by.delivered.upstream.state,'in-sync');
  assert.equal(by.active.cls,'active','an owner outranks the open PR');
  assert.deepEqual(by.active.pr.open,[2]);
  assert.equal(by.active.upstream.state,'in-sync');
  assert.equal(by.orphan.cls,'orphan-no-task');
  assert.ok(by.orphan.flags.includes('zero-commit'));
  assert.ok(by.orphan.flags.includes('no-upstream'));
  assert.equal(by['(detached)'].cls,'detached');
  assert.ok(by['(detached)'].flags.includes('orphan-no-task'));
  assert.equal(report.counts.worktrees,5);
  assert.equal(report.counts.branches,4);
});

test('a released delivered branch becomes retire-eligible, and dirt or activity block it',t=>{
  const f=fixture(t);
  const task=f.register.tasks[0];
  task.retirement={head:f.deliveredHead,releasedAt:new Date().toISOString(),sessionsReviewedAt:new Date().toISOString()};
  const run=()=>buildInventory({root:f.root,snapshot:inspectGit(f.root),register:f.register,pulls:f.pulls,activity:f.activity,archives:f.archives}).rows.find(r=>r.branch==='delivered');
  assert.equal(run().cls,'retire-eligible');
  f.activity.paths=[join(f.root,'..','delivered')];
  assert.equal(run().cls,'blocked:active-process');
  f.activity.paths=[];
  writeFileSync(join(f.root,'..','delivered','note'),'unsaved');
  const dirty=run();
  assert.equal(dirty.cls,'blocked:dirty');assert.ok(dirty.flags.includes('dirty'));
});

test('an owner whose lease expired is still active, flagged, never a candidate',t=>{
  const f=fixture(t);
  f.register.tasks[1].leaseUntil=new Date(Date.now()-3600e3).toISOString();
  const row=buildInventory({root:f.root,snapshot:inspectGit(f.root),register:f.register,pulls:f.pulls,activity:f.activity,archives:f.archives}).rows.find(r=>r.branch==='active');
  assert.equal(row.cls,'active');assert.ok(row.flags.includes('lease-expired'));
});

test('without GitHub evidence nothing is eligible and every row says so',t=>{
  const f=fixture(t);
  const report=buildInventory({root:f.root,snapshot:inspectGit(f.root),register:f.register,pulls:null,activity:f.activity,archives:f.archives});
  assert.equal(report.githubChecked,false);
  assert.ok(report.rows.every(r=>r.flags.includes('github-not-checked')));
  assert.equal(report.rows.find(r=>r.branch==='delivered').cls,'blocked:session-release-missing-or-stale+github-unknown');
});

test('remote inventory names exact merged tips with unexecuted delete commands only',t=>{
  const f=fixture(t);
  const remote=buildRemoteInventory({root:f.root,pulls:f.pulls,snapshot:inspectGit(f.root)});
  const by=Object.fromEntries(remote.rows.map(r=>[r.branch,r]));
  assert.equal(remote.slug,'acme/repo');
  assert.equal(by.delivered.cls,'merged-exact');
  assert.equal(by.delivered.deleteCommand,'gh api -X DELETE repos/acme/repo/git/refs/heads/delivered');
  assert.equal(by.delivered.localBranch,'delivered');
  assert.equal(by.active.cls,'open-pr');
  assert.equal(by.stale.cls,'merged-ancestor-review','an ancestor of main with no PR at that tip still needs a human');
  assert.equal(by.main,undefined,'the default branch is never listed');
  assert.deepEqual(remote.deleteCommands,[by.delivered.deleteCommand]);
  // A merged PR whose merge commit is not on the default branch is not a delete candidate.
  f.pulls[0].merge_commit_sha='0'.repeat(40);
  assert.equal(buildRemoteInventory({root:f.root,pulls:f.pulls,snapshot:inspectGit(f.root)}).rows.find(r=>r.branch==='delivered').cls,'merged-pr-not-on-default');
  assert.equal(buildRemoteInventory({root:f.root,pulls:null,snapshot:inspectGit(f.root)}).deleteCommands.length,0);
});
