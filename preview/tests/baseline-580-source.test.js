import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { captureBaselineSource } from '../audit/baseline-580-source.js';

test('source identity catches committed changes as well as dirty and untracked inputs',async()=>{
  const root=await mkdtemp(join(tmpdir(),'baseline-580-source-'));
  const git=(...args)=>execFileSync('git',['-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null',...args],{cwd:root,stdio:'pipe'});
  try {
    git('init');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
    await mkdir(join(root,'preview'));await writeFile(join(root,'preview/input.js'),'export const value=1;\n');
    git('add','preview/input.js');git('commit','-m','fixture one');
    const before=await captureBaselineSource(root);
    await writeFile(join(root,'preview/input.js'),'export const value=2;\n');
    const dirty=await captureBaselineSource(root);assert.notEqual(dirty.sha256,before.sha256);
    git('add','preview/input.js');git('commit','-m','fixture two');
    const committed=await captureBaselineSource(root);
    assert.notEqual(committed.sha256,before.sha256,'clean worktrees at different HEADs are different inputs');
    await writeFile(join(root,'preview/extra.js'),'export const extra=true;\n');
    const extra=await captureBaselineSource(root);assert.notEqual(extra.sha256,committed.sha256);
    assert.equal(extra.untracked['preview/extra.js'].toString(),'export const extra=true;\n');
    await writeFile(join(root,'.env'),'SYNTHETIC_FIXTURE_ONLY=not-a-credential\n');
    const privateExcluded=await captureBaselineSource(root);assert.equal(privateExcluded.sha256,extra.sha256);
    assert.equal(Object.hasOwn(privateExcluded.untracked,'.env'),false);
  } finally { await rm(root,{recursive:true,force:true}); }
});
