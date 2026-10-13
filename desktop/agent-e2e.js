import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as socketServer } from 'node:net';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(join(root,'.runtime'),{recursive:true});
const profile=await mkdtemp(join(root,'.runtime/agent-native-'));
const report={scope:'Real development Electron IPC, streaming and subprocess transport with a synthetic Claude/Codex executable, local auth fixture and automated native consent. No live provider call.',checks:[]};
let vite,app,page;
const errors=[];
const check=name=>{report.checks.push(name);console.log(`✓ ${name}`);};
const count=async()=>Number((await page.locator('#studio-count').innerText()).split(' ')[0]);
try {
 const socket=socketServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 Object.assign(process.env,{RIVER_OAKS_ACCEPTANCE_FIXTURE:'1',RIVER_OAKS_DEV_AUTH:'local',RIVER_OAKS_DEV_TOWN:'on',RIVER_OAKS_DEV_TOWN_PORT:String(port),MODERATION_FILE:join(profile,'moderation.json'),WAITLIST_FILE:join(profile,'waitlist.json')});
 const {createServer}=await import('vite');vite=await createServer({configFile:join(root,'preview/vite.config.js'),server:{port:0}});await vite.listen();
 const cli=join(root,'desktop/tests/fixtures/studio-agent-cli.mjs'),log=join(profile,'agent-argv.jsonl');
 const entry=`http://127.0.0.1:${vite.httpServer.address().port}/`,env={...process.env,RIVER_OAKS_DEV_URL:entry,RIVER_OAKS_AGENT_CLAUDE:cli,RIVER_OAKS_AGENT_CODEX:cli,AGENT_FIXTURE_LOG:log};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({args:[root,`--user-data-dir=${profile}`],env,timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.waitForURL(entry);
 assert.deepEqual(await page.evaluate(()=>[typeof window.studioAgent,typeof window.worldDesigner]),['undefined','undefined']);
 // pushState can rename the game page, but the bridges were decided at load and main tracks the committed URL.
 assert.deepEqual(await page.evaluate(()=>{history.pushState(null,'','/studio.html');return [typeof window.studioAgent,typeof window.worldDesigner];}),['undefined','undefined']);
 check('agent and designer bridges are absent on the game page, even after pushState to /studio.html');
 await app.evaluate(({dialog,Menu})=>{globalThis.__agentConsents=0;dialog.showMessageBox=async()=>{globalThis.__agentConsents++;return {response:1};};Menu.getApplicationMenu().items.find(i=>i.label==='Game').submenu.items.find(i=>i.label==='World Studio').click();});
 await page.waitForFunction(()=>document.body.dataset.studioReady==='true');
 // Without a recent click or key press, page script cannot start agent work.
 const unattended=await page.evaluate(()=>new Promise(resolve=>setTimeout(()=>window.studioAgent.send({chatId:'c',requestId:'r',providerId:'claude',modelId:'claude-haiku-5-5',mode:'ask',message:'hi',context:null}).then(()=>resolve('sent'),error=>resolve(error.message)),5500)));
 assert.match(unattended,/click or key press/);
 check('a send without a recent user gesture is refused before reaching the host');
 // A blocked navigation must not switch the bridges off (did-start-navigation fires before will-navigate).
 await page.evaluate(()=>{location.href='https://example.invalid/';});await page.waitForTimeout(500);
 assert.equal(new URL(page.url()).pathname,'/studio.html');
 assert.equal((await page.evaluate(()=>window.studioAgent.catalog())).providers.length,2);
 check('a blocked navigation leaves Studio and its bridges working');
 // Main checks the sender URL itself: a Studio page that pushState-renames itself loses access until it returns.
 assert.match(await page.evaluate(async()=>{history.pushState(null,'','/play');try{await window.studioAgent.catalog();return 'allowed';}catch(error){return error.message;}}),/limited/);
 assert.equal((await page.evaluate(async()=>{history.pushState(null,'','/studio.html');return (await window.studioAgent.catalog()).providers.length;})),2);
 check('main refuses a Studio document renamed with pushState, end to end');
 const before=await count();
 await page.getByLabel('Ask the World Studio agent').fill('Frame the arrival with trees');await page.getByLabel('Ask the World Studio agent').press('Enter');
 await page.getByRole('button',{name:'Apply as one edit'}).waitFor();
 assert.match(await page.locator('.studio-agent-agent').first().innerText(),/Two trees frame the arrival/);
 await page.getByRole('button',{name:'Apply as one edit'}).click();assert.equal(await count(),before+1);
 await page.locator('#studio-undo').click();assert.equal(await count(),before);
 check('Claude: pill opens chat, streamed reply, validated proposal, apply and undo');
 await page.locator('.studio-agent [data-agent-edit-mode]').selectOption('allow');
 await page.getByLabel('Agent model').selectOption('codex:default');
 await page.getByRole('button',{name:'Review the arrival sightline'}).click();
 await page.locator('.studio-agent-edit-status').filter({hasText:'Applied automatically'}).waitFor();assert.equal(await count(),before+1);
 check('Codex: suggested next step sends, Allow mode applies one edit');
 const calls=(await readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
 assert.equal(calls.length,2);assert.equal(calls[0][0],'-p');assert.equal(calls[1][0],'exec');assert.match(calls[1].at(-1),/CONVERSATION SO FAR:\nUSER: Frame the arrival/);
 assert.equal(await app.evaluate(()=>globalThis.__agentConsents),2);
 check('host ran each fixed CLI once, kept chat history, and asked consent once per provider');
 // One click fanning out into many sends still runs the CLI only once.
 await page.evaluate(()=>{const button=document.createElement('button');button.id='burst';button.textContent='burst';button.style.cssText='position:fixed;top:0;left:0;z-index:99';
  button.onclick=()=>{window.__burst=Promise.allSettled(Array.from({length:12},(_,i)=>window.studioAgent.send({chatId:`burst-${i}`,requestId:`burst-r${i}`,providerId:'claude',modelId:'claude-haiku-5-5',mode:'ask',message:'hi',context:null})))
   .then(results=>results.filter(r=>r.status==='fulfilled').length);};document.body.append(button);});
 await page.locator('#burst').click();const accepted=await page.evaluate(()=>window.__burst);
 const after=(await readFile(log,'utf8')).trim().split('\n').length;
 assert.equal(accepted,1);assert.equal(after,calls.length+1);
 await page.evaluate(()=>document.querySelector('#burst').remove());
 check('a burst of sends from one click runs the CLI once');
 await page.getByRole('button',{name:'New chat'}).click();assert.equal(await page.locator('.studio-agent-msg').count(),0);
 await page.locator('.studio-agent').press('Escape');assert.equal(await page.locator('.studio-agent').getAttribute('data-open'),'false');
 check('new chat clears the log and Escape collapses to the pill');
 // Furnished template edits use the same real IPC/CLI path and scope fence.
 await page.locator('#studio-save').click();
 await page.locator('#studio-templates').click();
 await page.getByRole('button',{name:'Use Courtyard House',exact:true}).click();
 await page.locator('[data-item="living-sofa"]').click();
 await page.getByRole('button',{name:'Open agent chat'}).click();
 await page.locator('[data-agent-edit-mode]').selectOption('ask');
 await page.getByRole('button',{name:'Scene context'}).click();
 await page.locator('input[name="studio-agent-scope"][value="selection"]').check();
 await page.getByLabel('Message the World Studio agent').fill('Warm the living room');await page.getByLabel('Message the World Studio agent').press('Enter');
 await page.locator('.studio-agent-edit-status').filter({hasText:'scope'}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'Finish',exact:true}).inputValue(),'fabric');
 check('selected furnishing scope rejects a CLI proposal changing unshared lighting');
 await page.locator('input[name="studio-agent-scope"][value="region"]').check();
 await page.getByLabel('Message the World Studio agent').fill('Warm the entire living room');await page.getByLabel('Message the World Studio agent').press('Enter');
 await page.getByRole('button',{name:'Apply as one edit'}).click();
 assert.equal(await page.getByRole('combobox',{name:'Finish',exact:true}).inputValue(),'sage');
 await page.locator('[data-item="@environment"]').click();assert.equal(await page.getByRole('combobox',{name:'Lighting',exact:true}).inputValue(),'evening');
 await page.locator('#studio-undo').click();assert.equal(await page.getByRole('combobox',{name:'Lighting',exact:true}).inputValue(),'warm');
 await page.locator('[data-item="living-sofa"]').click();assert.equal(await page.getByRole('combobox',{name:'Finish',exact:true}).inputValue(),'fabric');
 check('furnished agent batch changes finish and lighting and undoes both in one edit');
 const spaceExport=join(profile,'space.json');
 await app.evaluate(({session},destination)=>{session.defaultSession.once('will-download',(event,item)=>{
   globalThis.spaceExport={blocked:event.defaultPrevented};if(event.defaultPrevented)return;
   globalThis.spaceExport.options=item.getSaveDialogOptions();item.setSavePath(destination);
   item.once('done',(_event,state)=>{globalThis.spaceExport.state=state;});
 });},spaceExport);
 await page.locator('#studio-export').click();
 const deadline=Date.now()+10000;let receipt;
 do{receipt=await app.evaluate(()=>globalThis.spaceExport);if(receipt?.blocked||receipt?.state)break;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);
 assert.equal(receipt?.blocked,false);assert.equal(receipt?.state,'completed');assert.equal(receipt.options.filters[0].name,'Space JSON');
 const exported=JSON.parse(await readFile(spaceExport,'utf8'));assert.equal(exported.document_type,'studio-space');assert.equal(exported.lighting,'warm');
 check('native space export passes the real download policy and preserves the local document');

 // Deterministic renderer race: host cancellation arrives after a queued success.
 await page.evaluate(async()=>{
   const {mountAgentChat}=await import('/src/studio/agent-chat.js');
   const {createStudioDocument}=await import('/src/studio/document.js');
   const {createSpace}=await import('/src/studio/space-templates.js');
   const host=document.createElement('div');host.id='agent-race-fixture';host.style.cssText='position:fixed;inset:40px;z-index:100;background:white';document.body.append(host);
   const doc=createStudioDocument(createSpace('house'));window.agentRace={doc};
   const bridge={catalog:async()=>({providers:[{id:'fixture',name:'Fixture',available:true,models:[{id:'local',label:'Fixture'}]}]}),send:()=>new Promise(resolve=>{window.agentRace.resolve=resolve;}),cancel:async()=>{},reset:async()=>{}};
   window.agentRace.chat=mountAgentChat(host,{doc,selected:()=>null,apply:()=>{},bridge,storage:{getItem:()=>null,setItem(){}}});window.agentRace.chat.open();
 });
 const race=page.locator('#agent-race-fixture');await race.locator('[data-agent-model]').selectOption('fixture:local');
 await race.locator('[data-agent-edit-mode]').selectOption('allow');
 await race.getByLabel('Message the World Studio agent').fill('Change the sofa');await race.getByLabel('Message the World Studio agent').press('Enter');
 await race.getByRole('button',{name:'Stop the reply'}).click();
 await page.evaluate(()=>{window.agentRace.resolve({text:'```studio-edit\n{"operations":[{"op":"update","id":"living-sofa","patch":{"finish":"sage"}}]}\n```'});});
 await race.getByRole('button',{name:'Send',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.agentRace.doc.value.objects.find(o=>o.id==='living-sofa').finish),'fabric');
 await page.evaluate(()=>{window.agentRace.chat.dispose();document.querySelector('#agent-race-fixture').remove();delete window.agentRace;});
 check('Stop locally fences a queued successful reply even in Allow mode');
 await page.locator('#studio-save').click();
 assert.equal(typeof await page.evaluate(()=>window.require),'undefined');assert.deepEqual(errors,[]);
 report.status='passed';
} catch(error){report.status='failed';report.error=error.stack;report.pageErrors=errors;if(page&&!page.isClosed()){await mkdir(join(root,'output/playwright'),{recursive:true});await page.screenshot({path:join(root,'output/playwright/world-studio-agent-failure.png')}).catch(()=>{});}process.exitCode=1;console.error(error.stack);}
finally{
 console.log('Closing Studio acceptance fixture');
 if(report.status==='failed')await app?.evaluate(({app})=>app.exit(1)).catch(()=>{});
 await app?.close().catch(()=>{});console.log('Studio Electron closed');
 await vite?.close();console.log('Studio fixture server closed');
 await rm(profile,{recursive:true,force:true});await mkdir(join(root,'.runtime/agent'),{recursive:true});
 await writeFile(join(root,'.runtime/agent/studio-agent-native.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
