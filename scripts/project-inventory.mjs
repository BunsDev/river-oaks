#!/usr/bin/env node
// Read-only inventory of every local branch and worktree, and optionally the
// remote branches, classified against the live register, GitHub and the
// archives. A class is a recommendation to look; only project:prune removes.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { git, canonical, planRetirement, readActivity, defaultArchiveRoot, primaryRegisterPath, defaultBranchRef } from './project-prune.mjs';
import { inspectGit, loadPulls, validateTasks } from './project-status.mjs';
import { indexArchives } from './project-archives.mjs';

const short=sha=>(sha??'').slice(0,7);
const same=(a,b)=>a&&b&&canonical(a)===canonical(b);

function upstreamState(root,branch,upstream) {
  if(!upstream)return {name:null,state:'no-upstream',ahead:null,behind:null};
  if(git(root,['rev-parse','--verify',`${upstream}^{commit}`],true)===null)return {name:upstream,state:'gone',ahead:null,behind:null};
  const [ahead,behind]=git(root,['rev-list','--left-right','--count',`refs/heads/${branch}...${upstream}`]).split(/\s+/).map(Number);
  return {name:upstream,state:ahead===0&&behind===0?'in-sync':ahead&&behind?'diverged':ahead?'ahead':'behind',ahead,behind};
}

function prState(pulls,branch,head) {
  if(!Array.isArray(pulls))return {checked:false,open:[],mergedExact:null,mergedOther:[]};
  const mine=pulls.filter(p=>p.head?.ref===branch);
  return {checked:true,open:mine.filter(p=>p.state==='open').map(p=>p.number),
    mergedExact:mine.find(p=>p.merged_at&&p.head?.sha===head)?.number??null,
    mergedOther:mine.filter(p=>p.merged_at&&p.head?.sha!==head).map(p=>p.number)};
}

// The same evidence project:prune reads, applied to one delivered branch so the
// inventory can say what still stands between it and retirement.
function retirementView({root,branch,head,register,pulls,activity,now}) {
  try {
    const plan=planRetirement({root,branch,expectedHead:head,register,pulls,activity,now});
    const releaseOnly=plan.blockers.every(b=>['session-release-missing-or-stale','ownership-not-released'].includes(b));
    return {blockers:plan.blockers,cls:plan.eligible?'retire-eligible':releaseOnly?'retire-candidate':`blocked:${plan.blockers.join('+')}`};
  } catch(error) {return {blockers:[`plan-error:${error.message}`],cls:'blocked:plan-error'};}
}

