async page => {
 // #441 realistic slice: the Studio close-up and the town draw one realistic
 // definition the same way at one tier, in idle, walk and wave. A reduced-motion
 // viewer with missing detail maps gets an explained, still preview.
 const origin='http://127.0.0.1:5180',checks=[],errors=[],measurements={};
 const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
 const ready=p=>p.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host').dataset.playerReady==='true',null,{timeout:60000});
 const frames=(p,n=40)=>p.evaluate(n=>new Promise(resolve=>{let i=0;const tick=()=>++i<n?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}),n);
 const peerContext=await page.context().browser().newContext({viewport:{width:1440,height:1000}});
 await page.context().addCookies([{name:'fixture_session',value:'alice',url:origin}]);
 await peerContext.addCookies([{name:'fixture_session',value:'bob',url:origin}]);
 const peer=await peerContext.newPage();peer.setDefaultTimeout(60000);
 for(const p of [page,peer])p.on('pageerror',e=>errors.push(e.message));
 const tier=async(p,mode)=>{
  await p.evaluate(mode=>document.querySelector(`.graphics-control [data-quality=${mode}]`).click(),mode);
  await p.waitForFunction(mode=>{try{return JSON.parse(document.querySelector('#canvas-host').dataset.quality??'{}').mode===mode;}catch{return false;}},mode);
 };
 const account=p=>p.evaluate(()=>fetch('/api/character').then(r=>r.json()));
 const studio=p=>p.getByRole('dialog',{name:'Character studio'});
 const open=async p=>{
  if(!await p.locator('.visit-tools').evaluate(n=>n.open))await p.locator('.visit-tools-toggle').click();
  if(await p.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await p.locator('#panel-toggle').click();
  await p.getByRole('button',{name:'Open character studio',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
 };
 const loaded=(p,id)=>p.waitForFunction(id=>{const el=document.querySelector('.cs-preview');return el?.dataset.ready==='true'&&el.dataset.appearance===id&&el.dataset.realismTier&&el.dataset.realismTier!=='off';},id);
 const remoteOf=(viewer,id)=>viewer.evaluate(id=>window.__riverMultiplayer().remotes.find(p=>p.id===id),id);
 // Frame the owner from the viewer, in front of them: a player faces (-sin yaw, -cos yaw) in scene x/z.
 const frame=async(viewer,id,close=true)=>{
  return viewer.evaluate(({id,close})=>{const p=window.__riverMultiplayer().snapshot.players.find(p=>p.id===id);const [x,z,y]=p.position,yaw=p.yaw??0;
   const d=close?1.6:4,cx=x-Math.sin(yaw)*d,cz=-z-Math.cos(yaw)*d;
   window.__riverRenderAudit.view(close?{position:[cx,y+1.6,cz],target:[x,y+1.5,-z],fov:30}:{position:[cx,y+1.3,cz],target:[x,y+.95,-z],fov:38});return yaw;},{id,close})
   .then(async yaw=>{await viewer.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return yaw;});
 };
 try{
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/?motion-debug=1&render-audit=1');await ready(page);
  await peer.goto(origin+'/?motion-debug=1&render-audit=1');await ready(peer);
  // One tier for both views, so a difference is the view, not the quality.
  await tier(page,'sharp');await tier(peer,'sharp');

  for(const [name,owner,viewer,id,character,appearance] of [['morgan',page,peer,'alice','morgan','morgan-human'],['imani',peer,page,'bob','imani','imani-human']]){
   await open(owner);const dialog=studio(owner);
   await dialog.locator(`[data-character=${character}]`).click();await loaded(owner,appearance);
   await dialog.locator('[data-wear]').click();
   await owner.waitForFunction(()=>['ready','error','conflict'].includes(document.querySelector('.character-studio').dataset.accountPhase));
   if(await dialog.locator('[data-retry]').isVisible()){await owner.waitForTimeout(2200);await dialog.locator('[data-retry]').click();}
   await owner.waitForFunction(({id,appearance})=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===id)?.character?.appearanceId===appearance,{id,appearance});
   const worn=(await account(owner)).selection.character;
   check(worn.appearanceId===appearance&&JSON.stringify(worn.parameters)==='{}',`${name}: the worn look is the canonical bundle`);
   // Studio at Match graphics: an idle portrait close-up, then the full figure in idle, walk and wave.
   await dialog.locator('[name=framing]').selectOption('portrait');await frames(owner);
   await dialog.locator('.cs-preview').screenshot({path:`output/playwright/character-studio-realistic-${name}-studio-closeup.png`});
   await dialog.locator('[name=framing]').selectOption('full');
   const shots={};
   for(const pose of ['idle','walk','wave']){
    await dialog.locator('[name=pose]').selectOption(pose);await frames(owner);
    await dialog.locator('.cs-preview').screenshot({path:`output/playwright/character-studio-realistic-${name}-studio-${pose}.png`});
    shots[pose]=await owner.evaluate(()=>({...document.querySelector('.cs-preview').dataset}));
   }
   const studioTier=shots.idle.realismTier;
   check(['idle','walk','wave'].every(pose=>shots[pose].realismTier===studioTier&&!shots[pose].realismFallback),`${name}: the Studio draws idle, walk and wave at one tier (${studioTier})`);
   await dialog.locator('[data-close]').click();
   // The town: the owner's own avatar and the viewer's remote copy of it.
   await viewer.waitForFunction(({id,appearance})=>{const r=window.__riverMultiplayer().remotes.find(p=>p.id===id);return r?.ready&&!r.fallback&&r.appearance===appearance&&r.realism?.tier;},{id,appearance});
   const self=await owner.evaluate(()=>window.__riverMultiplayer().selfRealism),remote=(await remoteOf(viewer,id)).realism;
   check(self.tier===studioTier&&remote.tier===studioTier,`${name}: Studio, own avatar and peer view agree on the ${studioTier} tier: ${JSON.stringify({self,remote})}`);
   const yaw=await frame(viewer,id);await viewer.screenshot({path:`output/playwright/character-studio-realistic-${name}-world-closeup.png`});
   await frame(viewer,id,false);await viewer.screenshot({path:`output/playwright/character-studio-realistic-${name}-world-idle.png`});
   // Walk: the owner holds forward; the viewer captures mid-stride.
   const at=()=>owner.evaluate(id=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===id).position,id),start=await at();
   await owner.locator('#canvas-host').focus();await owner.keyboard.down('KeyW');
   await owner.waitForFunction(({id,start})=>{const [x,z]=window.__riverMultiplayer().snapshot.players.find(p=>p.id===id).position;return Math.hypot(x-start[0],z-start[1])>.5;},{id,start});
   await frame(viewer,id,false);await viewer.screenshot({path:`output/playwright/character-studio-realistic-${name}-world-walk.png`});
   const walking=(await remoteOf(viewer,id));await owner.keyboard.up('KeyW');
   const end=await at();check(Math.hypot(end[0]-start[0],end[1]-start[1])>.5,`${name}: the owner walked in town before the walk capture`);
   // Wave: the shared gesture, seen by the viewer.
   await owner.waitForTimeout(800);
   // The gestures live in the People panel; its button is the same shared command.
   await owner.waitForFunction(()=>[...document.querySelectorAll('.multiplayer-gestures button')].some(n=>n.textContent==='Wave'&&!n.disabled));
   await owner.evaluate(()=>[...document.querySelectorAll('.multiplayer-gestures button')].find(n=>n.textContent==='Wave').click());
   await viewer.waitForFunction(id=>{const r=window.__riverMultiplayer().remotes.find(p=>p.id===id);return r?.gesture==='wave'&&r.rightArmMotion>.4;},id,{timeout:10000});
   await frame(viewer,id,false);await viewer.screenshot({path:`output/playwright/character-studio-realistic-${name}-world-wave.png`});
   const after=(await remoteOf(viewer,id)).realism;
   check(after.tier===studioTier&&walking.realism?.tier===studioTier,`${name}: walking and waving keep the tier in town`);
   measurements[name]={yaw,studio:shots,self,remote,walking:walking.realism,after};
  }

  // Reduced motion with the detail maps missing: still preview, explained fallback, Low detail on request.
  // One account holds one town connection, so the owner's own page reloads into this state.
  const worn=JSON.stringify((await account(page)).selection.character),still=page;
  await still.emulateMedia({reducedMotion:'reduce'});await still.route('**/assets/characters/realism/skin-roughness.webp',route=>route.abort());
  await still.reload();await ready(still);await open(still);const dialog=studio(still);
  await dialog.locator('[data-character=morgan]').click();await loaded(still,'morgan-human');
  check(await dialog.locator('[name=pose]').isDisabled()&&await dialog.locator('[data-turntable]').isDisabled(),'Reduced motion keeps the realistic preview still');
  await dialog.getByRole('radio',{name:'High detail',exact:true}).click();
  await still.waitForFunction(()=>{const el=document.querySelector('.cs-preview');return el.dataset.realismRequested==='high'&&el.dataset.realismFallback==='roughness_unavailable';});
  const fallback=await still.evaluate(()=>({...document.querySelector('.cs-preview').dataset,status:document.querySelector('[data-cs-tier-status]').textContent}));
  check(fallback.realismTier==='standard'&&/High detail needs a detail map that could not load, so this preview uses Standard detail/.test(fallback.status),`Missing maps fall back to Standard detail and say so in place: ${JSON.stringify(fallback)}`);
  await dialog.locator('[name=framing]').selectOption('portrait');await dialog.locator('.cs-preview').screenshot({path:'output/playwright/character-studio-realistic-fallback-standard.png'});
  await dialog.getByRole('radio',{name:'Low detail',exact:true}).click();
  await still.waitForFunction(()=>document.querySelector('.cs-preview').dataset.realismTier==='low');
  const low=await still.evaluate(()=>({...document.querySelector('.cs-preview').dataset,status:document.querySelector('[data-cs-tier-status]').textContent}));
  check(/so Low detail draws without it/.test(low.status),`Low detail draws without the missing map and says so: ${low.status}`);
  await still.screenshot({path:'output/playwright/character-studio-realistic-reduced-low.png'});
  // With Morgan worn, before/after compares the same person at Match graphics against the staged Low detail.
  await dialog.getByRole('button',{name:'Before / after',exact:true}).click();
  await still.waitForFunction(()=>{const el=document.querySelector('.cs-preview');return el.dataset.ready==='true'&&el.dataset.realismRequested!=='low';});
  check(await dialog.getByRole('img',{name:'Original look: Morgan, Realistic human, Match graphics'}).isVisible(),'Before / after shows the worn Morgan at Match graphics');
  await dialog.getByRole('button',{name:'Before / after',exact:true}).click();
  await still.waitForFunction(()=>document.querySelector('.cs-preview').dataset.realismRequested==='low');
  check(await dialog.getByRole('img',{name:'Live preview: Morgan, Realistic human, Low detail'}).isVisible(),'Leaving the comparison returns to the staged Low detail');
  check(JSON.stringify((await account(still)).selection.character)===worn,'Fallback and tier choices leave the worn look unchanged');
  measurements.fallback={fallback,low};
  await dialog.getByRole('button',{name:'Discard edits',exact:true}).click();
  check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);
  return {passed:true,checks,measurements,scope:'Real two-account browser flow on desktop Chromium: Studio portrait close-ups vs town captures (own tier and peer tier) for Morgan and Imani in idle, walk and wave; reduced-motion missing-map fallback. Visual consistency is judged from the captures, not by pixel metrics; physical devices, WebKit and human review are not covered.'};
 }finally{await peerContext.close();}
}
