#!/usr/bin/env node
// Read-only index of the retirement and cancellation archives. It verifies what
// each manifest promises and links archives to register tasks; it never writes,
// moves or deletes anything under the archive root.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { git, defaultArchiveRoot, primaryRegisterPath, worktrees } from './project-prune.mjs';
import { validateTasks } from './project-status.mjs';

const FINAL_STATUSES=new Set(['retired','cancelled','cancelled-local']);
// Flags that mean the archive cannot be trusted as recorded. The others are information.
export const PROBLEM_FLAGS=new Set(['manifest-unreadable','bundle-missing','sha256-mismatch','restore-missing','restore-head-mismatch','fsck-failed','status-not-final','local-archive-missing','local-archive-sha256-mismatch']);

// Older register records wrote the archive root as `~/...`.
export const expandHome=path=>path?.startsWith('~/')?join(homedir(),path.slice(2)):path;
const sha256=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const kindOf=name=>/^retirement-/.test(name)?'retirement':/^cancel-stale-/.test(name)?'cancel-stale':/^cancel-detached-/.test(name)?'cancel-detached':'other';

export function readArchive({directory,root,fsck=false,files=false}) {
  const manifestPath=join(directory,'manifest.json');
  const entry={directory,manifest:manifestPath,kind:kindOf(directory.split('/').pop()),flags:[]};
  const flag=name=>{if(!entry.flags.includes(name))entry.flags.push(name);};
  let manifest;
  try {manifest=JSON.parse(readFileSync(manifestPath,'utf8'));}
  catch {flag('manifest-unreadable');return entry;}
  Object.assign(entry,{branch:manifest.branch??null,path:manifest.path??null,head:manifest.head??null,tag:manifest.tag??null,status:manifest.status??null,createdAt:manifest.createdAt??null,worktrees:manifest.worktrees??(manifest.path?[manifest.path]:[]),removedWorktrees:manifest.removedWorktrees??[]});
  // Evidence archives (local reports, captures) share the root but are not ref archives.
  if(!manifest.tag&&!manifest.bundle){entry.kind='evidence';flag('not-a-ref-archive');return entry;}
  if(!FINAL_STATUSES.has(manifest.status))flag('status-not-final');
  if(!manifest.bundle||!existsSync(manifest.bundle))flag('bundle-missing');
  else if(!manifest.sha256)flag('sha256-unrecorded');
  else if(sha256(manifest.bundle)!==manifest.sha256)flag('sha256-mismatch');
  const restore=join(directory,'restore.git');
  if(!existsSync(restore))flag('restore-missing');
  else if(manifest.tag&&manifest.head) {
    if(git(restore,['rev-parse','--verify',`${manifest.tag}^{commit}`],true)!==manifest.head)flag('restore-head-mismatch');
    else if(fsck&&git(restore,['fsck','--full'],true)===null)flag('fsck-failed');
  }
  if(root&&manifest.tag)entry.tagPresentLocally=git(root,['rev-parse','--verify',`${manifest.tag}^{commit}`],true)===manifest.head;
  // Cancellations also archive the local files; their own manifest carries the tar hash.
  const locals=Array.isArray(manifest.localFiles)?manifest.localFiles:manifest.localFiles?[manifest.localFiles]:[];
  entry.localArchives=locals.map(local=>{
    const record={archive:local.archive,manifest:local.manifest,sha256:local.sha256??null};
    if(!local.archive||!existsSync(local.archive))flag('local-archive-missing');
    else if(files&&local.sha256&&sha256(local.archive)!==local.sha256)flag('local-archive-sha256-mismatch');
    return record;
  });
  return entry;
}

// Register archive records come in two shapes: the current map of ref -> record,
// and the 2026-10-11 rounds' single flat record with `ref`/`sha` fields.
export function archiveRecords(task) {
  const archive=task.archive;
  if(!archive||typeof archive!=='object')return [];
  if(typeof archive.manifest==='string')return [{ref:archive.ref??task.retiredBranches?.[0]??task.branches?.[0]??null,manifest:archive.manifest}];
  return Object.entries(archive).filter(([,record])=>record&&typeof record==='object').map(([ref,record])=>({ref,manifest:record.manifest??null}));
}

