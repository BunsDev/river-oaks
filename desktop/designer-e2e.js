import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as socketServer } from 'node:net';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(join(root,'.runtime'),{recursive:true});
const profile=await mkdtemp(join(root,'.runtime/designer-native-'));
const report={scope:'Real development Electron IPC and subprocess transport with synthetic Coven executable, local auth fixture and automated native consent. No live provider, real familiar, external Cave pairing or production auth.',checks:[]};
let vite,app,page;
const errors=[];
const check=name=>{report.checks.push(name);console.log(`✓ ${name}`);};
try {
 const socket=socketServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 Object.assign(process.env,{RIVER_OAKS_ACCEPTANCE_FIXTURE:'1',RIVER_OAKS_DEV_AUTH:'local',RIVER_OAKS_DEV_TOWN:'on',RIVER_OAKS_DEV_TOWN_PORT:String(port),MODERATION_FILE:join(profile,'moderation.json'),WAITLIST_FILE:join(profile,'waitlist.json')});
 const {createServer}=await import('vite');vite=await createServer({configFile:join(root,'preview/vite.config.js'),server:{port:0}});await vite.listen();
 const entry=`http://127.0.0.1:${vite.httpServer.address().port}/`,env={...process.env,RIVER_OAKS_DEV_URL:entry,RIVER_OAKS_DESIGNER_COVEN:join(root,'desktop/tests/fixtures/studio-coven.mjs')};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({args:[root,`--user-data-dir=${profile}`],env,timeout:30000});page=await app.firstWindow();page.setDefaultTimeout(15000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.waitForURL(entry);assert.equal(await page.evaluate(()=>typeof window.worldDesigner),'undefined');
 await app.evaluate(({dialog,Menu})=>{dialog.showMessageBox=async()=>({response:1});Menu.getApplicationMenu().items.find(i=>i.label==='Game').submenu.items.find(i=>i.label==='World Studio').click();});
 await page.waitForFunction(()=>document.body.dataset.studioReady==='true');
 await page.getByRole('button',{name:'Add building',exact:true}).click();await page.locator('#studio-save').click();await page.locator('#studio-designer-open').click();await page.locator('[data-runtime] option').waitFor({state:'attached'});
 assert.equal(await page.locator('[data-skills] li').count(),15);
 for(const mode of ['familiar','general']){
  if(mode==='familiar')await page.locator('[data-name]').fill('Aster');await page.locator('[data-path]').selectOption(mode);await page.locator('[data-connect]').click();await page.locator('[data-connected]').waitFor({state:'visible'});
  assert.match(await page.locator('[data-identity]').innerText(),mode==='familiar'?/Studio local Coven/:/General agent/);
  if(mode==='familiar'){const projectId=await page.evaluate(()=>JSON.parse(localStorage.getItem('river-oaks-studio-designer-v1')).projectId);await page.reload();await page.waitForFunction(()=>document.body.dataset.studioReady==='true');await page.locator('#studio-designer-open').click();await page.locator('[data-runtime] option').waitFor({state:'attached'});assert.equal(await page.locator('[data-name]').inputValue(),'Aster');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('river-oaks-studio-designer-v1')).projectId),projectId);await page.locator('[data-connect]').click();await page.locator('[data-connected]').waitFor({state:'visible'});check('reload before first task preserves familiar name and project identity');}
  await page.locator('[data-brief]').fill('A calm walkable neighborhood.');await page.locator('[data-scope]').selectOption('region');await page.locator('[data-task]').fill('Improve arrival wayfinding');await page.locator('[data-send]').click();await page.locator('[data-preview]').waitFor({state:'visible'});
  await page.locator('[data-apply]').click();await page.locator('#studio-save').click();
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('river-oaks-world-studio-v1'))).region.spawn[0],2);
  await page.locator('#studio-undo').click();await page.locator('#studio-save').click();assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('river-oaks-world-studio-v1'))).region.spawn[0],0);
  check(`${mode}: setup, verified installed pack, subprocess proposal, apply, undo and save`);
  if(mode==='general'){
   await page.locator('[data-task]').fill('wait forever');await page.locator('[data-send]').click();await page.locator('[data-cancel]').click();await page.waitForFunction(()=>document.querySelector('[data-send]').disabled===false);assert.equal(await page.locator('[data-preview]').isVisible(),false);check('cancel clears pending proposal and returns usable composer');
   await page.locator('[data-task]').fill('Improve arrival');await page.locator('[data-send]').click();await page.locator('[data-preview]').waitFor({state:'visible'});
   await mkdir(join(root,'output/playwright'),{recursive:true});await page.locator('[data-apply]').scrollIntoViewIfNeeded();await page.screenshot({path:join(root,'output/playwright/world-studio-designer.png')});
   await page.locator('[data-close]').click();await page.getByRole('button',{name:'Add tree',exact:true}).click();await page.locator('#studio-designer-open').click();assert.equal(await page.locator('[data-preview]').isVisible(),false);check('manual scene edit invalidates reviewed proposal');
  }
  await page.locator('[data-disconnect]').click();await page.locator('[data-setup]').waitFor({state:'visible'});
 }
 await page.locator('[data-connect]').click();await page.locator('[data-connected]').waitFor({state:'visible'});check('reconnect succeeds with identical existing pack');
 await page.locator('[data-close]').press('Escape');assert.equal(await page.locator('.studio-designer').isVisible(),false);assert.equal(await page.locator('#studio-designer-open').evaluate(node=>node===document.activeElement),true);
 await page.locator('#studio-save').click();await page.reload();await page.waitForFunction(()=>document.body.dataset.studioReady==='true');await page.locator('#studio-designer-open').click();assert.equal(await page.locator('[data-brief]').inputValue(),'A calm walkable neighborhood.');assert.equal(await page.locator('[data-connected]').isVisible(),false);check('reload restores project brief and draft but never claims stale connection');
 const stored=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([key])=>key.includes('studio'))));assert.equal(JSON.stringify(stored).includes('fixture-ledger'),false);assert.equal(typeof await page.evaluate(()=>window.require),'undefined');assert.deepEqual(errors,[]);
 report.status='passed';
} catch(error){report.status='failed';report.error=error.stack;report.pageErrors=errors;if(page&&!page.isClosed()){report.page=await page.evaluate(()=>({url:location.href,ready:document.body.dataset.studioReady??null,status:document.querySelector('[role=status]')?.textContent??null,designerStatus:document.querySelector('[data-state]')?.textContent??null})).catch(()=>null);await mkdir(join(root,'output/playwright'),{recursive:true});await page.screenshot({path:join(root,'output/playwright/world-studio-designer-failure.png')}).catch(()=>{});}process.exitCode=1;console.error(error.stack);}
finally{if(app)await app.evaluate(({app})=>app.exit()).catch(()=>{});await app?.close().catch(()=>{});await vite?.close();await rm(profile,{recursive:true,force:true});await mkdir(join(root,'.runtime/agent'),{recursive:true});await writeFile(join(root,'.runtime/agent/studio-designer-native.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