export function buildInventory({root,snapshot,register,pulls,activity,archives,now=Date.now()}) {
  const tasks=register?.tasks??[];
  const main=snapshot.main;
  const archiveFor=(branch,head)=>archives?.entries?.find(e=>e.kind!=='evidence'&&((branch&&e.branch===branch)||(head&&e.head===head)))??null;
  const rows=[];
  const describe=({branch,head,worktree,primary})=>{
    const flags=[];
    const task=branch?tasks.find(t=>t.branches?.includes(branch)):worktree?tasks.find(t=>t.worktree&&same(t.worktree,worktree.path)):null;
    const archived=branch?tasks.filter(t=>t.retiredBranches?.includes(branch)||t.cancelledBranches?.includes(branch)).map(t=>t.id):[];
    const leaseExpired=task?.leaseUntil?Date.parse(task.leaseUntil)<=now:false;
    const pr=branch?prState(pulls,branch,head):{checked:Array.isArray(pulls),open:[],mergedExact:null,mergedOther:[]};
    const unique=head?Number(git(root,['rev-list','--count',`${main}..${head}`],true)??NaN):NaN;
    const upstream=branch?upstreamState(root,branch,snapshot.branches.find(b=>b.branch===branch)?.upstream):null;
    const archive=archiveFor(branch,head);
    if(worktree?.dirty)flags.push('dirty');
    if(worktree?.ignored?.length)flags.push('ignored-data');
    if(worktree?.locked)flags.push('locked');
    if(worktree?.missing)flags.push('missing-worktree');
    if(worktree?.merging)flags.push('operation-in-progress');
    if(worktree?.active)flags.push('active-process');
    if(upstream?.state==='gone')flags.push('upstream-gone');
    if(upstream?.state==='no-upstream'&&!primary)flags.push('no-upstream');
    if(unique===0&&!primary)flags.push('zero-commit');
    if(leaseExpired)flags.push('lease-expired');
    if(archived.length)flags.push('previously-archived-ref-reappeared');
    if(archive)flags.push(`archived:${archive.status}`);
    if(pr.mergedOther.length)flags.push('merged-pr-other-head');
    if(!pr.checked)flags.push('github-not-checked');
    let cls,blockers=[];
    if(primary)cls='primary';
    else if(task?.status==='active'&&task.owner)cls='active';
    else if(pr.open.length)cls='open-pr';
    else if(!branch)cls='detached';
    else if(!task)cls='orphan-no-task';
    else if(task.status==='delivered'){const view=retirementView({root,branch,head,register,pulls,activity,now});cls=view.cls;blockers=view.blockers;}
    else if(task.status==='retired')cls='blocked:previously-retired-ref-reappeared';
    else if(unique===0)cls='zero-commit';
    else cls='parked';
    if(!task&&!primary&&!flags.includes('orphan-no-task')&&cls!=='orphan-no-task')flags.push('orphan-no-task');
    rows.push({kind:branch?'branch':'worktree',branch:branch??null,head,worktree:worktree?.path??null,primary:Boolean(primary),
      task:task?{id:task.id,status:task.status,owner:task.owner??null,leaseUntil:task.leaseUntil??null}:null,
      upstream,pr,uniqueCommits:Number.isNaN(unique)?null:unique,archive:archive?{manifest:archive.manifest,status:archive.status,kind:archive.kind}:null,
      cls,flags,blockers});
  };
  for(const b of snapshot.branches)describe({branch:b.branch,head:b.head,worktree:snapshot.worktrees.find(w=>w.branch===b.branch)??null,primary:snapshot.worktrees.some(w=>w.primary&&w.branch===b.branch)});
  for(const w of snapshot.worktrees.filter(w=>!w.branch))describe({branch:null,head:w.head,worktree:w,primary:w.primary});
  const counts={worktrees:snapshot.worktrees.length,branches:snapshot.branches.length,
    byClass:Object.fromEntries([...new Set(rows.map(r=>r.cls))].sort().map(c=>[c,rows.filter(r=>r.cls===c).length]))};
  return {schemaVersion:1,generatedAt:new Date(now).toISOString(),root,main,mainHead:snapshot.mainHead,activityAvailable:Boolean(activity?.available),githubChecked:Array.isArray(pulls),
    scope:'Read-only classification. retire-eligible means project:prune would accept the branch now; everything else names what to reconcile first.',counts,rows};
}

// Remote branches, report only: which ones a merged pull request already landed
// at this exact tip. The delete commands are written for a human to review, not run.
export function buildRemoteInventory({root,pulls,snapshot}) {
  const remote=git(root,['remote','get-url','origin']);
  const slug=/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote)?.[1]??null;
  const defaultRef=defaultBranchRef(root),defaultName=defaultRef.replace('refs/remotes/origin/','');
  const refs=git(root,['for-each-ref','--format=%(refname:short)\t%(objectname)','refs/remotes/origin']).split('\n').filter(Boolean).map(line=>line.split('\t'));
  const rows=[];
  for(const [name,tip] of refs) {
    const branch=name.replace(/^origin\//,'');
    if(name==='origin/HEAD'||name==='origin'||branch===defaultName)continue;
    const local=snapshot?.branches?.find(b=>b.branch===branch)??null;
    const pr=prState(pulls,branch,tip);
    const ancestor=git(root,['merge-base','--is-ancestor',tip,defaultRef],true)!==null;
    let cls,merge=null;
    if(!pr.checked)cls='github-not-checked';
    else if(pr.open.length)cls='open-pr';
    else if(pr.mergedExact){
      merge=pulls.find(p=>p.number===pr.mergedExact)?.merge_commit_sha??null;
      cls=merge&&git(root,['merge-base','--is-ancestor',merge,defaultRef],true)!==null?'merged-exact':'merged-pr-not-on-default';
    }
    else if(ancestor)cls='merged-ancestor-review';
    else cls='unproven';
    rows.push({branch,tip,cls,pr:pr.mergedExact??pr.open[0]??pr.mergedOther[0]??null,merge,ancestorOfDefault:ancestor,localBranch:local?.branch??null,localHeadMatches:local?local.head===tip:null,
      deleteCommand:cls==='merged-exact'&&slug?`gh api -X DELETE repos/${slug}/git/refs/heads/${branch}`:null});
  }
  return {slug,defaultBranch:defaultName,counts:Object.fromEntries([...new Set(rows.map(r=>r.cls))].sort().map(c=>[c,rows.filter(r=>r.cls===c).length])),rows,
    deleteCommands:rows.filter(r=>r.deleteCommand).map(r=>r.deleteCommand),
    note:'Not executed. Remote deletion needs explicit approval; a branch whose local copy is still present or whose PR was merged from another head stays listed for review.'};
}

