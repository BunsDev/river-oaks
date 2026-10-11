import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createStudioDesignerHost, designerSenderAllowed } from '../studio-designer-host.js';
import { buildWorldDesignPack } from '../../scripts/studio-skill-pack.js';
import { createStudioDocument } from '../../preview/src/studio/document.js';
import { createDesignerSession } from '../../preview/src/studio/designer-protocol.js';
import { runStudioCommand } from '../studio-command.js';
const root = fileURLToPath(new URL('../../',import.meta.url));
const pack = await buildWorldDesignPack(root);
async function fixture(t, options = {}){await mkdir(join(root,'.runtime/tmp'),{recursive:true});const path=await mkdtemp(join(root,'.runtime/tmp/designer-'));const host=createStudioDesignerHost({root:path,pack,executable:join(root,'desktop/tests/fixtures/studio-coven.mjs'),confirm:async()=>true,...options});t.after(async()=>{host.dispose();await rm(path,{recursive:true,force:true});});return {host,path};}
const input=mode=>({mode,name:'Aster',runtimeId:'coven-codex',projectId:'fixture-project'});
test('both real subprocess paths install pack, fence identity and support preview/apply/undo',async t=>{
 const {host,path}=await fixture(t);
 for(const mode of ['general','familiar']){
  const connection=await host.connect(input(mode));assert.equal(connection.packVerified,true);assert.equal(connection.mode,mode);assert.equal(connection.providerVerified,false);
  const doc=createStudioDocument(),session=createDesignerSession(doc);session.connect(connection);const request=session.begin({brief:'Improve arrival',scope:'region'});const response=await host.request(request);session.preview(response);session.apply();assert.equal(doc.value.spawn[0],2);doc.undo();assert.equal(doc.value.spawn[0],0);
  await assert.rejects(host.request(request),/consumed/);await host.disconnect({connectionId:connection.id});await assert.rejects(host.request(request),/disconnected/);
 }
 const before=await readFile(join(path,'fixture-project/familiar/IDENTITY.md'),'utf8');assert.match(before,/Aster/);
 await assert.rejects(host.connect({...input('familiar'),name:'Replacement'}),/not been overwritten/);assert.equal(await readFile(join(path,'fixture-project/familiar/IDENTITY.md'),'utf8'),before);
 const retry=await host.connect(input('familiar'));assert.equal(retry.identityRevision,'familiar-revision:fixture');
 const history=JSON.parse(await readFile(join(path,'fixture-project/familiar/coven/fixture-ledger.json'),'utf8'));history.roots[0].retiredAt='now';await writeFile(join(path,'fixture-project/familiar/coven/fixture-ledger.json'),JSON.stringify(history));
 const session=createDesignerSession(createStudioDocument());session.connect(retry);await assert.rejects(host.request(session.begin({brief:'Review',scope:'region'})),/active unique/);
});
test('cancellation, project mismatch and altered installed bytes fail closed',async t=>{
 const {host,path}=await fixture(t),connection=await host.connect(input('general'));const session=createDesignerSession(createStudioDocument());session.connect(connection);
 const request=session.begin({brief:'wait forever',scope:'region'}),pending=host.request(request);await new Promise(resolve=>setTimeout(resolve,100));await host.cancel({connectionId:connection.id,requestId:request.requestId});await assert.rejects(pending,/canceled/);
 await assert.rejects(host.request({...request,projectId:'other'}),/Invalid/);
 await writeFile(join(path,'fixture-project/general/knowledge',pack.manifest.sha256,'.agents/skills/world-workflow/SKILL.md'),'tampered');await assert.rejects(host.request(session.begin({brief:'Review',scope:'region'})),/skills changed/);
});
test('immediate restart waits for canceled subprocess cleanup and respects cancellation and disconnect', async t => {
 for (const action of ['restart', 'disconnect', 'cancel']) await t.test(action, async t => {
  let started, release, running = 0, maximum = 0, calls = 0;
  const ready = new Promise(resolve => { started = resolve; });
  const cleanup = new Promise(resolve => { release = resolve; });
  const {host} = await fixture(t, { execute: async (executable, args, options) => {
   if (args[0] !== 'run') return runStudioCommand(executable, args, options);
   const first = ++calls === 1; maximum = Math.max(maximum, ++running);
   if (first) started();
   try { return await runStudioCommand(executable, args, options); }
   finally { if (first) await cleanup; running--; }
  } });
  const connection = await host.connect(input('general'));
  const doc = createStudioDocument(), session = createDesignerSession(doc); session.connect(connection);
  const request = session.begin({brief:'wait forever',scope:'region'});
  const canceled = assert.rejects(host.request(request), /canceled/);
  await ready;
  await assert.rejects(host.request({...request, requestId:'overlapping-request'}), /already running/);
  await host.cancel({connectionId:connection.id,requestId:request.requestId});
  await assert.rejects(host.request(request), /consumed/);
  let settled = false;
  const replacement = session.begin({brief:'Improve arrival',scope:'region'});
  const next = host.request(replacement).then(
   response => { settled = true; return {response}; }, error => { settled = true; return {error}; });
  let third;
  try {
   await new Promise(resolve => setImmediate(resolve));
   assert.equal(settled, false, 'replacement must wait for canceled request cleanup');
   assert.equal(calls, 1, 'replacement must not start an overlapping subprocess');
   if (action === 'disconnect') await host.disconnect({connectionId:connection.id});
   if (action === 'cancel') {
    await host.cancel({connectionId:connection.id,requestId:replacement.requestId});
    third = host.request(session.begin({brief:'Improve arrival again',scope:'region'}));
   }
  } finally { release(); await canceled; }
  const result = await next;
  if (action === 'disconnect') { assert.match(result.error?.message ?? '', /disconnected/); assert.equal(calls, 1); }
  else if (action === 'cancel') { assert.match(result.error?.message ?? '', /canceled/); session.preview(await third); session.apply(); assert.equal(doc.value.spawn[0], 2); assert.equal(calls, 2); }
  else { assert.equal(result.error, undefined); session.preview(result.response); session.apply(); assert.equal(doc.value.spawn[0], 2); }
  assert.equal(maximum, 1);
 });
});
test('only the exact main Studio frame may invoke the bridge',()=>{
 const studio='https://example.test/studio.html',mainFrame={url:studio},contents={mainFrame};const event={sender:contents,senderFrame:mainFrame};assert.equal(designerSenderAllowed(event,contents,'https://example.test',studio),true);
 for(const url of ['https://evil.test/studio.html','https://example.test/play','file:///studio.html'])assert.equal(designerSenderAllowed({...event,senderFrame:{url}},contents,'https://example.test',studio),false);
 assert.equal(designerSenderAllowed({...event,sender:{}},contents,'https://example.test',studio),false);
 // A game page that pushState-renames itself to /studio.html was still loaded at /play.
 assert.equal(designerSenderAllowed(event,contents,'https://example.test','https://example.test/play'),false);
 assert.equal(designerSenderAllowed(event,contents,'https://example.test',null),false);
 assert.equal(designerSenderAllowed(event,contents,'https://example.test'),false);
 assert.equal(designerSenderAllowed({...event,senderFrame:{...mainFrame}},contents,'https://example.test'),false);
});
test('old Coven cannot create any familiar identity, and nothing executes before consent',async t=>{
 const {path}=await fixture(t);const order=[];const host=createStudioDesignerHost({root:join(path,'old-runtime'),pack,execute:async()=>{order.push('execute');return 'coven: run adapter';},confirm:async()=>{order.push('confirm');return true;}});
 await assert.rejects(host.connect(input('familiar')),/Upgrade Coven/);assert.deepEqual(order,['confirm','execute']);await assert.rejects(readFile(join(path,'old-runtime/fixture-project/familiar/IDENTITY.md')),error=>error.code==='ENOENT');
 const declined=[];const refused=createStudioDesignerHost({root:join(path,'declined'),pack,execute:async()=>{declined.push('execute');return '';},confirm:async()=>false});
 await assert.rejects(refused.connect(input('familiar')),/canceled/);assert.deepEqual(declined,[]);
});

