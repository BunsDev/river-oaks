// Review the actual local and remote renderer from eight azimuths and two
// elevations. Screenshots are evidence, not a claim of reference equivalence.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));
const output=root+'output/playwright/sable-turntable/';
await mkdir(output,{recursive:true});
process.env.VITE_SINGLE_PLAYER='true';process.env.VITE_MULTIPLAYER='off';
const vite=await createServer({configFile:root+'preview/vite.config.js',server:{port:0}});
let browser;
const evidence=[];
try{
  await vite.listen();
  browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{args:['--use-angle=metal']}:{})});
  const page=await browser.newPage({viewport:{width:720,height:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const remote of [false,true]){
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/e2e/fixtures/jevica.html?appearance=woman-casual${remote?'&remote=1':''}`);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    for(const [view,angle,elevation] of [['front',0,0],['right-quarter',45,0],['right-profile',90,0],['right-rear',135,0],['back',180,0],['left-rear',225,0],['left-profile',270,0],['left-quarter',315,0],['above',35,.35],['below',35,-.25]]){
      const result=await page.evaluate(({angle,elevation})=>{
        const f=window.jevicaFixture;f.render('portrait');
        const a=angle*Math.PI/180;
        f.camera.position.set(Math.sin(a)*1.05,1.61+elevation,Math.cos(a)*1.05);
        f.camera.lookAt(0,1.57,0);f.renderer.render(f.scene,f.camera);
        const names=[];f.avatar.object.traverse(item=>names.push(item.name));
        return {glasses:names.filter(name=>/sunglasses/i.test(name)),ears:names.filter(name=>name==='Sable ear').length,calls:f.renderer.info.render.calls,triangles:f.renderer.info.render.triangles};
      },{angle,elevation});
      assert.deepEqual(result.glasses,[]);assert.equal(result.ears,2);assert.ok(result.triangles>0);
      const name=`${remote?'remote':'local'}-${view}.png`;
      await page.locator('canvas').screenshot({path:output+name});
      evidence.push({remote,view,...result,screenshot:name});
    }
  }
  assert.deepEqual(errors,[]);
  await writeFile(output+'results.json',JSON.stringify({passed:true,views:evidence,errors},null,2)+'\n');
  console.log(`Sable turntable: ${evidence.length} rendered views passed; ${output}results.json`);
}finally{await browser?.close();await vite.close();}
