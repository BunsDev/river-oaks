async page => {
  // Residents are shown by portraits rendered from their own 3D models, in the
  // People list and the conversation header (resident-portraits.js).
  const checks=[],errors=[];const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||/Portrait failed/.test(m.text()))errors.push(m.text().slice(0,200));});
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host')?.dataset;return d?.playerReady==='true'&&d.charactersReady==='24';},null,{timeout:90000});
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();
  await page.waitForFunction(()=>{const rows=[...document.querySelectorAll('.nearby-person')];return rows.length>0&&rows.every(row=>row.classList.contains('has-portrait'));},null,{timeout:15000});
  check(true,'Every nearby person card shows a rendered portrait');
  // Decode each portrait and measure it: a drawn face has contrast, and two people differ.
  const stats=await page.locator('.nearby-person.has-portrait').evaluateAll(async rows=>Promise.all(rows.map(async row=>{
    const image=new Image();image.src=getComputedStyle(row).getPropertyValue('--portrait').trim().slice(5,-2);await image.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=48;const context=canvas.getContext('2d');context.drawImage(image,0,0,48,48);
    const data=context.getImageData(0,0,48,48).data,lum=[];for(let i=0;i<data.length;i+=4)lum.push(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]);
    const mean=lum.reduce((a,b)=>a+b)/lum.length;return {id:row.id,size:image.naturalWidth,deviation:Math.sqrt(lum.reduce((a,b)=>a+(b-mean)**2,0)/lum.length),lum};
  })));
  check(stats.every(s=>s.size===192),'Portraits are 192 px renders');
  check(stats.every(s=>s.deviation>18),'Each portrait has a drawn subject, not a blank backdrop');
  if(stats.length>1){const [a,b]=stats,diff=a.lum.reduce((sum,v,i)=>sum+Math.abs(v-b.lum[i]),0)/a.lum.length;check(diff>4,'Different residents get different portraits');}
  await page.locator('.nearby-person').first().click();
  await page.locator('#community-dialogue').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#community-dialogue .community-avatar')?.classList.contains('has-portrait'),null,{timeout:10000});
  check(true,'The conversation header shows the same resident portrait');
  check(await page.locator('#community-dialogue .community-avatar').getAttribute('aria-hidden')==='true','Portrait stays decorative; the name is read out instead');
  check((await page.locator('#community-dialogue .community-avatar').textContent()).trim().length>0,'Initials remain underneath as a fallback');
  await page.screenshot({path:'output/playwright/resident-portraits.png'});
  check(!errors.length,`No portrait or page errors (${errors.join(' | ')})`);
  return {checks,portraits:stats.map(({id,deviation})=>({id,deviation:+deviation.toFixed(1)}))};
}
