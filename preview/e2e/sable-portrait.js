// Capture the shipped Sable renderer, never the supplied concept image.
import { startBrowserFixture } from './fixture-server.js';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const fixture=await startBrowserFixture();
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{args:['--use-angle=metal']}:{})});
  const page=await browser.newPage({viewport:{width:360,height:448},reducedMotion:'reduce'});
  await page.goto(`${fixture.origin}/e2e/fixtures/jevica.html?appearance=woman-casual`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  await page.evaluate(()=>{
    const f=window.jevicaFixture;f.render('portrait');
    f.camera.position.set(.20,1.62,1.10);f.camera.lookAt(0,1.59,0);f.renderer.render(f.scene,f.camera);
  });
  await page.locator('canvas').screenshot({path:root+'preview/public/assets/characters/sable-portrait.png'});
}finally{await browser?.close();await fixture.close();}
