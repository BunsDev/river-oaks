// Run from the repository root. These readbacks document rendered crowds;
// the two sampled frames are for capture readiness, not timing claims.
import {chromium} from 'playwright';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {platform} from 'node:os';
import {startBrowserFixture} from '../../../preview/e2e/fixture-server.js';
import {holdBrowserLock} from '../../../scripts/browser-lock.mjs';
import {captureProvenance} from '../../../scripts/character-fidelity-evidence.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const output=new URL('./',import.meta.url), sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const unlock=await holdBrowserLock('Character fidelity crowd captures 517');
const provenance=await captureProvenance(root);
const report={status:'running',startedAt:new Date().toISOString(),provenance,
  scriptSha256:sha(await readFile(new URL(import.meta.url))),captures:[],
  method:'Existing fidelity fixture, high tier, reduced motion, 1920x1080 DPR1. Playwright screenshots the canvas after the final render. Two sampled frames establish capture readiness, not performance. Camera, lights and grid come from crowdStage(count>1) in the hashed fixture. These isolated scenes do not exercise town occlusion.'};
let fixture,browser;
try{
  fixture=await startBrowserFixture();
  browser=await chromium.launch({headless:true,args:platform()==='darwin'?['--use-angle=metal','--ignore-gpu-blocklist']:[]});
  report.browser=browser.version();
  const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,reducedMotion:'reduce'});
  await context.addCookies([{name:'fixture_session',value:'owner',url:fixture.origin}]);
  const page=await context.newPage();page.setDefaultTimeout(180000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixture.origin+'/e2e/fixtures/character-fidelity.html');
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  report.environment=await page.evaluate(()=>window.fidelityFixture.environment);
  for(const appearance of ['morgan-human','imani-human'])for(const count of [8,24]){
    const result=await page.evaluate(async({appearance,count})=>{
      const frames=await window.fidelityFixture.frames(appearance,{count,realism:'high',warmup:0,samples:2});
      return {census:frames.census,render:frames.render};
    },{appearance,count});
    const bytes=await page.locator('canvas').screenshot(),file=`${appearance}-crowd-${count}.png`;
    if(bytes.readUInt32BE(16)!==1920||bytes.readUInt32BE(20)!==1080)throw new Error('Wrong crowd capture dimensions');
    await writeFile(new URL(file,output),bytes);
    report.captures.push({appearance,count,file,sha256:sha(bytes),bytes:bytes.length,cameraPreset:'crowdStage(count>1)',census:result.census,render:result.render});
  }
  if(errors.length)throw new Error(errors.join('; '));
  if((await captureProvenance(root)).sha256!==provenance.sha256)throw new Error('Runtime inputs changed during crowd capture');
  report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;}
finally{
  await browser?.close();await fixture?.close();unlock();
  report.finishedAt=new Date().toISOString();
  await writeFile(new URL('../../../data/reports/character-fidelity-crowds-517.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(report.status);
}
