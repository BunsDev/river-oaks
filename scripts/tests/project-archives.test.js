// The archive index reads what retirement and cancellation left on disk and
// says whether each archive still restores what its manifest promises. These
// fixtures build real bundles; the index never modifies the archive root.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { indexArchives, archiveRecords, expandHome, isProblem } from '../project-archives.mjs';
import { archiveTip } from '../project-prune.mjs';

function fixture(t) {
  const base=mkdtempSync(join(tmpdir(),'river-archives-'));
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  const root=join(base,'repo');mkdirSync(root);
  const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  git(root,'init','-b','main');git(root,'config','user.name','Fixture');git(root,'config','user.email','fixture@example.invalid');
  writeFileSync(join(root,'file'),'base');git(root,'add','.');git(root,'commit','-m','base');
  const head=git(root,'rev-parse','HEAD');
  const archiveRoot=join(base,'archives');mkdirSync(archiveRoot);
  // A complete archive, exactly as project:prune writes it.
  const make=(name,{status='retired',branch='feature',withSha=true,corrupt=false,path=null}={})=>{
    const directory=join(archiveRoot,name);mkdirSync(directory);
    const tag=`refs/tags/archive/worktree-prune/${name}`;git(root,'update-ref',tag,head);
    const bundle=join(directory,'history.bundle');git(root,'bundle','create',bundle,tag);
    const restore=join(directory,'restore.git');git(root,'init','--bare',restore);git(restore,'fetch',bundle,`${tag}:${tag}`);
    const manifest={branch:path?null:branch,path,head,tag,bundle,status,createdAt:new Date().toISOString()};
    if(withSha)manifest.sha256=createHash('sha256').update(readFileSync(bundle)).digest('hex');
    if(corrupt)appendFileSync(bundle,'tamper');
    writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest));
    return join(directory,'manifest.json');
  };
  return {base,root,git,head,archiveRoot,make};
}

test('verifies bundles and restores, links tasks, and tolerates superseded partial receipts',t=>{
  const f=fixture(t);
  const complete=f.make('retirement-abc');
  f.make('cancel-stale-first',{status:'archiving',withSha:false});
  f.make('cancel-detached-x',{status:'cancelled-local',path:'/somewhere/comparison'});
  const tampered=f.make('retirement-bad',{branch:'other',corrupt:true});
  mkdirSync(join(f.archiveRoot,'some-evidence'));writeFileSync(join(f.archiveRoot,'some-evidence','manifest.json'),JSON.stringify({files:[]}));
  mkdirSync(join(f.archiveRoot,'loose-notes'));
  const register={schemaVersion:1,tasks:[
    {id:'done',status:'retired',branches:['feature'],retiredBranches:['feature'],archive:{feature:{manifest:complete,head:f.head}}},
    {id:'old-shape',status:'retired',branches:['legacy'],archive:{manifest:join(f.base,'missing','manifest.json'),ref:'legacy',sha:f.head}},
  ]};
  const report=indexArchives({archiveRoot:f.archiveRoot,register,root:f.root});
  const by=Object.fromEntries(report.entries.map(e=>[e.directory.split('/').pop(),e]));
  assert.deepEqual(by['retirement-abc'].flags,[]);assert.deepEqual(by['retirement-abc'].tasks,['done']);
  assert.equal(by['retirement-abc'].tagPresentLocally,true);
  assert.ok(by['cancel-stale-first'].flags.includes('superseded-by-complete-archive'),'a later complete archive of the same tip makes the partial receipt history');
  assert.equal(isProblem(by['cancel-stale-first']),false);
  assert.ok(by['cancel-detached-x'].flags.includes('detached-no-task'));
  assert.ok(by['retirement-bad'].flags.includes('sha256-mismatch'));assert.ok(by['retirement-bad'].flags.includes('no-task'));
  assert.equal(isProblem(by['retirement-bad']),true);
  assert.equal(by['some-evidence'].kind,'evidence');
  assert.deepEqual(report.otherDirectories,['loose-notes']);
  assert.equal(report.summary.problems,1);
  assert.deepEqual(report.missingArchives,[{taskId:'old-shape',ref:'legacy',manifest:join(f.base,'missing','manifest.json')}]);
  assert.equal(tampered.endsWith('manifest.json'),true);
});

test('an archive built on the default branch verifies through the common object store',t=>{
  const f=fixture(t);f.git(f.root,'update-ref','refs/remotes/origin/main',f.head);
  writeFileSync(join(f.root,'file'),'branch work');f.git(f.root,'commit','-am','branch work');const tip=f.git(f.root,'rev-parse','HEAD');
  const directory=join(f.archiveRoot,'retirement-incremental');mkdirSync(directory);
  const tag='refs/tags/archive/worktree-prune/incremental';f.git(f.root,'update-ref',tag,tip);
  const bundle=join(directory,'history.bundle');
  const archive=archiveTip({root:f.root,tag,expectedHead:tip,bundle,restore:join(directory,'restore.git')});
  assert.deepEqual(archive.prerequisites,[f.head]);
  writeFileSync(join(directory,'manifest.json'),JSON.stringify({branch:'feature',head:tip,tag,bundle,status:'retired',createdAt:new Date().toISOString(),...archive}));
  const entry=indexArchives({archiveRoot:f.archiveRoot,register:{tasks:[]},root:f.root,fsck:true}).entries[0];
  assert.deepEqual(entry.flags,['no-task']);assert.equal(isProblem(entry),false);
});

test('a restore repository whose tag no longer matches the manifest head is a problem',t=>{
  const f=fixture(t);
  const manifest=f.make('retirement-moved');
  const record=JSON.parse(readFileSync(manifest,'utf8'));record.head='f'.repeat(40);writeFileSync(manifest,JSON.stringify(record));
  const entry=indexArchives({archiveRoot:f.archiveRoot,register:{tasks:[]},root:f.root}).entries[0];
  assert.ok(entry.flags.includes('restore-head-mismatch'));
  assert.equal(entry.tagPresentLocally,false);
});

test('register archive records normalize both shapes and tilde paths',t=>{
  assert.deepEqual(archiveRecords({archive:{a:{manifest:'/m/a'},b:{manifest:'/m/b'}}}),[{ref:'a',manifest:'/m/a'},{ref:'b',manifest:'/m/b'}]);
  assert.deepEqual(archiveRecords({branches:['x'],archive:{manifest:'/m/x',bundle:'/m/x.bundle',sha:'1'}}),[{ref:'x',manifest:'/m/x'}]);
  assert.deepEqual(archiveRecords({archive:{ref:'y',manifest:'/m/y'}}),[{ref:'y',manifest:'/m/y'}]);
  assert.deepEqual(archiveRecords({}),[]);
  const home=process.env.HOME;process.env.HOME='/home/fixture';
  t.after(()=>{process.env.HOME=home;});
  assert.equal(expandHome('~/worktree-backups/x'),'/home/fixture/worktree-backups/x');
  assert.equal(expandHome('/abs/x'),'/abs/x');
  assert.equal(expandHome(null),null);
});
