async page => {
  const checks=[],errors=[],captures=[],commands=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
  const shot=async name=>{const path=`output/playwright/office-interruptions-${name}.png`;await page.screenshot({path});captures.push(path);};
  let socket,connections=0,holdEntry=false,entryId=null,held=null;
  await page.routeWebSocket('**/multiplayer?*',client=>{
    const server=client.connectToServer();socket={client,server};connections++;
    client.onMessage(message=>{
      const data=JSON.parse(String(message));
      if(data.type==='office'){commands.push({action:data.action,requestId:data.requestId});if(data.action==='enter'&&holdEntry)entryId=data.requestId;}
      server.send(message);
    });
    server.onMessage(message=>{
      const data=JSON.parse(String(message));
      if(holdEntry&&data.type==='result'&&data.requestId===entryId)held=message;
      else client.send(message);
    });
  });
  page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  await page.locator('#office-lobby').evaluate(n=>n.click());
  await page.waitForFunction(()=>!document.querySelector('#office-enter').disabled);
  const initial=await page.evaluate(()=>window.__riverCarriage().rider);
  const enter=()=>page.locator('#office-enter').evaluate(n=>n.click());
  const phase=name=>page.waitForFunction(name=>document.querySelector('#office-visit').dataset.phase===name,name,{timeout:90000});
  const returned=async()=>{
    await page.waitForFunction(()=>{const m=window.__riverMultiplayer(),p=m.snapshot?.players.find(p=>p.id===m.selfId);return m.connected&&p&&!p.office&&!document.querySelector('#office-visit').open&&window.__riverOffice()===null;});
    await page.waitForFunction(before=>{const p=window.__riverCarriage().rider;return Math.hypot(p[0]-before[0],p[2]-before[2])<.5;},initial);
    check(await page.locator('#canvas-host').evaluate(n=>n===document.activeElement),'Ending the visit restores street avatar and focus');
  };
  // The real server accepts entry; only its acknowledgement is held back.
  holdEntry=true;await enter();await page.locator('#office-pending[open]').waitFor();
  await page.locator('#office-enter').evaluate(n=>{n.click();n.click();});
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return Boolean(m.snapshot?.players.find(p=>p.id===m.selfId)?.office);});
  check(commands.filter(c=>c.action==='enter').length===1,'Repeated input sends one authorized entry command');
  await page.locator('#office-entry-cancel').click();
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return !m.snapshot.players.find(p=>p.id===m.selfId)?.office;});
  if(!held)throw new Error('Accepted entry acknowledgement was not captured');
  holdEntry=false;socket.client.send(held);held=null;await returned();
  check(!await page.locator('#office-visit').evaluate(n=>n.open),'Late accepted entry cannot reopen a cancelled journey');
  for(const stage of ['boarding','ascending']){
    await page.waitForFunction(()=>!document.querySelector('#office-enter').disabled);await enter();await phase(stage);await shot(`${stage}-before-return`);
    await page.locator('#office-exit').click();await returned();await shot(`${stage}-returned`);
  }
  await enter();await phase('lobby');await page.locator('#office-skip').click();await phase('office');
  check(await page.evaluate(()=>window.__riverOffice().elevation===24.3||Math.abs(window.__riverOffice().elevation-24.3)<1e-8),'Skip reaches the authorized office');
  await page.locator('#office-exit').click();await returned();
  await enter();await phase('ascending');const before=connections;
  socket.client.close({code:1001,reason:'Office reconnect acceptance'});socket.server.close({code:1001});
  await page.waitForFunction(()=>!document.querySelector('#office-visit').open);
  await page.waitForFunction(()=>window.__riverMultiplayer().connected,null,{timeout:60000});await phase('office');
  check(connections>before,'A real reconnect restores the authorized visit without replaying the movie');
  await page.locator('#office-exit').click();await returned();
  // Hold the newly selected player's portrait decode, part of real avatar readiness.
  let releasePortrait,portraitRequested;
  const requested=new Promise(resolve=>{portraitRequested=resolve;}),gate=new Promise(resolve=>{releasePortrait=resolve;});
  await page.route('**/assets/characters/references/forest-aristocrat-masculine.png',async route=>{portraitRequested();await gate;await route.continue();});
  try{
    await page.locator('input[name=player-character][value=silvan]').evaluate(n=>{n.checked=true;n.dispatchEvent(new Event('change',{bubbles:true}));});
    await Promise.race([requested,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Selected portrait was not requested')),15000))]);
    await enter();await phase('loading');check(await page.evaluate(()=>window.__riverOffice()?.progress===0),'Delayed selected-avatar assets keep the arrival at its initial pose');
    releasePortrait();await phase('boarding');
    check(await page.locator('#canvas-host').getAttribute('data-player-appearance')==='forest-aristocrat','Boarding uses the selected loaded avatar');await shot('selected-avatar-boarding');
    await page.locator('#office-skip').click();await phase('office');await page.locator('#office-exit').click();await returned();
  }finally{releasePortrait();await page.unroute('**/assets/characters/references/forest-aristocrat-masculine.png');}
  check(errors.length===0,`No browser errors: ${errors.join('; ')}`);
  return {checks,captures,commands,errors,scope:'Real fixture HTTP/WebSocket authority; held acknowledgement, delayed local asset, cancellation, skip and reconnect. No production accounts.'};
}
