#!/usr/bin/env node
// Local-only retirement. Unknown evidence is a blocker, never deletion permission.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmdirSync, unlinkSync, renameSync, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadPulls, validateTasks } from './project-status.mjs';
import { ensureLiveRegister, withRegisterLock } from './task-register.mjs';
// Static: project-prune-cancel.mjs imports archiveTip back from here, and a dynamic
// import of it from this module's top-level await deadlocks (Node exits 13).
import * as cancel from './project-prune-cancel.mjs';

export function git(root,args,optional=false) {
  try { return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_TERMINAL_PROMPT:'0'}}).trimEnd(); }
  catch(error) { if(optional)return null;throw new Error(`git ${args[0]} failed (${error.status??'unavailable'})`,{cause:error}); }
}
const shellQuote=value=>"'"+value.replaceAll("'","'\\''")+"'";
export const canonical=path=>existsSync(path)?realpathSync(path):join(canonical(dirname(resolve(path))),basename(path));
export const within=(path,parent)=>{const r=relative(canonical(parent),canonical(path));return !r||(!r.startsWith('..'+ '/')&&r!=='..'&&!isAbsolute(r));};
export function worktrees(root) {
  return git(root,['worktree','list','--porcelain','-z']).split('\0\0').filter(Boolean).map((block,index)=>{
    const fields=Object.fromEntries(block.split('\0').filter(Boolean).map(line=>{const i=line.indexOf(' ');return i<0?[line,true]:[line.slice(0,i),line.slice(i+1)];}));
    return {path:fields.worktree,head:fields.HEAD,branch:fields.branch?.replace(/^refs\/heads\//,''),locked:Boolean(fields.locked),primary:index===0};
  });
}
export function readActivity() {
  try {
    const output=execFileSync('lsof',['-nP','-a','-d','cwd','-Fn'],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
    return {available:true,paths:output.split('\n').filter(x=>x.startsWith('n')).map(x=>x.slice(1))};
  } catch { return {available:false,paths:[]}; }
}
export const defaultBranchRef=root=>git(root,['symbolic-ref','--quiet','refs/remotes/origin/HEAD'],true)??'refs/remotes/origin/main';
export const fresh=(date,now=Date.now())=>Number.isFinite(Date.parse(date))&&now-Date.parse(date)>=0&&now-Date.parse(date)<2*60*60*1000;

// Checks shared by retirement and cancellation: the checkout itself must hold nothing
// that removal would lose, and nothing may be running inside it.
export function worktreeBlockers(w,activity) {
  const blockers=[];const block=reason=>blockers.push(reason);
  if(w.locked)block('locked');
  if(!existsSync(w.path)){block('missing-worktree');return blockers;}
  if(git(w.path,['-c','core.fsmonitor=false','status','--porcelain=v1','-z','--untracked-files=all','--ignore-submodules=none']))block('dirty');
  if(git(w.path,['ls-files','--others','--ignored','--exclude-standard','--directory','-z']))block('ignored-data');
  if(git(w.path,['ls-files','-v','-z']).split('\0').some(line=>/^[a-zS] /.test(line)))block('index-flags-require-review');
  if(git(w.path,['ls-files','--stage']).split('\n').some(line=>line.startsWith('160000 ')))block('submodules-require-review');
  for(const name of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','BISECT_START']){
    const path=git(w.path,['rev-parse','--git-path',name]);if(existsSync(resolve(w.path,path)))block('operation-in-progress');
  }
  if(activity?.paths?.some(p=>within(p,w.path)))block('active-process');
  return blockers;
}

export function planRetirement({root,branch,expectedHead,register,pulls,activity,now=Date.now()}) {
  const blockers=[];const block=reason=>blockers.push(reason);
  if(!branch||git(root,['check-ref-format',`refs/heads/${branch}`],true)===null)throw new Error('Invalid branch');
  if(!/^[a-f0-9]{40,64}$/.test(expectedHead??''))throw new Error('A full expected head is required');
  const head=git(root,['rev-parse','--verify',`refs/heads/${branch}`],true);
  if(head!==expectedHead)block('head-changed');
  const trees=worktrees(root),owned=trees.filter(w=>w.branch===branch);
  const defaultRef=defaultBranchRef(root);
  if(['main','master',defaultRef.replace('refs/remotes/origin/','')].includes(branch)||owned.some(w=>w.primary))block('protected-branch');
  const tasks=register?.tasks?.filter(t=>t.branches?.includes(branch))??[];const task=tasks[0];
  if(tasks.length!==1||task.status!=='delivered'||task.owner||task.leaseUntil)block('ownership-not-released');
  if(task?.retiredBranches?.includes(branch))block('previously-retired-ref-reappeared');
  const release=task?.retirement;
  if(release?.head!==head||!fresh(release?.sessionsReviewedAt,now)||!fresh(release?.releasedAt,now))block('session-release-missing-or-stale');
  if(!activity?.available)block('activity-unknown');
  for(const w of owned)for(const reason of worktreeBlockers(w,activity))block(reason);
  if(!Array.isArray(pulls))block('github-unknown');
  else {
    if(pulls.some(p=>p.state==='open'&&p.head?.ref===branch))block('open-pr');
    const pr=pulls.find(p=>p.number===task?.pr);
    if(!pr?.merged_at||pr.head?.sha!==head||!pr.merge_commit_sha)block('exact-merged-pr-required');
    else {
      const merge=pr.merge_commit_sha;
      if(git(root,['merge-base','--is-ancestor',merge,defaultRef],true)===null)block('merge-not-on-default');
      const tree=git(root,['rev-parse',`${merge}^{tree}`],true);
      if(!tree||git(root,['rev-parse',`${head}^{tree}`],true)!==tree)block('aggregate-tree-review-required');
    }
  }
  return {branch,head,taskId:task?.id??null,worktrees:owned.map(w=>w.path),blockers:[...new Set(blockers)],eligible:blockers.length===0};
}

// Bundle an exact tip under `tag` and restore-test it into `restore`. The bundle
// holds only what origin's default branch lacks; a tip already on that branch
// bundles just its own commit. Its prerequisites are commits on that branch, so any
// clone holding the branch restores it. restore.git borrows them from the common
// object store through alternates rather than copying the whole history again.
// Without a default-branch ref the bundle stays self-contained, as before.
export function archiveTip({root,tag,expectedHead,bundle,restore}) {
  const ref=defaultBranchRef(root),base=git(root,['rev-parse','--verify','--quiet',`${ref}^{commit}`],true);
  const onBase=base&&git(root,['merge-base','--is-ancestor',expectedHead,base],true)!==null;
  const exclude=!base?[]:onBase?git(root,['rev-parse',`${expectedHead}^@`]).split('\n').filter(Boolean):[base];
  git(root,['bundle','create',bundle,tag,...exclude.map(sha=>`^${sha}`)]);
  const data=readFileSync(bundle),prerequisites=restoreTest({root,tag,expectedHead,bundle,restore});
  return {sha256:createHash('sha256').update(data).digest('hex'),prerequisites,...(base?{base:{ref,head:base}}:{})};
}

// Restore a bundle into a new bare repository and return its prerequisites.
export function restoreTest({root,tag,expectedHead,bundle,restore}) {
  const data=readFileSync(bundle),header=data.subarray(0,data.indexOf('\n\n')).toString('utf8').split('\n');
  const prerequisites=header.filter(line=>line.startsWith('-')).map(line=>line.slice(1).split(' ')[0]);
  git(root,['init','--bare',restore]);
  if(prerequisites.length)writeFileSync(join(restore,'objects','info','alternates'),realpathSync(resolve(root,git(root,['rev-parse','--git-common-dir']),'objects'))+'\n');
  // Unbundle rather than fetch: a fetch skips reading the pack once alternates already
  // reach the tip, so it would accept a corrupt bundle.
  if(git(restore,['bundle','unbundle',bundle])!==`${expectedHead} ${tag}`)throw new Error('Archive restoration SHA mismatch');
  git(restore,['update-ref',tag,expectedHead]);
  git(restore,['fsck','--full']);
  return prerequisites;
}

// Archive an exact tip, restore-test the archive, then remove the checkouts and
// (optionally) the local ref. `check` re-plans from live evidence and must throw
// when the plan is no longer eligible; it runs again before every mutation.
// `onRemoved` runs inside the shared lock after the postconditions pass.
export function archiveAndRemove({root,branch,expectedHead,archiveRoot,prefix='retirement-',check,removeBranch=true,details={},onRemoved}) {
  const common=resolve(root,git(root,['rev-parse','--git-common-dir']));
  const lock=join(common,'river-oaks-retirement.lock');
  mkdirSync(lock); // Shared across worktrees; never steal a stale lock automatically.
  try {
    let plan=check();
    mkdirSync(archiveRoot,{recursive:true,mode:0o700});
    const archiveBase=realpathSync(archiveRoot);
    // within canonicalizes existing parents even for a missing registration.
    if(worktrees(root).some(w=>within(archiveBase,w.path)))throw new Error('Archive must be outside all worktrees');
    const directory=mkdtempSync(join(archiveBase,prefix));
    const tag=`refs/tags/archive/worktree-prune/${randomUUID()}`;
    const bundle=join(directory,'history.bundle'),restore=join(directory,'restore.git');
    const receipt={branch:branch??null,head:expectedHead,tag,bundle,worktrees:plan.worktrees,...details,status:'archiving',createdAt:new Date().toISOString()};
    const manifest=join(directory,'manifest.json');
    const record=()=>writeFileSync(manifest,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});record();
    git(root,['update-ref',tag,expectedHead,'0'.repeat(expectedHead.length)]);
    Object.assign(receipt,archiveTip({root,tag,expectedHead,bundle,restore}));receipt.status='restore-verified';record();
    const initialPaths=JSON.stringify(plan.worktrees);
    plan=check();
    if(JSON.stringify(plan.worktrees)!==initialPaths)throw new Error('Worktree registrations changed');
    const remaining=[...plan.worktrees];
    const recheck=()=>{const next=check();if(JSON.stringify(next.worktrees)!==JSON.stringify(remaining))throw new Error('Worktree registrations changed');};
    for(const path of plan.worktrees) {
      recheck();git(root,['worktree','remove',path]);
      remaining.shift();
      receipt.removedWorktrees=[...(receipt.removedWorktrees??[]),path];record();
    }
    recheck();
    if(removeBranch) {
      if(worktrees(root).some(w=>w.branch===branch))throw new Error('Branch still checked out');
      const permit=join(lock,'permit.json');
      writeFileSync(permit,JSON.stringify({branch,head:expectedHead,expiresAt:Date.now()+60_000}),{mode:0o600});
      try {git(root,['update-ref','-d',`refs/heads/${branch}`,expectedHead]);} finally {unlinkSync(permit);}
      if(git(root,['rev-parse','--verify',`refs/heads/${branch}`],true)!==null)throw new Error('Branch removal postcondition failed');
    }
    receipt.status=removeBranch?'retired':'cancelled';receipt.restoreCommand=`git fetch ${shellQuote(bundle)} ${tag}:refs/heads/recovered`;record();
    const result={...receipt,manifest,taskId:plan.taskId??null};
    onRemoved?.(result,plan);
    return result;
  } finally {rmdirSync(lock);}
}

// Re-read the live register and apply one targeted change under the same
// "nothing changed meanwhile" rule the retirement used for its evidence.
export function updateRegister(tasksPath,mutate,manifest) {
  // The same lock as `pnpm run register`, so a CLI change cannot land between read and rename.
  withRegisterLock(`${tasksPath}.lock`,()=>{
    const before=readFileSync(tasksPath,'utf8'),register=JSON.parse(before);
    mutate(register);
    const temp=`${tasksPath}.${randomUUID()}.tmp`;writeFileSync(temp,JSON.stringify(register,null,2)+'\n');
    if(readFileSync(tasksPath,'utf8')!==before){unlinkSync(temp);throw new Error(`Task register changed; reconcile using ${manifest}`);}
    renameSync(temp,tasksPath);
  });
}

export function retire(options) {
  const {root,branch,expectedHead,tasksPath,archiveRoot,loadEvidence}=options;
  const check=()=>{const p=planRetirement({...options,...loadEvidence()});if(!p.eligible)throw new Error(p.blockers.join(', '));return p;};
  return archiveAndRemove({root,branch,expectedHead,archiveRoot,check,removeBranch:true,onRemoved:(receipt,plan)=>{
    updateRegister(tasksPath,register=>{
      const task=register.tasks.find(t=>t.id===plan.taskId);
      if(!task||task.owner||task.status!=='delivered')throw new Error(`Retired; task changed, reconcile using ${receipt.manifest}`);
      task.retiredBranches=[...new Set([...(task.retiredBranches??[]),branch])];
      task.archive={...(task.archive??{}),[branch]:{manifest:receipt.manifest,bundle:receipt.bundle,sha256:receipt.sha256,tag:receipt.tag,head:expectedHead}};
      if(task.branches.every(b=>task.retiredBranches.includes(b)))task.status='retired';
      task.updatedAt=new Date().toISOString();task.nextAction='Preserve restoration archives; reconcile any remaining branches.';
    },receipt.manifest);
  }});
}

const USAGE='Usage: project:prune --branch <name> --expected-head <sha> [--apply] [--archive-root <external directory>] [--cancel-stale [--stale-hours <hours>] [--detached-path <path>] [--resume-manifest <manifest.json>]]';
export function parseRetirementArgs(args) {
  const values={};let apply=false,cancelStale=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--apply'){apply=true;continue;}
    if(args[i]==='--cancel-stale'){cancelStale=true;continue;}
    if(!['--branch','--detached-path','--expected-head','--archive-root','--resume-manifest','--stale-hours'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error(USAGE);
    values[args[i]]=args[++i];
  }
  if(values['--stale-hours']&&!cancelStale)throw new Error('--stale-hours requires --cancel-stale');
  const staleHours=values['--stale-hours']===undefined?12:Number(values['--stale-hours']);
  if(!Number.isFinite(staleHours)||staleHours<=0||!/^\d+(?:\.\d+)?$/.test(values['--stale-hours']??'12'))throw new Error('--stale-hours must be a positive number');
  if(values['--resume-manifest']&&(!cancelStale||!apply))throw new Error('Resume requires --cancel-stale --apply');
  if(values['--detached-path']&&(!cancelStale||values['--branch']||values['--resume-manifest']))throw new Error('Detached path requires --cancel-stale without --branch');
  return {values,apply,cancelStale,staleHours};
}

// The live register in the common Git directory, shared by every worktree (see
// task-register.mjs); any legacy edit to the primary's tracked copy is absorbed first.
export function primaryRegisterPath(root) {
  return ensureLiveRegister(root);
}

export function liveEvidence(root,tasksPath) {
  return ()=>{
    const register=JSON.parse(readFileSync(tasksPath,'utf8'));const errors=validateTasks(register);if(errors.length)throw new Error(errors.join('\n'));
    return {register,pulls:loadPulls(root),activity:readActivity()};
  };
}

export const defaultArchiveRoot=()=>join(homedir(),'worktree-backups','river-oaks');

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const {values,apply,cancelStale,staleHours}=parseRetirementArgs(process.argv.slice(2));
    const root=process.cwd(),tasksPath=primaryRegisterPath(root);
    git(root,['fetch','--no-prune','origin']);
    const loadEvidence=liveEvidence(root,tasksPath);
    const options={root,branch:values['--branch'],expectedHead:values['--expected-head'],tasksPath,staleHours,archiveRoot:resolve(values['--archive-root']??defaultArchiveRoot()),loadEvidence};
    let report;
    if(cancelStale){
      // Explicitly authorized cancellation of untouched local work; see project-prune-cancel.mjs.
      if(values['--detached-path']){const detached={...options,path:values['--detached-path']};report=apply?cancel.cancelDetached(detached):cancel.planDetachedCancellation({...detached,...loadEvidence()});}
      else if(values['--resume-manifest'])report=cancel.resumeCancellation({...options,manifestPath:values['--resume-manifest']});
      else report=apply?cancel.cancelStale(options):cancel.planCancellation({...options,...loadEvidence()});
    } else report=apply?retire(options):planRetirement({...options,...loadEvidence()});
    process.stdout.write(JSON.stringify(report,null,2)+'\n');if(report.eligible===false)process.exitCode=1;
  } catch(error){process.stderr.write(`project-prune: ${error.message}\n`);process.exitCode=2;}
}
