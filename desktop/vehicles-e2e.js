import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const profile=await mkdtemp(join(tmpdir(),'river-oaks-vehicles-'));
const env={...process.env,RIVER_OAKS_DEV_URL:'http://127.0.0.1:5174/?motion-debug=1'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:['.',`--user-data-dir=${profile}`],env,timeout:30000}),checks=[],errors=[];
let page;
try{
 page=await app.firstWindow();page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
 let source='unavailable',requests=0;
 await page.route('**/v1/chauffeur',async route=>{const p=route.request().postDataJSON();requests++;await route.fulfill({json:{schema_version:1,tick:p.tick,generation:p.generation,source,reason:source==='jev'?'accepted':'not_configured',candidate_id:source==='jev'?'slow':null,confidence:source==='jev'?.9:null}});});
 await page.locator('#loading').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.carriageDriverReady==='true'&&document.querySelector('#canvas-host').dataset.playerReady==='true');
 for(const kind of ['rolls','motorcycle']){
  await page.locator('#player-vehicle').selectOption(kind);await page.locator('#player-carriage').click();await page.locator('#player-ride').click();
  await page.waitForFunction(()=>window.__riverCarriage().riding);
  const state=await page.evaluate(()=>{const s=window.__riverCarriage();return {vehicle:s.vehicle,spinners:s.spinners.length,gaps:s.tyreClearances,position:s.placement.position};});
  assert.equal(state.vehicle,kind);assert.equal(state.spinners,kind==='rolls'?6:4);assert.ok(state.gaps.every(v=>Math.abs(v)<.006));
  source='unavailable';await page.locator('#player-chauffeur').click();await page.waitForFunction(()=>window.__riverCarriage().chauffeur.label.includes('API key'));
  const held=await page.evaluate(()=>window.__riverCarriage().placement.position);await page.waitForTimeout(300);const after=await page.evaluate(()=>window.__riverCarriage().placement.position);assert.ok(Math.hypot(after[0]-held[0],after[2]-held[2])<.01);
  source='jev';await page.waitForFunction(()=>window.__riverCarriage().chauffeur.source==='jev');await page.waitForFunction(start=>{const p=window.__riverCarriage().placement.position;return Math.hypot(p[0]-start[0],p[2]-start[2])>.15;},held);
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyS');await page.waitForFunction(()=>!window.__riverCarriage().chauffeur.active);
  await page.screenshot({path:`output/playwright/desktop-${kind}.png`});await page.locator('#player-ride').click();await page.waitForFunction(()=>!window.__riverCarriage().riding);
  checks.push(`${kind}: select, summon, board, wheel contact, API hold, mocked Jev drive, manual takeover, exit`);
 }
 console.log('Checking companion flight');await page.locator('#player-companion').click();await page.waitForFunction(()=>window.__riverCarriage().companion.mode==='walking');
 await page.waitForTimeout(1800);await page.locator('#player-flight').click();await page.waitForFunction(()=>window.__riverCarriage().pose.flying);
 await page.waitForFunction(()=>window.__riverCarriage().companion.mode==='flying'&&window.__riverCarriage().wingsVisible);
 const flight=await page.evaluate(()=>{const s=window.__riverCarriage();return {prince:s.princePosition,player:s.pose.position};});
 assert.ok(flight.prince.every(Number.isFinite));await page.waitForTimeout(1800);await page.screenshot({path:'output/playwright/desktop-jev-flight.png'});
 console.log('Checking companion landing');await page.locator('#player-flight').click();await page.waitForFunction(()=>!window.__riverCarriage().pose.flying);await page.waitForFunction(()=>window.__riverCarriage().companion.mode==='walking');
 checks.push('Prince Jev: dismount, takeoff, magical wings, bubble follow, gentle landing');
 assert.ok(requests>=4);assert.deepEqual(errors,[]);await writeFile('data/reports/desktop-vehicles.json',JSON.stringify({checks,requests,errors,api:'mocked provider; live credentials required',createdAt:new Date().toISOString()},null,2)+'\n');console.log(checks);
}catch(error){if(page){console.log(await page.evaluate(()=>{const s=window.__riverCarriage?.();return s?{companion:s.companion,prince:s.princePosition,pose:s.pose,vehicle:s.vehicle}:null;}));await page.screenshot({path:'output/playwright/desktop-vehicle-failure.png'}).catch(()=>{});}throw error;}finally{await app.close();await rm(profile,{recursive:true,force:true});}
