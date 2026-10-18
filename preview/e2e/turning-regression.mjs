import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
const release=await holdBrowserLock('Cody turning regression');
let fixture,browser;
const output='output/playwright/turning';await mkdir(output,{recursive:true});
try {
 fixture=await startBrowserFixture({env:{VITE_SHARED_SOFTWARE_RENDERING:'1'}});
 browser=await chromium.launch({headless:true,args:process.platform==='darwin'?['--use-angle=metal']:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const makePage=async()=>{const page=await browser.newPage({viewport:{width:1600,height:900}});page.setDefaultTimeout(60000);
 await page.context().addCookies([{name:'fixture_session',value:'owner',url:fixture.origin}]);
 page.on('pageerror',error=>console.error(error.message));return page;};
 const baselineRef=process.env.RIVER_OAKS_TURNING_BASELINE??'1d8740ada63aee0062e8471a5ffd6d9323517108';
 const baseline=execFileSync('git',['show',`${baselineRef}:preview/src/foot-placement.js`],{encoding:'utf8'}),runs=[];
 for(const variant of ['before','after'])for(const speed of [0,.04,1.1]) {
  const page=await makePage();
  if(variant==='before')await page.route('**/src/foot-placement.js',async route=>{const response=await route.fetch(),transformed=await response.text();const imports=transformed.match(/^import[^\n]+/gm).join('\n');await route.fulfill({response,body:imports+'\n'+baseline.replace(/^import[^\n]+\n/gm,'')});});else await page.unroute('**/src/foot-placement.js');
  await page.goto(`${fixture.origin}/e2e/fixtures/motion.html?slope=0&hero=jevica`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const result=await page.evaluate(async({speed,variant})=>{
   const THREE={Vector3:window.motionFixture.camera.position.constructor};
   const f=window.motionFixture;let distance=0,x=0,z=0,maxTwist=0,maxError=0,supportFailures=0;
   const perRig={};
   if(variant==='after'&&f.avatars.some(a=>a.feet.some(l=>!l.forwardAxis)))throw Error('After run did not load patched foot placement');
   for(const a of f.avatars)for(const leg of a.feet)if(!leg.forwardAxis)leg.forwardAxis=new THREE.Vector3(0,0,1).applyQuaternion(a.object.quaternion).applyQuaternion(leg.orientation.clone().invert());
   for(let frame=1;frame<=180;frame++){
    const yaw=Math.PI*Math.min(1,Math.max(0,frame/60-.5)/.3);distance+=speed/60;x+=Math.sin(yaw)*speed/60;z+=Math.cos(yaw)*speed/60;
    for(const [i,a]of f.avatars.entries()){
     a.object.position.set(x+(i-2.5)*1.6,0,z);a.object.rotation.y=yaw;a.update(frame*1000/60,'continue',false,{speed,distance,heading:yaw},()=>0);
     a.rig.model.updateMatrixWorld(true);if(!a.feet.some(l=>l.contact))supportFailures++;
     for(const leg of a.feet){
      const hip=leg.thigh.getWorldPosition(new THREE.Vector3()),ankle=leg.foot.getWorldPosition(new THREE.Vector3()),knee=leg.calf.getWorldPosition(new THREE.Vector3());
      const axis=ankle.clone().sub(hip).normalize(),bend=knee.sub(hip);bend.addScaledVector(axis,-bend.dot(axis));
      const toe=leg.forwardAxis.clone().applyQuaternion(leg.ikOrientation);toe.addScaledVector(axis,-toe.dot(axis));
      const twist=bend.length()>.005&&toe.length()>.1?bend.angleTo(toe):0;
      maxTwist=Math.max(maxTwist,twist);perRig[a.profile]=Math.max(perRig[a.profile]??0,twist);maxError=Math.max(maxError,leg.error);
     }
    }
    if(frame===43){f.camera.position.set(x+7,4.5,z+10.5);f.camera.lookAt(x,.9,z);f.renderer.render(f.scene,f.camera);}
   }
   return {maxTwist,maxError,supportFailures,perRig};
  },{speed,variant});
  await page.screenshot({path:`${output}/${variant}-${speed}.png`});runs.push({variant,speed,...result});await page.context().close();
 }
 await writeFile(`${output}/receipt.json`,JSON.stringify({baselineRef,runs,browser:await browser.version()},null,2));console.log(JSON.stringify(runs));
 if(runs.filter(r=>r.variant==='after').some(r=>r.maxTwist>Math.PI/3||r.maxError>.005||r.supportFailures))throw Error('Turning acceptance failed');
} finally {await browser?.close();await fixture?.close();release();}
