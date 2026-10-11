#!/usr/bin/env node
// Local-only retirement. Unknown evidence is a blocker, never deletion permission.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmdirSync, unlinkSync, renameSync, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadPulls, validateTasks } from './project-status.mjs';

function git(root,args,optional=false) {
  try { return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_TERMINAL_PROMPT:'0'}}).trimEnd(); }
  catch(error) { if(optional)return null;throw new Error(`git ${args[0]} failed (${error.status??'unavailable'})`); }
}
const shellQuote=value=>"'"+value.replaceAll("'","'\\''")+"'";
const canonical=path=>existsSync(path)?realpathSync(path):join(canonical(dirname(resolve(path))),basename(path));
const within=(path,parent)=>{const r=relative(canonical(parent),canonical(path));return !r||(!r.startsWith('..'+ '/')&&r!=='..'&&!isAbsolute(r));};
function worktrees(root) {
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
export function planRetirement({root,branch,expectedHead,register,pulls,activity,now=Date.now()}) {
  const blockers=[];const block=reason=>blockers.push(reason);
  if(!branch||git(root,['check-ref-format',`refs/heads/${branch}`],true)===null)throw new Error('Invalid branch');
  if(!/^[a-f0-9]{40,64}$/.test(expectedHead??''))throw new Error('A full expected head is required');
  const head=git(root,['rev-parse','--verify',`refs/heads/${branch}`],true);
  if(head!==expectedHead)block('head-changed');
  const trees=worktrees(root),owned=trees.filter(w=>w.branch===branch);
  const defaultRef=git(root,['symbolic-ref','--quiet','refs/remotes/origin/HEAD'],true)??'refs/remotes/origin/main';
  if(['main','master',defaultRef.replace('refs/remotes/origin/','')].includes(branch)||owned.some(w=>w.primary))block('protected-branch');
  const tasks=register?.tasks?.filter(t=>t.branches?.includes(branch))??[];const task=tasks[0];
  if(tasks.length!==1||task.status!=='delivered'||task.owner||task.leaseUntil)block('ownership-not-released');
  const release=task?.retirement;
  const fresh=date=>Number.isFinite(Date.parse(date))&&now-Date.parse(date)>=0&&now-Date.parse(date)<2*60*60*1000;
  if(release?.head!==head||!fresh(release?.sessionsReviewedAt)||!fresh(release?.releasedAt))block('session-release-missing-or-stale');
  if(!activity?.available)block('activity-unknown');
  for(const w of owned) {
    if(w.locked)block('locked');
    if(!existsSync(w.path)){block('missing-worktree');continue;}
    if(git(w.path,['-c','core.fsmonitor=false','status','--porcelain=v1','-z','--untracked-files=all','--ignore-submodules=none']))block('dirty');
    if(git(w.path,['ls-files','--others','--ignored','--exclude-standard','--directory','-z']))block('ignored-data');
    if(git(w.path,['ls-files','-v','-z']).split('\0').some(line=>/^[a-zS] /.test(line)))block('index-flags-require-review');
    if(git(w.path,['ls-files','--stage']).split('\n').some(line=>line.startsWith('160000 ')))block('submodules-require-review');
    for(const name of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','BISECT_START']){
      const path=git(w.path,['rev-parse','--git-path',name]);if(existsSync(resolve(w.path,path)))block('operation-in-progress');
    }
    if(activity?.paths?.some(p=>within(p,w.path)))block('active-process');
  }
  if(!Array.isArray(pulls))block('github-unknown');
  else {
    if(pulls.some(p=>p.state==='open'&&p.head?.ref===branch))block('open-pr');
    const pr=pulls.find(p=>p.number===task?.pr);
    if(!pr?.merged_at||pr.head?.ref!==branch||pr.head.sha!==head||!pr.merge_commit_sha)block('exact-merged-pr-required');
    else {
      const merge=pr.merge_commit_sha;
      if(git(root,['merge-base','--is-ancestor',merge,defaultRef],true)===null)block('merge-not-on-default');
      const tree=git(root,['rev-parse',`${merge}^{tree}`],true);
      if(!tree||git(root,['rev-parse',`${head}^{tree}`],true)!==tree)block('aggregate-tree-review-required');
    }
  }
  return {branch,head,taskId:task?.id??null,worktrees:owned.map(w=>w.path),blockers:[...new Set(blockers)],eligible:blockers.length===0};
}

export function retire(options) {
  const {root,branch,expectedHead,tasksPath,archiveRoot,loadEvidence}=options;
  const common=resolve(root,git(root,['rev-parse','--git-common-dir']));
  const lock=join(common,'river-oaks-retirement.lock');
  mkdirSync(lock); // Shared across worktrees; never steal a stale lock automatically.
  try {
    const check=()=>{const p=planRetirement({...options,...loadEvidence()});if(!p.eligible)throw new Error(p.blockers.join(', '));return p;};
    let plan=check();
    mkdirSync(archiveRoot,{recursive:true,mode:0o700});
    const archiveBase=realpathSync(archiveRoot);
    if(worktrees(root).some(w=>within(archiveBase,realpathSync(w.path))))throw new Error('Archive must be outside all worktrees');
    const directory=mkdtempSync(join(archiveBase,'retirement-'));
    const tag=`refs/tags/archive/worktree-prune/${randomUUID()}`;
    const bundle=join(directory,'history.bundle'),restore=join(directory,'restore.git');
    const receipt={branch,head:expectedHead,tag,bundle,worktrees:plan.worktrees,status:'archiving',createdAt:new Date().toISOString()};
    const manifest=join(directory,'manifest.json');
    const record=()=>writeFileSync(manifest,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});record();
    git(root,['update-ref',tag,expectedHead,'0'.repeat(expectedHead.length)]);
    git(root,['bundle','create',bundle,tag]);
    receipt.sha256=createHash('sha256').update(readFileSync(bundle)).digest('hex');
    git(root,['init','--bare',restore]);git(restore,['fetch',bundle,`${tag}:${tag}`]);
    if(git(restore,['rev-parse',tag])!==expectedHead)throw new Error('Archive restoration SHA mismatch');
    git(restore,['fsck','--full']);receipt.status='restore-verified';record();
    const initialPaths=JSON.stringify(plan.worktrees);
    plan=check();
    if(JSON.stringify(plan.worktrees)!==initialPaths)throw new Error('Worktree registrations changed');
    const remaining=[...plan.worktrees];
    const recheck=()=>{const fresh=check();if(JSON.stringify(fresh.worktrees)!==JSON.stringify(remaining))throw new Error('Worktree registrations changed');};
    for(const path of plan.worktrees) {
      recheck();git(root,['worktree','remove',path]);
      remaining.shift();
      receipt.removedWorktrees=[...(receipt.removedWorktrees??[]),path];record();
    }
    recheck();
    if(worktrees(root).some(w=>w.branch===branch))throw new Error('Branch still checked out');
    const permit=join(lock,'permit.json');
    writeFileSync(permit,JSON.stringify({branch,head:expectedHead,expiresAt:Date.now()+60_000}),{mode:0o600});
    try {git(root,['update-ref','-d',`refs/heads/${branch}`,expectedHead]);} finally {unlinkSync(permit);}
    if(git(root,['rev-parse','--verify',`refs/heads/${branch}`],true)!==null)throw new Error('Branch removal postcondition failed');
    receipt.status='retired';receipt.restoreCommand=`git fetch ${shellQuote(bundle)} ${tag}:refs/heads/recovered`;record();
    // Re-read rather than overwriting the initial coordination snapshot.
    const before=readFileSync(tasksPath,'utf8'),register=JSON.parse(before);
    const task=register.tasks.find(t=>t.id===plan.taskId);
    if(!task||task.owner||task.status!=='delivered')throw new Error(`Retired; task changed, reconcile using ${manifest}`);
    task.retiredBranches=[...new Set([...(task.retiredBranches??[]),branch])];
    task.archive={...(task.archive??{}),[branch]:{manifest,bundle,sha256:receipt.sha256,tag,head:expectedHead}};
    if(task.branches.every(b=>task.retiredBranches.includes(b)))task.status='retired';
    task.updatedAt=new Date().toISOString();task.nextAction='Preserve restoration archives; reconcile any remaining branches.';
    const temp=`${tasksPath}.${randomUUID()}.tmp`;writeFileSync(temp,JSON.stringify(register,null,2)+'\n');
    if(readFileSync(tasksPath,'utf8')!==before)throw new Error(`Task register changed; reconcile using ${manifest}`);
    renameSync(temp,tasksPath);
    return {...receipt,manifest};
  } finally {rmdirSync(lock);}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2),values={};let apply=false;
    for(let i=0;i<args.length;i++){
      if(args[i]==='--apply'){apply=true;continue;}
      if(!['--branch','--expected-head','--archive-root'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Usage: project:prune --branch <name> --expected-head <sha> [--apply] [--archive-root <external directory>]');
      values[args[i]]=args[++i];
    }
    const root=process.cwd(),primary=worktrees(root)[0].path;
    const tasksPath=join(primary,'docs/project-management/tasks.json');
    git(root,['fetch','--no-prune','origin']);
    const loadEvidence=()=>{
      const register=JSON.parse(readFileSync(tasksPath,'utf8'));const errors=validateTasks(register);if(errors.length)throw new Error(errors.join('\n'));
      return {register,pulls:loadPulls(root),activity:readActivity()};
    };
    const options={root,branch:values['--branch'],expectedHead:values['--expected-head'],tasksPath,archiveRoot:resolve(values['--archive-root']??join(homedir(),'worktree-backups','river-oaks')),loadEvidence};
    const report=apply?retire(options):planRetirement({...options,...loadEvidence()});
    process.stdout.write(JSON.stringify(report,null,2)+'\n');if(report.eligible===false)process.exitCode=1;
  } catch(error){process.stderr.write(`project-prune: ${error.message}\n`);process.exitCode=2;}
}