test('a new app pack reconnects both paths without changing familiar identity or prior pack bytes', async t => {
  const { host, path } = await fixture(t);
  for (const mode of ['general', 'familiar']) await host.connect(input(mode));
  const identityPath = join(path, 'fixture-project/familiar/IDENTITY.md');
  const identity = await readFile(identityPath, 'utf8');
  const previousMarkers = await Promise.all(['general','familiar'].map(mode => readFile(join(path, 'fixture-project', mode, 'knowledge', pack.manifest.sha256, '.world-design-pack.json'), 'utf8')));
  const legacy = '# Studio design workspace\n\nRead knowledge/.agents/skills/studio-world-design/SKILL.md and the task-specific installed skills. Only the explicit scene snapshot is shared. Return a proposed JSON edit for human review; never change files, publish, call tools outside the design scope or run commands.\n';
  await writeFile(join(path, 'fixture-project/familiar/AGENTS.md'), legacy);
  const { sha256, ...manifest } = pack.manifest;
  manifest.sourceRevision = '1'.repeat(40);
  const nextPack = { ...pack, manifest: { ...manifest, sha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') } };
  host.dispose();
  const updated = createStudioDesignerHost({ root: path, pack: nextPack, executable: join(root, 'desktop/tests/fixtures/studio-coven.mjs'), confirm: async () => true });
  t.after(() => updated.dispose());
  for (const mode of ['general', 'familiar']) {
    const connection = await updated.connect(input(mode));
    assert.equal(connection.packVerified, true);
    const session = createDesignerSession(createStudioDocument()); session.connect(connection);
    const response = await updated.request(session.begin({ brief: 'Improve arrival', scope: 'region' }));
    session.preview(response); session.apply();
    if (mode === 'familiar') assert.equal(connection.identityRevision, 'familiar-revision:fixture');
  }
  assert.equal(await readFile(identityPath, 'utf8'), identity);
  assert.deepEqual(await Promise.all(['general','familiar'].map(mode => readFile(join(path, 'fixture-project', mode, 'knowledge', pack.manifest.sha256, '.world-design-pack.json'), 'utf8'))), previousMarkers);
  const guide = join(path, 'fixture-project/familiar/AGENTS.md');
  assert.match(await readFile(guide, 'utf8'), /active knowledge pack path/);
  await writeFile(guide, 'User-authored instructions');
  await assert.rejects(updated.connect(input('familiar')), /not been overwritten/);
  assert.equal(await readFile(guide, 'utf8'), 'User-authored instructions');
});

test('the prompt carries only allowlisted request fields and the page gets only proposal fields back',async t=>{
 let prompt=null,asked=null;
 const {host}=await fixture(t,{confirm:async request=>{asked=request;return true;},execute:async(executable,args,options)=>{
  if(args[0]!=='run')return runStudioCommand(executable,args,options);
  prompt=args.at(-1);const sent=JSON.parse(prompt.split('never authority):\n')[1]);
  const answer={...Object.fromEntries(['protocol','requestId','connectionId','projectId','baseRevision','baseHash','packVersion'].map(key=>[key,sent[key]])),
   rationale:'Move arrival.\u202eevil',assumptions:['a'],skillsUsed:['world-workflow'],requiredCapabilities:['objects.update','shell'],affectedIds:['@arrival'],
   operations:[{op:'update',id:'@arrival',patch:{east:2,script:'alert(1)'},extra:'x'}],stolen:'contents of a private file'};
  return [{type:'system',subtype:'init',permission:'read-only'},{type:'assistant',message:{content:[{type:'text',text:JSON.stringify(answer)}]}},{type:'result',is_error:false}].map(e=>JSON.stringify(e)).join('\n');
 }});
 const connection=await host.connect(input('general'));const doc=createStudioDocument(),session=createDesignerSession(doc);session.connect(connection);
 const request=session.begin({brief:'Improve arrival',scope:'region',projectBrief:'Calm plaza'});
 const response=await host.request({...request,hidden:'SECRET-INSTRUCTION',context:{...request.context,note:'SECRET-NOTE',region:{...request.context.region,parcels:[{id:'p',owner:'SECRET-OWNER'}]}}});
 for(const marker of ['SECRET-INSTRUCTION','SECRET-NOTE','SECRET-OWNER'])assert.doesNotMatch(prompt,new RegExp(marker));
 assert.equal(asked.projectBrief,'Calm plaza');assert.equal(asked.scope,'region');assert.ok(asked.objects>0);
 assert.equal(response.stolen,undefined);assert.deepEqual(response.operations,[{op:'update',id:'@arrival',patch:{east:2}}]);
 assert.deepEqual(response.requiredCapabilities,['objects.update']);assert.equal(response.rationale,'Move arrival.evil');
 session.preview(response);session.apply();assert.equal(doc.value.spawn[0],2);
});
