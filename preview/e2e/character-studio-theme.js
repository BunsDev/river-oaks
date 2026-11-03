async page => {
  // The Studio follows the system appearance (Settings: System, the default) and repaints while open.
  const checks=[],errors=[];const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:5173/');await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  check(await page.evaluate(()=>document.documentElement.dataset.theme)==='dark','A dark system appearance resolves the app to dark');
  if(!await page.locator('.visit-tools').evaluate(n=>n.open))await page.locator('.visit-tools-toggle').click();
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.getByRole('button',{name:'Open character studio',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.cs-preview').dataset.ready==='true');
  // Luminance of the rendered backdrop beside the pedestal and of the panel, read from a real screenshot.
  const sample=async()=>{
    await page.waitForTimeout(600);
    const box=await page.locator('.cs-preview').boundingBox(),panel=await page.locator('.cs-controls').boundingBox();
    const png=(await page.screenshot()).toString('base64');
    return page.evaluate(async({png,points})=>{
      const image=new Image();image.src=`data:image/png;base64,${png}`;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const g=canvas.getContext('2d');g.drawImage(image,0,0);
      const lum=([x,y])=>{const [r,gr,b]=g.getImageData(Math.round(x),Math.round(y),1,1).data;return Math.round(.2126*r+.7152*gr+.0722*b);};
      return {backdrop:lum(points[0]),panel:lum(points[1]),theme:document.querySelector('.cs-preview').dataset.theme};
    },{png,points:[[box.x+16,box.y+box.height*.25],[panel.x+panel.width-12,panel.y+8]]});
  };
  const dark=await sample();await page.screenshot({path:'output/playwright/character-studio-dark.png'});
  check(dark.theme==='dark'&&dark.backdrop<60&&dark.panel<60,`The Studio opens dark: ${JSON.stringify(dark)}`);
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>document.querySelector('.cs-preview').dataset.theme==='light');
  const light=await sample();await page.screenshot({path:'output/playwright/character-studio-light.png'});
  check(light.backdrop>170&&light.panel>200,`Switching the system to light repaints the open Studio: ${JSON.stringify(light)}`);
  await page.locator('[name=lighting]').selectOption('warm');
  await page.emulateMedia({colorScheme:'dark'});
  await page.waitForFunction(()=>document.querySelector('.cs-preview').dataset.theme==='dark');
  const warm=await sample();
  check(warm.backdrop<60,`Dark mode keeps a dark backdrop under warm lighting: ${JSON.stringify(warm)}`);
  await page.keyboard.press('Escape');
  check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);
  return {passed:true,checks,dark,light,warm};
}
