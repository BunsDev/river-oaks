// Full application comparison through the existing authenticated local fixture.
// Exposes only the authored roof group in this test response, never product code.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadavg } from 'node:os';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
const release = await holdBrowserLock('Green roofs full town matched views');
let fixture,browser;
const output='output/playwright/green-roofs-town-live-delivery';
try {
  await mkdir(output,{recursive:true});
  fixture=await startBrowserFixture({env:{VITE_SHARED_SOFTWARE_RENDERING:'0'}});
  browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-angle=metal']:[]});
  const context=await browser.newContext({viewport:{width:800,height:600},deviceScaleFactor:1});
  await context.addCookies([{name:'fixture_session',value:'owner',url:fixture.origin}]);
  await context.addInitScript(()=>localStorage.setItem('river-oaks-graphics','smooth'));
  const page=await context.newPage();page.setDefaultTimeout(180000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/green-roofs.js*',async route=>{
    const response=await route.fetch(),body=await response.text();
    const marker='\n  return group;\n}';assert.ok(body.includes(marker),'test exposure matches actual module');
    await route.fulfill({response,body:body.replace(marker,'\n  globalThis.__roofComparisonGroup = group;\n  return group;\n}')});
  });
  console.log('Loading full town comparison');
  await page.goto(`${fixture.origin}/?motion-debug=1&render-audit=1`,{waitUntil:'commit'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true'&&window.__roofComparisonGroup&&window.__riverRenderAudit,null,{timeout:300000});
  const reports=[];
  for(const hour of [15,18.5])for(const station of ['street','provisional-elevated','roof-outlook-provisional-eye'])for(const mode of ['before','after']) {
    const cameraPose={position:[-2760,station==='street'?20:49,1378],target:station==='roof-outlook-provisional-eye'?[-2742,29,1340]:[-2740,station==='street'?32:33,1250],fov:58};
    await page.evaluate(({hour,mode,cameraPose})=>{
      window.__roofComparisonGroup.visible=mode==='after';
      const slider=document.querySelector('#sun-hour');slider.value=String(hour);slider.dispatchEvent(new Event('input',{bubbles:true}));
      window.__riverRenderAudit.view(cameraPose);
    },{hour,mode,cameraPose});
    const metrics=await page.evaluate(async()=>{
      for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);
      const audit=window.__riverRenderAudit; audit.start();
      const submissions=[];
      for(let i=0;i<16;i++){await new Promise(requestAnimationFrame);submissions.push(audit.graphics().render);}
      const frames=audit.stop(),graphics=audit.graphics();
      return {frames,graphics,submissions};
    });
    const name=`${station}-${hour===15?'daylight':'dusk'}-${mode}`;
    await page.screenshot({path:`${output}/${name}.png`});
    const entry={name,hour,station,mode,cameraPose,hostLoad:loadavg(),...metrics};reports.push(entry);
    console.log(JSON.stringify({name,device:entry.graphics.renderer,calls:entry.graphics.render.calls,triangles:entry.graphics.render.triangles,frames:entry.frames.frames.length}));
    assert.equal(entry.frames.overflow,false);assert.ok(entry.frames.frames.length>=12);
  }
  await page.evaluate(()=>{window.__roofComparisonGroup.visible=true;window.__riverRenderAudit.release();});
  assert.deepEqual(errors,[]);
  const names=['green-roofs.js','roof-grasses.js','roof-field-mesh.js','roof-field-boundaries.js','hermes-roof-surface.js'];
  const sources=Object.fromEntries(await Promise.all(names.map(async name=>[name,createHash('sha256').update(await readFile(`preview/src/${name}`)).digest('hex')])));
  await writeFile(`${output}/result.json`,JSON.stringify({status:'passed',sources,reports,limits:'Full local app at fixed camera, graphics preset, viewport and lighting. Before/after toggles authored roofs only. Actors continue their normal simulation. Software/shared-host frame samples are diagnostic, not target-GPU acceptance. Memory counts are persistent renderer allocations; typed-array byte inventory is separate.'},null,2));
} catch(error) {
  await writeFile(`${output}/failure.json`,JSON.stringify({status:'failed',error:error.stack},null,2)).catch(()=>{});throw error;
} finally {await browser?.close();await fixture?.close();release();}