export function formatInventory(report,remote) {
  const head=['class','ref','head','task','upstream','pr','flags'];
  const rows=report.rows.map(r=>[r.cls,r.branch??`(detached) ${r.worktree?.split('/').pop()}`,short(r.head),r.task?`${r.task.id} [${r.task.status}${r.task.owner?' '+String(r.task.owner).slice(0,18):''}]`:'-',
    r.upstream?r.upstream.state+(r.upstream.ahead||r.upstream.behind?` +${r.upstream.ahead}/-${r.upstream.behind}`:''):'-',
    r.pr.open.length?`open #${r.pr.open.join(',#')}`:r.pr.mergedExact?`merged #${r.pr.mergedExact}`:r.pr.mergedOther.length?`merged(other) #${r.pr.mergedOther.join(',#')}`:'-',
    [...r.flags,...r.blockers.filter(b=>!r.cls.includes(b))].join(',')||'-']);
  const widths=head.map((h,i)=>Math.max(h.length,...rows.map(r=>r[i].length)));
  const line=r=>r.map((c,i)=>c.padEnd(widths[i])).join('  ');
  const out=[line(head),...rows.map(line),'',`worktrees ${report.counts.worktrees}, branches ${report.counts.branches}; `+Object.entries(report.counts.byClass).map(([k,v])=>`${k} ${v}`).join(', ')];
  if(remote){
    out.push('','remote branches: '+Object.entries(remote.counts).map(([k,v])=>`${k} ${v}`).join(', '));
    for(const r of remote.rows.filter(r=>r.cls!=='open-pr'))out.push(`  ${r.cls.padEnd(26)} ${r.branch.padEnd(48)} ${short(r.tip)}${r.pr?` #${r.pr}`:''}${r.localBranch?' local':''}`);
    if(remote.deleteCommands.length)out.push('','delete commands (NOT executed; needs approval):',...remote.deleteCommands.map(c=>'  '+c));
  }
  return out.join('\n')+'\n';
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2),values={};const flags=new Set();
    for(let i=0;i<args.length;i++){
      if(['--remote','--json','--no-github','--no-fetch'].includes(args[i])){flags.add(args[i]);continue;}
      if(!['--repo','--tasks','--output','--archive-root'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Usage: project:inventory [--remote] [--json] [--output <file>] [--no-github] [--no-fetch] [--tasks <tasks.json>] [--archive-root <dir>]');
      values[args[i]]=args[++i];
    }
    const root=resolve(values['--repo']??process.cwd());
    if(!flags.has('--no-fetch'))git(root,['fetch','--no-prune','origin'],true);
    const tasksPath=values['--tasks']?resolve(values['--tasks']):primaryRegisterPath(root);
    const text=readFileSync(tasksPath,'utf8');
    if(/^(<{7}|>{7})( |$)/m.test(text))throw new Error('Task register has conflict markers; merge it by task id first');
    const register=JSON.parse(text);const errors=validateTasks(register);if(errors.length)throw new Error(errors.join('\n'));
    const snapshot=inspectGit(root);
    const pulls=flags.has('--no-github')?null:loadPulls(root);
    const activity=readActivity();
    const archiveRoot=resolve(values['--archive-root']??defaultArchiveRoot());
    const archives=existsSync(archiveRoot)?indexArchives({archiveRoot,register,root}):{entries:[]};
    const report=buildInventory({root,snapshot,register,pulls,activity,archives});
    const remote=flags.has('--remote')?buildRemoteInventory({root,pulls,snapshot}):null;
    const json=JSON.stringify({...report,remote},null,2)+'\n';
    if(values['--output'])writeFileSync(resolve(values['--output']),json);
    process.stdout.write(flags.has('--json')?json:formatInventory(report,remote));
  } catch(error){process.stderr.write(`project-inventory: ${error.message}\n`);process.exitCode=2;}
}
