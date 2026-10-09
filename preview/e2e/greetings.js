async page => {
  const origin='http://127.0.0.1:5180',checks=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const ready=async(tab,id)=>{
    tab.on('pageerror',error=>errors.push(error.message));
    await tab.context().addCookies([{name:'fixture_session',value:id,url:origin}]);
    await tab.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});
    await tab.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host').dataset.playerReady==='true');
    if(await tab.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await tab.locator('#panel-toggle').click();
  };
  await ready(page,'alice');
  const context=await page.context().browser().newContext({viewport:{width:1280,height:900}});
  await context.route('**/v1/**',route=>route.fulfill({status:503,json:{source:'unavailable'}}));
  const bob=await context.newPage();
  try{
    await ready(bob,'bob');
    const card=page.getByRole('region',{name:'Nearby greetings'}),other=bob.getByRole('region',{name:'Nearby greetings'});
    await card.waitFor({state:'visible'});
    check(await card.getByLabel('Greet someone nearby').inputValue()==='bob','Nearest person is selected without opening People');
    await card.getByRole('button',{name:'Shake hands',exact:true}).click();
    await other.getByRole('button',{name:'Accept',exact:true}).waitFor();
    check(await bob.evaluate(()=>window.__riverMultiplayer().snapshot.players.every(p=>p.gesture!=='handshake')),'Invitation leaves both avatars at rest until accepted');
    await other.getByRole('button',{name:'Accept',exact:true}).focus();await bob.keyboard.press('Enter');
    await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.every(p=>p.gesture==='handshake'));
    await bob.waitForFunction(()=>document.activeElement?.textContent==='Stop');
    check(true,'Keyboard focus moves from Accept to Stop after confirmation');
    await page.waitForFunction(()=>window.__riverMultiplayer().remotes.some(p=>p.id==='bob'&&p.gesture==='handshake'&&p.rightArmMotion>.4));
    check(true,'Keyboard acceptance starts a visible shared handshake');
    await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.every(p=>p.interaction?.elapsed>1));
    const facing=await page.evaluate(()=>{const town=window.__riverMultiplayer(),self=town.snapshot.players.find(p=>p.id===town.selfId);return Math.cos(window.__riverPlayerAttention().bodyYaw-self.interaction.heading);});
    check(facing>.95,'Local avatar turns toward their partner');
    await page.screenshot({path:'output/playwright/greetings-handshake.png'});
    await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.every(p=>!p.interaction));
    await card.getByRole('button',{name:'Dance together',exact:true}).click();
    await other.getByRole('button',{name:'Accept',exact:true}).click();
    await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.every(p=>p.gesture==='dance'));
    const phases=await page.evaluate(()=>window.__riverMultiplayer().snapshot.players.map(p=>p.interaction.elapsed));
    check(Math.abs(phases[0]-phases[1])<.02,'Both dancers use the same server phase');
    await page.waitForFunction(()=>window.__riverMultiplayer().remotes.some(p=>p.gesture==='dance'&&p.rightArmMotion>.25)&&window.__riverMultiplayer().snapshot.players.every(p=>p.interaction?.elapsed>1));
    await page.screenshot({path:'output/playwright/greetings-dance.png'});
    await bob.setViewportSize({width:390,height:844});
    await other.getByRole('button',{name:'Stop',exact:true}).waitFor({state:'visible'});
    const box=await other.boundingBox();check(box.x>=0&&box.x+box.width<=390,'Greeting controls fit a phone viewport');
    await bob.screenshot({path:'output/playwright/greetings-mobile.png'});
    await other.getByRole('button',{name:'Stop',exact:true}).click();
    await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.every(p=>!p.interaction));
    check(true,'Either participant can stop from mobile controls');
    await page.emulateMedia({reducedMotion:'reduce'});
    await card.getByRole('button',{name:'Dance together',exact:true}).click();
    await other.getByRole('button',{name:'Decline',exact:true}).click();
    await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.interactions.length===0);
    check(true,'Declining clears the invitation on both clients');
    await card.getByRole('button',{name:'Dance together',exact:true}).click();
    await other.getByRole('button',{name:'Accept',exact:true}).click();
    await bob.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.every(p=>p.gesture==='dance'));
    await bob.locator('#canvas-host').focus();await bob.keyboard.down('KeyW');
    try{await bob.waitForFunction(()=>window.__riverMultiplayer().snapshot.interactions.length===0);}finally{await bob.keyboard.up('KeyW');}
    check(true,'Walking away cancels both dancers through the actual movement transport');
    check(errors.length===0,`No browser errors: ${errors.join('; ')}`);
    return {checks,errors,scope:'Two authenticated local fixture accounts; keyboard acceptance and phone viewport; no human accessibility or art-quality acceptance.'};
  }finally{await context.close();}
}
