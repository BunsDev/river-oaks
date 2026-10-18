async page => {
  const checks=[],errors=[];const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{
    window.__portraitTargets=[];const original=WebGL2RenderingContext.prototype.renderbufferStorageMultisample;
    WebGL2RenderingContext.prototype.renderbufferStorageMultisample=function(target,samples,format,width,height){window.__portraitTargets.push([width,height]);return original.call(this,target,samples,format,width,height);};
  });
  await page.goto('http://127.0.0.1:5173/');await page.locator('#loading').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  if(!await page.locator('.visit-tools').evaluate(n=>n.open))await page.locator('.visit-tools-toggle').click();
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  const open=async()=>{await page.getByRole('button',{name:'Open character studio',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cs-preview').dataset.ready==='true');};
  await open();const studio=page.locator('.character-studio'),capture=studio.getByRole('button',{name:'Create 4K portrait',exact:true}),link=studio.getByRole('link',{name:'Download PNG',exact:true});
  await studio.locator('[data-character=sable]').click();await page.waitForFunction(()=>document.querySelector('.cs-preview').dataset.appearance==='sable-human'&&document.querySelector('.cs-preview').dataset.ready==='true');
  await studio.getByRole('radio',{name:'Rose silk',exact:true}).click();await studio.getByRole('radio',{name:'Espresso',exact:true}).click();
  const download=async file=>{
    await capture.click();await link.waitFor({state:'visible'});const next=page.waitForEvent('download');await link.click();await(await next).saveAs(file);
    const bytes=await(await import('node:fs/promises')).readFile(file);check(bytes.readUInt32BE(16)===3840&&bytes.readUInt32BE(20)===2160,`${file.split('/').pop()} is a native-size PNG`);
  };
  await download('output/playwright/character-portrait-human-4k.png');
  check(await link.getAttribute('data-appearance')==='sable-human'&&await link.getAttribute('data-palette')==='rose','Portrait retains the edited canonical identity');
  check(await page.evaluate(()=>window.__portraitTargets.some(([w,h])=>w===3840&&h===2160)),'GPU allocated an actual 3840x2160 multisample framebuffer');
  await page.evaluate(async()=>{
    const blob=await(await fetch(document.querySelector('[data-download]').href)).blob(),bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();window.__portraitFirst=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  });
  await download('output/playwright/character-portrait-human-repeat-4k.png');
  const comparison=await page.evaluate(async()=>{
    const blob=await(await fetch(document.querySelector('[data-download]').href)).blob(),bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const current=ctx.getImageData(0,0,canvas.width,canvas.height).data,first=window.__portraitFirst;let max=0,total=0,changed=0;
    for(let i=0;i<first.length;i++){const difference=Math.abs(first[i]-current[i]);max=Math.max(max,difference);total+=difference;if(difference)changed++;}delete window.__portraitFirst;return {max,mean:total/current.length,changed};
  });
  check(comparison.max<=1&&comparison.mean<=.01,'Repeated fixed-preset capture is stable on this browser/GPU');
  await studio.locator('[data-compare]').click();
  check(!await link.isVisible(),'Comparing the original removes the edited portrait');
  await studio.locator('[data-compare]').click();
  check(!await link.isVisible(),'Returning to the draft cannot restore an obsolete portrait');
  await studio.locator('input[name=cs-form][value=beast]').check();await page.waitForFunction(()=>document.querySelector('.cs-preview').dataset.appearance==='woman-casual'&&document.querySelector('.cs-preview').dataset.ready==='true');
  check(!await link.isVisible(),'Changing identity removes the stale portrait');await download('output/playwright/character-portrait-fox-4k.png');
  check(await link.getAttribute('data-appearance')==='woman-casual','Fox portrait preserves beast identity');
  // Delay a real PNG callback to exercise closing/reopening during encoding.
  await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;window.__restorePortraitEncoder=()=>HTMLCanvasElement.prototype.toBlob=original;HTMLCanvasElement.prototype.toBlob=function(callback,...args){return original.call(this,blob=>{if(this.width===3840&&this.height===2160)window.__finishPortrait=()=>callback(blob);else callback(blob);},...args);};});
  await capture.click();await page.waitForFunction(()=>typeof window.__finishPortrait==='function');
  await studio.getByRole('radio',{name:'Lagoon',exact:true}).click();
  check(await capture.isDisabled(),'Editing during encoding preserves the in-flight capture lock');
  await studio.getByRole('button',{name:'Close character studio',exact:true}).click();await open();
  check(await capture.isDisabled(),'Reopening during encoding cannot start another capture');
  await page.evaluate(()=>{window.__restorePortraitEncoder();window.__finishPortrait();});
  await page.waitForFunction(()=>!document.querySelector('[data-portrait]').disabled);
  check(!await link.isVisible(),'Late encoding cannot publish a portrait into a reopened Studio');
  // Devices without the target size fail explicitly; no low-resolution fallback.
  await page.evaluate(()=>{const original=WebGL2RenderingContext.prototype.getParameter;window.__restorePortraitLimits=()=>WebGL2RenderingContext.prototype.getParameter=original;WebGL2RenderingContext.prototype.getParameter=function(name){return name===this.MAX_RENDERBUFFER_SIZE?2048:original.call(this,name);};});
  await capture.click();await studio.getByRole('status').filter({hasText:'Native 4K capture is unavailable'}).waitFor();
  check(!await link.isVisible()&&!await capture.isDisabled(),'Unsupported 4K hardware shows a recoverable error without an upscaled export');
  await page.evaluate(()=>window.__restorePortraitLimits());await page.keyboard.press('Escape');
  check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);
  return {passed:true,checks,comparison,preset:'garden-front-v1',scope:'Native export dimensions and current-browser stability, not approved golden or physical-device acceptance'};
}
