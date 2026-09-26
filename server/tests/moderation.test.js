import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createModeration} from '../moderation.js';
test('concurrent moderation writes persist all bans, audit reports, and keep files private',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'river-moderation-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const path=join(directory,'moderation.json'),moderation=await createModeration(path);
 await Promise.all([moderation.setBanned('alice',true,'moderator'),moderation.setBanned('bob',true,'moderator'),moderation.report('carol','alice','disruption')]);
 const restored=await createModeration(path);assert.ok(restored.isBanned('alice'));assert.ok(restored.isBanned('bob'));
 const audit=(await readFile(path+'.audit.jsonl','utf8')).trim().split('\n').map(line=>JSON.parse(line));
 assert.deepEqual(audit.map(event=>event.type),['ban','ban','report']);assert.equal(audit[2].reason,'disruption');
 assert.equal((await stat(path)).mode&0o077,0);assert.equal((await stat(path+'.audit.jsonl')).mode&0o077,0);
 await restored.setBanned('alice',false,'moderator');assert.equal((await createModeration(path)).isBanned('alice'),false);
});
test('a corrupt existing moderation store fails closed instead of discarding bans',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'river-moderation-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const path=join(directory,'moderation.json');await writeFile(path,'{"banned":42}');
 await assert.rejects(createModeration(path),/Invalid moderation store/);
});
