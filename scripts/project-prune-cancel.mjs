// Explicitly authorized local cancellation of branches past the selected cutoff.
// Keep the reference guard, archive restoration, and non-forced worktree removal.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';

const git=(root,args,optional=false)=>{
  try{return execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_TERMINAL_PROMPT:'0'}}).trimEnd();}
  catch(error){if(optional)return null;throw new Error(`git ${args[0]} failed (${error.status??'unavailable'})`,{cause:error});}
};
const run=(program,args,cwd)=>execFileSync(program,args,{cwd,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']}).trimEnd();
const canonical=path=>existsSync(path)?realpathSync(path):resolve(path);
const inside=(path,parent)=>{const r=relative(canonical(parent),canonical(path));return !r||(!r.startsWith('../')&&r!=='..'&&!isAbsolute(r));};
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
const snapshotScript=new URL('./project-worktree-snapshot.py',import.meta.url).pathname;
const snapshot=(mode,path,...args)=>JSON.parse(run('python3',[snapshotScript,mode,'--root',path,...args],path));
const worktrees=root=>git(root,['worktree','list','--porcelain','-z']).split('\0\0').filter(Boolean).map((block,index)=>{
  const fields=Object.fromEntries(block.split('\0').filter(Boolean).map(line=>{const i=line.indexOf(' ');return i<0?[line,true]:[line.slice(0,i),line.slice(i+1)];}));
  return {path:fields.worktree,head:fields.HEAD,branch:fields.branch?.replace(/^refs\/heads\//,''),locked:Boolean(fields.locked),primary:index===0};
});

export function planCancellation({root,branch,expectedHead,register,pulls,activity,now=Date.now(),staleHours=12}) {
  const blockers=[],block=x=>blockers.push(x);
  if(!branch||git(root,['check-ref-format',`refs/heads/${branch}`],true)===null)throw new Error('Invalid branch');
  if(!/^[a-f0-9]{40,64}$/.test(expectedHead??''))throw new Error('A full expected head is required');
  const head=git(root,['rev-parse','--verify',`refs/heads/${branch}`],true);
  if(head!==expectedHead)block('head-changed');
  const trees=worktrees(root),owned=trees.filter(w=>w.branch===branch);
  if(['main','master'].includes(branch)||owned.some(w=>w.primary))block('protected-branch');
  const tasks=register?.tasks?.filter(t=>t.branches?.includes(branch))??[];
  if(tasks.length>1)block('duplicate-task-ownership');
  const task=tasks[0];
  if(task?.retiredBranches?.includes(branch)||task?.cancelledBranches?.includes(branch))block('previously-removed-ref-reappeared');
  if(!activity?.available)block('activity-unknown');
  const timestamps=[];
  const reflog=git(root,['reflog','show','-1','--format=%ct',`refs/heads/${branch}`],true);
  if(!/^\d+$/.test(reflog??''))block('reflog-time-unknown');else timestamps.push(Number(reflog)*1000);
  if(task){const updated=Date.parse(task.updatedAt);if(!Number.isFinite(updated))block('task-time-unknown');else timestamps.push(updated);}
  if(!Array.isArray(pulls))block('github-unknown');
  else for(const pr of pulls.filter(p=>p.head?.ref===branch||p.number===task?.pr)){
    const updated=Date.parse(pr.updated_at);if(!Number.isFinite(updated))block('pr-time-unknown');else timestamps.push(updated);
  }
  for(const w of owned){
    if(w.locked)block('locked');
    if(w.head!==head)block('worktree-head-changed');
    if(!existsSync(w.path)){block('missing-worktree');continue;}
    if(activity?.paths?.some(p=>inside(p,w.path)))block('active-process');
    const processList=run('ps',['-axo','command='],root);
    if(processList.split('\n').some(line=>line.includes(w.path)&&!line.includes('project-prune')))block('active-session-command');
    for(const name of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','BISECT_START']){
      const gitPath=git(w.path,['rev-parse','--git-path',name]);if(existsSync(resolve(w.path,gitPath)))block('operation-in-progress');
    }
    if(git(w.path,['ls-files','-v','-z']).split('\0').some(line=>/^[a-zS] /.test(line)))block('index-flags-require-review');
    if(git(w.path,['ls-files','--stage']).split('\n').some(line=>line.startsWith('160000 ')))block('submodules-require-review');
    try{timestamps.push(snapshot('scan',w.path).latestMtimeMs);}catch{block('file-inventory-failed');}
  }
  const latestTouchMs=Math.max(...timestamps,0),cutoffMs=now-staleHours*60*60*1000;
  if(!latestTouchMs||latestTouchMs>=cutoffMs)block('touched-within-cutoff');
  return {branch,head,taskId:task?.id??null,worktrees:owned.map(w=>w.path),latestTouch:new Date(latestTouchMs).toISOString(),cutoff:new Date(cutoffMs).toISOString(),blockers:[...new Set(blockers)],eligible:blockers.length===0};
}

export function cancelStale(options){
  const {root,branch,expectedHead,tasksPath,archiveRoot,loadEvidence}=options;
  const common=resolve(root,git(root,['rev-parse','--git-common-dir']));
  const lock=join(common,'river-oaks-retirement.lock');mkdirSync(lock);
  try{
    const check=()=>{const result=planCancellation({...options,...loadEvidence()});if(!result.eligible)throw new Error(result.blockers.join(', '));return result;};
    let plan=check();
    mkdirSync(archiveRoot,{recursive:true,mode:0o700});
    const archiveBase=resolve(archiveRoot);
    if(worktrees(root).some(w=>inside(archiveBase,resolve(w.path))))throw new Error('Archive must be outside all worktrees');
    const directory=mkdtempSync(join(archiveBase,'cancel-stale-'));
    const tag=`refs/tags/archive/worktree-prune/${randomUUID()}`;
    const bundle=join(directory,'history.bundle'),restore=join(directory,'restore.git'),manifest=join(directory,'manifest.json');
    const receipt={branch,head:expectedHead,tag,bundle,worktrees:plan.worktrees,latestTouch:plan.latestTouch,cutoff:plan.cutoff,status:'archiving',createdAt:new Date().toISOString()};
    const record=()=>writeFileSync(manifest,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});record();
    git(root,['update-ref',tag,expectedHead,'0'.repeat(expectedHead.length)]);
    git(root,['bundle','create',bundle,tag]);
    receipt.sha256=createHash('sha256').update(readFileSync(bundle)).digest('hex');
    git(root,['init','--bare',restore]);git(restore,['fetch',bundle,`${tag}:${tag}`]);
    if(git(restore,['rev-parse',tag])!==expectedHead)throw new Error('Archive restoration SHA mismatch');
    git(restore,['fsck','--full']);
    receipt.localFiles=[];
    for(const path of plan.worktrees){receipt.localFiles.push(snapshot('archive',path,'--directory',directory));record();}
    receipt.status='restore-verified';record();
    const originalPaths=JSON.stringify(plan.worktrees);
    plan=check();if(JSON.stringify(plan.worktrees)!==originalPaths)throw new Error('Worktree registrations changed');
    for(const [index,path] of plan.worktrees.entries()){
      check();snapshot('verify-source',path,'--manifest',receipt.localFiles[index].manifest);
      git(path,['reset','--hard',expectedHead]);git(path,['clean','-fdx']);
      if(git(path,['status','--porcelain=v1','--ignored']))throw new Error(`Worktree still has local files; archive: ${manifest}`);
      const current=loadEvidence().activity;
      if(!current?.available||current.paths.some(p=>inside(p,path)))throw new Error(`Activity changed before removal; archive: ${manifest}`);
      git(root,['worktree','remove',path]);
      receipt.removedWorktrees=[...(receipt.removedWorktrees??[]),path];record();
    }
    if(worktrees(root).some(w=>w.branch===branch))throw new Error('Branch still checked out');
    if(git(root,['rev-parse','--verify',`refs/heads/${branch}`])!==expectedHead)throw new Error('Branch changed');
    const permit=join(lock,'permit.json');writeFileSync(permit,JSON.stringify({branch,head:expectedHead,expiresAt:Date.now()+60_000}),{mode:0o600});
    try{git(root,['update-ref','-d',`refs/heads/${branch}`,expectedHead]);}finally{unlinkSync(permit);}
    if(git(root,['rev-parse','--verify',`refs/heads/${branch}`],true)!==null)throw new Error('Branch removal postcondition failed');
    receipt.status='cancelled-local';receipt.restoreCommand=`git fetch ${quote(bundle)} ${tag}:refs/heads/recovered`;record();
    const before=readFileSync(tasksPath,'utf8'),register=JSON.parse(before);
    let task=register.tasks.find(t=>t.id===plan.taskId);
    if(task&&(!task.branches.includes(branch)||task.retiredBranches?.includes(branch)))throw new Error(`Task changed; reconcile using ${manifest}`);
    if(!task){task={id:`cancelled-${branch.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}`,title:`Archived local ${branch}`,status:'queued',branches:[branch],owner:null,updatedAt:new Date().toISOString(),nextAction:'Review the preserved branch archive before restarting.',filesOwned:[],requiredChecks:[]};
      if(register.tasks.some(t=>t.id===task.id))throw new Error(`Task id collision; reconcile using ${manifest}`);register.tasks.push(task);}
    task.branches=task.branches.filter(b=>b!==branch);task.cancelledBranches=[...new Set([...(task.cancelledBranches??[]),branch])];
    task.archive={...(task.archive??{}),[branch]:{manifest,bundle,sha256:receipt.sha256,tag,head:expectedHead,localFiles:receipt.localFiles}};
    if(task.status==='delivered'&&task.branches.length===0)task.status='retired';
    else if(task.branches.length===0)task.status='queued';
    task.owner=null;delete task.leaseUntil;task.updatedAt=new Date().toISOString();
    task.nextAction=`Local ${branch} archived under ${manifest}; restore it before resuming this task. Remote PR and branch, if any, remain unchanged.`;
    const temp=`${tasksPath}.${randomUUID()}.tmp`;writeFileSync(temp,JSON.stringify(register,null,2)+'\n');
    if(readFileSync(tasksPath,'utf8')!==before)throw new Error(`Task register changed; reconcile using ${manifest}`);
    renameSync(temp,tasksPath);
    return {...receipt,manifest};
  }finally{rmdirSync(lock);}
}

// Continue only the narrowly identified state left when Git preserved a nested
// ignored repository after reset/clean. The first run already restore-tested it.
export function resumeCancellation({root,branch,expectedHead,tasksPath,manifestPath,loadEvidence}){
  const common=resolve(root,git(root,['rev-parse','--git-common-dir']));
  const lock=join(common,'river-oaks-retirement.lock');mkdirSync(lock);
  try{
    const manifest=resolve(manifestPath),receipt=JSON.parse(readFileSync(manifest,'utf8'));
    if(receipt.status!=='restore-verified'||receipt.branch!==branch||receipt.head!==expectedHead||receipt.worktrees.length!==1||receipt.localFiles.length!==1)throw new Error('Invalid partial cancellation receipt');
    const {register,pulls,activity}=loadEvidence();
    if(!activity?.available||!Array.isArray(pulls))throw new Error('Activity or GitHub evidence unavailable');
    const path=receipt.worktrees[0],owned=worktrees(root).filter(w=>w.branch===branch);
    if(owned.length!==1||owned[0].path!==path||owned[0].head!==expectedHead||owned[0].locked||owned[0].primary)throw new Error('Worktree registration changed');
    if(activity.paths.some(p=>inside(p,path))||run('ps',['-axo','command='],root).split('\n').some(line=>line.includes(path)&&!line.includes('project-prune')))throw new Error('Active session in worktree');
    if(git(root,['rev-parse','--verify',`refs/heads/${branch}`])!==expectedHead||git(root,['rev-parse',receipt.tag])!==expectedHead)throw new Error('Archived ref changed');
    if(run('shasum',['-a','256',receipt.bundle],root).split(/\s+/)[0]!==receipt.sha256)throw new Error('Git bundle checksum changed');
    const local=receipt.localFiles[0];
    if(run('shasum',['-a','256',local.archive],root).split(/\s+/)[0]!==local.sha256)throw new Error('Worktree archive checksum changed');
    git(join(resolve(manifest,'..'),'restore.git'),['fsck','--full']);
    const task=register.tasks.find(t=>t.id===receipt.taskId||t.branches?.includes(branch));
    if(task&&Date.parse(task.updatedAt)>Date.parse(receipt.createdAt))throw new Error('Task changed after archive');
    if(pulls.some(p=>p.head?.ref===branch&&Date.parse(p.updated_at)>Date.parse(receipt.createdAt)))throw new Error('PR changed after archive');
    if(git(path,['status','--porcelain=v1','--untracked-files=all']))throw new Error('New tracked or untracked edits after archive');
    if(git(path,['ls-files','--others','--ignored','--exclude-standard','--directory'])!=='.runtime/')throw new Error('Unexpected remaining ignored files');
    if(git(path,['clean','-ndffx'])!=='Would remove .runtime/')throw new Error('Unexpected cleanup target');
    snapshot('verify-prefix',path,'--manifest',local.manifest,'--prefix','.runtime');
    git(path,['clean','-ffdx','--','.runtime']);
    if(git(path,['status','--porcelain=v1','--ignored']))throw new Error('Worktree still has local files');
    git(root,['worktree','remove',path]);receipt.removedWorktrees=[path];
    const permit=join(lock,'permit.json');writeFileSync(permit,JSON.stringify({branch,head:expectedHead,expiresAt:Date.now()+60_000}),{mode:0o600});
    try{git(root,['update-ref','-d',`refs/heads/${branch}`,expectedHead]);}finally{unlinkSync(permit);}
    if(git(root,['rev-parse','--verify',`refs/heads/${branch}`],true)!==null)throw new Error('Branch removal postcondition failed');
    receipt.status='cancelled-local';receipt.restoreCommand=`git fetch ${quote(receipt.bundle)} ${receipt.tag}:refs/heads/recovered`;
    writeFileSync(manifest,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
    const before=readFileSync(tasksPath,'utf8'),live=JSON.parse(before);
    const entry=live.tasks.find(t=>t.branches?.includes(branch));
    if(!entry)throw new Error(`Branch removed; task changed, reconcile using ${manifest}`);
    entry.branches=entry.branches.filter(b=>b!==branch);
    entry.cancelledBranches=[...new Set([...(entry.cancelledBranches??[]),branch])];
    entry.archive={...(entry.archive??{}),[branch]:{manifest,bundle:receipt.bundle,sha256:receipt.sha256,tag:receipt.tag,head:expectedHead,localFiles:receipt.localFiles}};
    if(entry.status==='delivered'&&entry.branches.length===0)entry.status='retired';
    else if(entry.branches.length===0)entry.status='queued';
    entry.owner=null;delete entry.leaseUntil;entry.updatedAt=new Date().toISOString();
    entry.nextAction=`Local ${branch} archived under ${manifest}; restore it before resuming this task. Remote PR and branch, if any, remain unchanged.`;
    const temp=`${tasksPath}.${randomUUID()}.tmp`;writeFileSync(temp,JSON.stringify(live,null,2)+'\n');
    if(readFileSync(tasksPath,'utf8')!==before)throw new Error(`Task register changed; reconcile using ${manifest}`);
    renameSync(temp,tasksPath);
    return {...receipt,manifest};
  }finally{rmdirSync(lock);}
}

export function planDetachedCancellation({root,path,expectedHead,activity,now=Date.now(),staleHours=12}){
  const blockers=[],block=x=>blockers.push(x),target=resolve(path);
  const trees=worktrees(root),worktree=trees.find(w=>canonical(w.path)===canonical(target));
  if(!worktree||worktree.branch||worktree.primary||worktree.locked||worktree.head!==expectedHead)block('detached-registration-changed');
  if(!existsSync(target))block('missing-worktree');
  if(!activity?.available)block('activity-unknown');
  if(activity?.paths?.some(p=>inside(p,target)))block('active-process');
  let latest=0;
  if(existsSync(target)){
    const reflog=git(target,['reflog','show','-1','--format=%ct','HEAD'],true);
    if(!/^\d+$/.test(reflog??''))block('reflog-time-unknown');else latest=Math.max(latest,Number(reflog)*1000);
    try{latest=Math.max(latest,snapshot('scan',target).latestMtimeMs);}catch{block('file-inventory-failed');}
    if(git(target,['ls-files','-v','-z']).split('\0').some(line=>/^[a-zS] /.test(line)))block('index-flags-require-review');
    if(git(target,['ls-files','--stage']).split('\n').some(line=>line.startsWith('160000 ')))block('submodules-require-review');
    for(const name of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply','BISECT_START']){
      const gitPath=git(target,['rev-parse','--git-path',name]);if(existsSync(resolve(target,gitPath)))block('operation-in-progress');
    }
  }
  const cutoff=now-staleHours*3600000;
  if(!latest||latest>=cutoff)block('touched-within-cutoff');
  return {path:target,head:worktree?.head??null,latestTouch:new Date(latest).toISOString(),cutoff:new Date(cutoff).toISOString(),blockers:[...new Set(blockers)],eligible:blockers.length===0};
}

export function cancelDetached(options){
  const {root,path,expectedHead,archiveRoot,loadEvidence}=options,target=resolve(path);
  const common=resolve(root,git(root,['rev-parse','--git-common-dir']));
  const lock=join(common,'river-oaks-retirement.lock');mkdirSync(lock);
  try{
    const check=()=>{const p=planDetachedCancellation({...options,...loadEvidence()});if(!p.eligible)throw new Error(p.blockers.join(', '));return p;};
    const plan=check();mkdirSync(archiveRoot,{recursive:true,mode:0o700});
    if(worktrees(root).some(w=>inside(resolve(archiveRoot),resolve(w.path))))throw new Error('Archive must be outside all worktrees');
    const directory=mkdtempSync(join(resolve(archiveRoot),'cancel-detached-'));
    const tag=`refs/tags/archive/worktree-prune/${randomUUID()}`,bundle=join(directory,'history.bundle'),restore=join(directory,'restore.git'),manifest=join(directory,'manifest.json');
    const receipt={path:target,head:expectedHead,tag,bundle,status:'archiving',latestTouch:plan.latestTouch,cutoff:plan.cutoff,createdAt:new Date().toISOString()};
    const record=()=>writeFileSync(manifest,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});record();
    git(root,['update-ref',tag,expectedHead,'0'.repeat(expectedHead.length)]);git(root,['bundle','create',bundle,tag]);
    receipt.sha256=createHash('sha256').update(readFileSync(bundle)).digest('hex');
    git(root,['init','--bare',restore]);git(restore,['fetch',bundle,`${tag}:${tag}`]);
    if(git(restore,['rev-parse',tag])!==expectedHead)throw new Error('Archive restoration SHA mismatch');
    git(restore,['fsck','--full']);receipt.localFiles=snapshot('archive',target,'--directory',directory);receipt.status='restore-verified';record();
    check();snapshot('verify-source',target,'--manifest',receipt.localFiles.manifest);
    git(target,['reset','--hard',expectedHead]);git(target,['clean','-fdx']);
    if(git(target,['status','--porcelain=v1','--ignored']))throw new Error(`Worktree still has local files; archive: ${manifest}`);
    const current=loadEvidence().activity;
    if(!current?.available||current.paths.some(p=>inside(p,target)))throw new Error(`Activity changed before removal; archive: ${manifest}`);
    git(root,['worktree','remove',target]);
    if(worktrees(root).some(w=>canonical(w.path)===canonical(target)))throw new Error('Detached worktree removal postcondition failed');
    receipt.status='cancelled-local';receipt.restoreCommand=`git fetch ${quote(bundle)} ${tag}:refs/heads/recovered`;record();
    return {...receipt,manifest};
  }finally{rmdirSync(lock);}
}