export function linkTasks(entries,register) {
  const tasks=register?.tasks??[];
  const byManifest=new Map();
  for(const task of tasks)for(const record of archiveRecords(task))if(record.manifest)byManifest.set(record.manifest,{taskId:task.id,ref:record.ref});
  const complete=new Set(entries.filter(e=>e.kind!=='evidence'&&!e.flags.includes('status-not-final')).map(e=>`${e.branch??e.path}@${e.head}`));
  for(const entry of entries) {
    if(entry.kind==='evidence'){entry.tasks=[];continue;}
    const direct=byManifest.get(entry.manifest);
    const byRef=entry.branch?tasks.filter(t=>[...(t.branches??[]),...(t.retiredBranches??[]),...(t.cancelledBranches??[])].includes(entry.branch)).map(t=>t.id):[];
    entry.tasks=[...new Set([direct?.taskId,...byRef].filter(Boolean))];
    if(!entry.tasks.length)entry.flags.push(entry.kind==='cancel-detached'?'detached-no-task':'no-task');
    // A failed first attempt stays on disk as a partial receipt; once a complete archive
    // of the same tip exists it is history, not a problem.
    if(entry.flags.includes('status-not-final')&&complete.has(`${entry.branch??entry.path}@${entry.head}`))entry.flags.push('superseded-by-complete-archive');
  }
  // The reverse direction: a task that points at an archive which is gone.
  const missing=[];
  for(const task of tasks)for(const record of archiveRecords(task))if(!record.manifest||!existsSync(expandHome(record.manifest)))missing.push({taskId:task.id,ref:record.ref,manifest:record.manifest});
  return missing;
}
export const isProblem=entry=>!entry.flags.includes('superseded-by-complete-archive')&&entry.flags.some(f=>PROBLEM_FLAGS.has(f));

export function indexArchives({archiveRoot,register,root,fsck=false,files=false}) {
  const names=existsSync(archiveRoot)?readdirSync(archiveRoot).filter(name=>statSync(join(archiveRoot,name)).isDirectory()):[];
  const entries=[],other=[];
  for(const name of names.sort()) {
    const directory=join(archiveRoot,name);
    if(existsSync(join(directory,'manifest.json')))entries.push(readArchive({directory,root,fsck,files}));else other.push(name);
  }
  const missingArchives=linkTasks(entries,register);
  const problems=entries.filter(isProblem);
  const summary={archives:entries.length,otherDirectories:other.length,problems:problems.length,missingArchives:missingArchives.length,
    byKind:Object.fromEntries(['retirement','cancel-stale','cancel-detached','evidence','other'].map(k=>[k,entries.filter(e=>e.kind===k).length])),
    byFlag:Object.fromEntries([...new Set(entries.flatMap(e=>e.flags))].sort().map(f=>[f,entries.filter(e=>e.flags.includes(f)).length]))};
  return {schemaVersion:1,generatedAt:new Date().toISOString(),archiveRoot,scope:'Read-only archive verification. Nothing here authorizes deleting an archive, a worktree or a ref.',summary,entries,otherDirectories:other,missingArchives};
}

export function formatArchives(report) {
  const rows=report.entries.filter(e=>e.kind!=='evidence').map(e=>[e.kind,(e.branch??(e.path?e.path.split('/').pop():'?')).slice(0,48),(e.head??'').slice(0,7),e.status??'?',e.tasks?.join(',')||'-',e.flags.join(',')||'-']);
  const head=['kind','ref','head','status','task','flags'];
  const widths=head.map((h,i)=>Math.max(h.length,...rows.map(r=>r[i].length)));
  const line=r=>r.map((c,i)=>c.padEnd(widths[i])).join('  ');
  const out=[line(head),...rows.map(line),'',`ref archives ${report.summary.archives-report.summary.byKind.evidence}, evidence archives ${report.summary.byKind.evidence}, problems ${report.summary.problems}, tasks pointing at missing archives ${report.summary.missingArchives}, other directories ${report.summary.otherDirectories}`];
  for(const m of report.missingArchives)out.push(`missing: ${m.taskId} ${m.ref} -> ${m.manifest}`);
  return out.join('\n')+'\n';
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2),values={};const flags=new Set();
    for(let i=0;i<args.length;i++){
      if(['--fsck','--files','--json'].includes(args[i])){flags.add(args[i]);continue;}
      if(!['--archive-root','--tasks','--output'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--'))throw new Error('Usage: project:archives [--archive-root <dir>] [--tasks <tasks.json>] [--fsck] [--files] [--json] [--output <file>]');
      values[args[i]]=args[++i];
    }
    const root=process.cwd();
    const tasksPath=values['--tasks']?resolve(values['--tasks']):primaryRegisterPath(root);
    const register=JSON.parse(readFileSync(tasksPath,'utf8'));const errors=validateTasks(register);if(errors.length)throw new Error(errors.join('\n'));
    const archiveRoot=resolve(values['--archive-root']??defaultArchiveRoot());
    if(worktrees(root).some(w=>archiveRoot.startsWith(w.path+'/')||archiveRoot===w.path))throw new Error('Archive root must be outside every worktree');
    const report=indexArchives({archiveRoot,register,root,fsck:flags.has('--fsck'),files:flags.has('--files')});
    const text=flags.has('--json')||values['--output']?JSON.stringify(report,null,2)+'\n':formatArchives(report);
    if(values['--output']){writeFileSync(resolve(values['--output']),text);process.stdout.write(formatArchives(report));}
    else process.stdout.write(text);
    if(report.summary.problems||report.summary.missingArchives)process.exitCode=1;
  } catch(error){process.stderr.write(`project-archives: ${error.message}\n`);process.exitCode=2;}
}
