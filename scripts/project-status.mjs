#!/usr/bin/env node
// Read-only reconciliation: recommendations are never deletion authorization.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const git = (root, args, optional = false) => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore','pipe','pipe'], env: {...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'} }).trimEnd(); }
  catch (error) { if (optional) return null; throw new Error(`git ${args[0]} failed (${error.status ?? 'unavailable'})`); }
};
const lines = value => value ? value.split('\n') : [];
export function inspectGit(root) {
  root = resolve(root);
  const main = git(root,['symbolic-ref','--quiet','refs/remotes/origin/HEAD'],true)
    ?? (git(root,['rev-parse','--verify','origin/main'],true) ? 'refs/remotes/origin/main' : 'refs/heads/main');
  const mainHead = git(root,['rev-parse',main]);
  const defaultBranch = main.replace(/^refs\/(?:remotes\/origin|heads)\//,'');
  const worktrees = git(root,['worktree','list','--porcelain']).split('\n\n').filter(Boolean).map((block,index) => {
    const data = Object.fromEntries(block.split('\n').map(line => { const space=line.indexOf(' ');return space<0?[line,true]:[line.slice(0,space),line.slice(space+1)]; }));
    const path=data.worktree, present=existsSync(path), status=present?lines(git(path,['status','--porcelain=v1','--untracked-files=all'])):[];
    return {path,head:data.HEAD,branch:data.branch?.replace(/^refs\/heads\//,'')??null,primary:index===0,locked:Boolean(data.locked),missing:!present,
      dirty:status.length>0,status,ignored:present?lines(git(path,['ls-files','--others','--ignored','--exclude-standard','--directory'])):[],
      merging:present&&git(path,['rev-parse','--verify','MERGE_HEAD'],true)!==null,
      ancestorMain:git(root,['merge-base','--is-ancestor',data.HEAD,main],true)!==null};
  });
  const branches=lines(git(root,['for-each-ref','--format=%(refname:short)\t%(objectname)\t%(upstream:short)','refs/heads'])).map(line=>{
    const [branch,head,upstream='']=line.split('\t');
    return {branch,head,upstream,ancestorMain:git(root,['merge-base','--is-ancestor',head,main],true)!==null};
  });
  // CWD absence is not proof of inactivity: retirement still needs an ownership review.
  let activityAvailable=false;
  try {
    const raw=execFileSync('lsof',['-nP','-a','-d','cwd','-Fn'],{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
    const paths=lines(raw).filter(line=>line.startsWith('n')).map(line=>line.slice(1));activityAvailable=true;
    for(const w of worktrees)w.active=paths.some(p=>p===w.path||p.startsWith(w.path+'/'));
  } catch { /* Unknown activity prevents automatic conclusions; no mutation is available here. */ }
  return {root,main,mainHead,defaultBranch,activityAvailable,branches,worktrees};
}

export function classify(item, pulls, defaultBranch='main') {
  const preserve = reason => ({disposition:'preserve',reason});
  if(item.primary||item.branch===defaultBranch)return preserve('primary-or-default');
  if(item.locked)return preserve('locked');
  if(item.missing)return preserve('missing-registration-review');
  if(item.dirty)return preserve('dirty');
  if(item.merging)return preserve('merge-in-progress');
  if(item.active)return preserve('active-process');
  if(item.registeredOwner)return preserve('registered-owner');
  if(!item.branch)return preserve('detached-review');
  if(pulls===null)return preserve('github-not-checked');
  const matches=pulls.filter(pr=>pr.head?.ref===item.branch);
  if(matches.some(pr=>pr.state==='open'))return preserve('open-pr');
  if(item.ancestorMain)return {disposition:'review-retirement',reason:'ancestor-of-main'};
  return preserve(matches.some(pr=>pr.merged_at&&pr.head?.sha===item.head)?'squash-aggregate-review-required':'unproven-delivery');
}

export function validateTasks(register) {
  const errors=[],ids=new Set(),branches=new Set();
  if(register.schemaVersion!==1||!Array.isArray(register.tasks))return ['Expected schemaVersion 1 and tasks array'];
  for(const task of register.tasks){
    if(!task.id||ids.has(task.id))errors.push(`Duplicate or missing task id: ${task.id}`);ids.add(task.id);
    if(!task.title||!task.nextAction||!Number.isFinite(Date.parse(task.updatedAt)))errors.push(`${task.id}: title, nextAction and ISO updatedAt required`);
    if(!['queued','active','blocked','delivered','retired'].includes(task.status))errors.push(`${task.id}: invalid status`);
    if(!Array.isArray(task.branches))errors.push(`${task.id}: branches array required`);
    for(const b of task.branches??[]){if(branches.has(b))errors.push(`Duplicate branch ownership: ${b}`);branches.add(b);}
    if(task.status==='active'&&(!task.owner||!Number.isFinite(Date.parse(task.leaseUntil))))errors.push(`${task.id}: active owner and leaseUntil required`);
    if(['delivered','retired'].includes(task.status)&&!task.evidence?.length)errors.push(`${task.id}: delivery evidence required`);
    if(task.status==='retired'&&!task.archive)errors.push(`${task.id}: restoration archive required`);
  }
  return errors;
}

export function reconcile(snapshot, register, pulls, now=Date.now()) {
  const gaps=[],tasks=register.tasks??[];
  const branches=snapshot.branches.map(branch=>{
    const task=tasks.find(t=>t.branches.includes(branch.branch));
    const worktree=snapshot.worktrees.find(w=>w.branch===branch.branch);
    if(!task)gaps.push(`Unregistered branch: ${branch.branch}`);
    if(task?.status==='retired')gaps.push(`Previously retired branch reappeared: ${branch.branch}`);
    if(task?.status==='active'&&Date.parse(task.leaseUntil)<=now)gaps.push(`Expired ownership lease: ${task.id}; do not take over without reconciliation`);
    const matchingPRs=(pulls??[]).filter(p=>p.head?.ref===branch.branch);
    if(task?.pr&&pulls!==null){
      const pr=pulls.find(p=>p.number===task.pr);
      if(!pr)gaps.push(`${task.id}: recorded PR not found in fetched evidence`);
      else if(['delivered','retired'].includes(task.status)&&!pr.merged_at&&!task.supersededBy)gaps.push(`${task.id}: recorded delivery disagrees with PR state`);
      else if(pr.merged_at&&!['delivered','retired'].includes(task.status))gaps.push(`${task.id}: PR merged; reconcile task and remaining local edits`);
      if(pr&&pr.head.sha!==branch.head)gaps.push(`${task.id}: local and PR heads differ (#${pr.number})`);
    }
    for(const pr of matchingPRs.filter(p=>p.state==='open'&&p.number!==task?.pr)){
      if(pr.head.sha!==branch.head)gaps.push(`${task?.id??branch.branch}: local and PR heads differ (#${pr.number})`);
    }
    return {...branch,taskId:task?.id??null,taskStatus:task?.status??null,worktree:worktree?.path??null,prs:matchingPRs.map(p=>({number:p.number,state:p.state,mergedAt:p.merged_at,head:p.head.sha})),...classify({...branch,...worktree,registeredOwner:task?.status==='active'&&Boolean(task.owner)},pulls,snapshot.defaultBranch)};
  });
  for(const task of tasks){
    if(!['retired','queued'].includes(task.status)&&!task.branches.some(b=>snapshot.branches.some(x=>x.branch===b)))gaps.push(`${task.id}: no local branch; locate remote/session before changing status`);
  }
  return {schemaVersion:1,generatedAt:new Date(now).toISOString(),scope:'Read-only local Git and optional GitHub evidence. Review recommendations require fresh ownership, ignored-data and archive checks.',...snapshot,githubChecked:pulls!==null,tasks,gaps,branches};
}

export function loadPulls(root) {
  const remote=git(root,['remote','get-url','origin']);
  const match=/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote);
  if(!match)throw new Error('GitHub evidence requires a github.com origin');
  const all=[];
  for(let page=1;;page++){
    const response=execFileSync('gh',['api',`repos/${match[1]}/pulls?state=all&per_page=100&page=${page}`],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
    const rows=JSON.parse(response);all.push(...rows.map(p=>({number:p.number,state:p.state,merged_at:p.merged_at,merge_commit_sha:p.merge_commit_sha,head:{ref:p.head.ref,sha:p.head.sha}})));if(rows.length<100)break;
  }
  return all;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value for ${name}`);return args[i+1];};
    const allowed=new Set(['--repo','--tasks','--output','--github','--check']);
    for(let i=0;i<args.length;i++){if(!allowed.has(args[i]))throw new Error(`Unknown argument: ${args[i]}`);if(['--repo','--tasks','--output'].includes(args[i]))i++;}
    const root=resolve(option('--repo')??process.cwd()),register=JSON.parse(readFileSync(resolve(root,option('--tasks')??'docs/project-management/tasks.json'),'utf8'));
    const errors=validateTasks(register);if(errors.length)throw new Error(errors.join('\n'));
    const snapshot=inspectGit(root),pulls=args.includes('--github')?loadPulls(root):null;
    const report=reconcile(snapshot,register,pulls);const json=JSON.stringify(report,null,2)+'\n';
    const output=option('--output');if(output)writeFileSync(resolve(output),json);else process.stdout.write(json);
    if(args.includes('--check')&&report.gaps.length)process.exitCode=1;
  }catch(error){process.stderr.write(`project-status: ${error.message}\n`);process.exitCode=2;}
}
