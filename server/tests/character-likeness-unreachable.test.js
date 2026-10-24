import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as nodeModule from 'node:module';
import { fileURLToPath } from 'node:url';

// Every served entry: the Node town, the Redis API, the Vite dev plugin, the Vercel
// function and the asset gate middleware. Each entry's own body is stopped before it
// can listen, so only Node's real resolver walks the graph that entry would load.
const ENTRIES=['server/start.js','server/redis-start.js','server/town.js','server/vite-town.js','api/server.js','middleware.js'];
const root=new URL('../../',import.meta.url);
const MARK='RESOLVED ';
const needsHooks={skip:typeof nodeModule.registerHooks!=='function'&&'needs module.registerHooks (Node 22.15 or later)'};

function resolvedFrom(entries) {
  const urls=entries.map(entry=>new URL(entry,root).href);
  const script=`import {registerHooks} from 'node:module';
const entries=new Set(${JSON.stringify(urls)}),seen=new Set();
registerHooks({
  resolve(specifier,context,next){const result=next(specifier,context);seen.add(result.url);return result;},
  load(url,context,next){const result=next(url,context);return entries.has(url)?{...result,source:'throw new Error("entry stopped");\\n'+Buffer.from(result.source).toString('utf8')}:result;},
});
for(const url of entries){try{await import(url);}catch(error){if(error.message!=='entry stopped')throw error;}}
process.stdout.write('\\n${MARK}'+JSON.stringify([...seen])+'\\n',()=>process.exit(0));`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:fileURLToPath(root),env:{PATH:process.env.PATH,NODE_ENV:'test'},encoding:'utf8',timeout:60_000});
  assert.equal(result.status,0,result.stderr);
  const line=result.stdout.split('\n').findLast(text=>text.startsWith(MARK));
  return JSON.parse(line.slice(MARK.length)).map(url=>url.startsWith(root.href)?url.slice(root.href.length):url);
}

test('no served entry point resolves a likeness module',needsHooks,()=>{
  const loaded=resolvedFrom(ENTRIES);
  // The walk reached the real HTTP, socket and world handlers, not an empty graph.
  for(const handler of ['server/app.js','server/distributed-app.js','server/world.js','server/redis-backend.js','server/game-assets.js'])assert.ok(loaded.includes(handler),`${handler} was not loaded`);
  assert.deepEqual(loaded.filter(url=>url.includes('character-likeness')),[]);
});

test('the same walk finds a likeness module reached only through an import',needsHooks,()=>{
  const loaded=resolvedFrom(['server/tests/character-likeness-quarantine.test.js']);
  assert.ok(loaded.includes('server/character-likeness-quarantine.js'));
  assert.ok(loaded.includes('server/character-likeness-validation.js'));
});
