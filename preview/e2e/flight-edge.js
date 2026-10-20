async page => {
  const origin='http://127.0.0.1:5173',ownerId='user_01M40Y914S1H4EJCEHH91DKTAY';
  const check=(ok,message)=>{if(!ok)throw new Error(message);},samples=[],corrections=[];
  page.on('websocket',socket=>socket.on('framereceived',frame=>{
    try {const data=JSON.parse(frame.payload);if(data.type==='result'&&data.correction)corrections.push({error:data.error,position:data.correction.position,altitude:data.correction.altitude});}catch{}
  }));
  const ready=tab=>tab.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  const pose=()=>page.evaluate(()=>{const p=window.__riverCarriage().pose;return {position:p.position,altitude:p.altitude,flying:p.flying,speed:p.speed};});
  await page.goto(origin+'/?motion-debug=1');await ready(page);
  const peerContext=await page.context().browser().newContext({viewport:{width:960,height:720}});
  try {
    await peerContext.addCookies([{name:'fixture_session',value:'guest',url:origin}]);
    const peer=await peerContext.newPage();await peer.goto(origin+'/?motion-debug=1');await ready(peer);
    const sample=async label=>{
      const local=await pose();
      await peer.waitForFunction(id=>window.__riverMultiplayer().snapshot.players.some(p=>p.id===id),ownerId);
      await peer.waitForFunction(({id,altitude})=>Math.abs(window.__riverMultiplayer().snapshot.players.find(p=>p.id===id).altitude-altitude)<1,{id:ownerId,altitude:local.altitude},{timeout:10000});
      const authoritative=await page.evaluate(id=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===id),ownerId);
      const observed=await peer.evaluate(id=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===id),ownerId);
      samples.push({label,local,authoritative:{position:authoritative.position,altitude:authoritative.altitude},peer:{position:observed.position,altitude:observed.altitude}});
      check(Math.hypot(local.position[0]-observed.position[0],local.position[2]+observed.position[1])<2,`${label}: peer follows within two metres`);
      check(Math.abs(local.altitude-observed.altitude)<1,`${label}: peer sees flight height`);
      return local;
    };
    // Normal landmark travel reaches open pavement; all obstacle traversal below
    // uses the actual keyboard controller, never a pose teleport through a wall.
    const arrival=await page.evaluate(()=>window.__riverSeatAndWater().goTo(-2763,-1336));
    check(arrival?.ok,'arrive on clear pavement west of mapped building osm-way-625330792');
    await page.evaluate(()=>window.__riverSeatAndWater().face(-2700,-1336));
    await page.locator('#canvas-host').focus();await page.keyboard.press('KeyB');
    await page.waitForFunction(()=>window.__riverCarriage().pose.altitude>=3.4);
    await sample('takeoff');corrections.length=0;
    await page.keyboard.down('KeyW');await page.keyboard.down('KeyD');await page.waitForTimeout(3500);
    await page.keyboard.up('KeyW');await page.keyboard.up('KeyD');await page.waitForTimeout(700);
    const slide=await sample('wall-slide');
    check(slide.position[2]>1341,'southward input progresses along wall');
    check(slide.position[0]<-2758,'west wall continues to block inward input');
    await page.keyboard.down('Space');
    await page.waitForFunction(()=>window.__riverCarriage().pose.altitude>19,null,{timeout:20000});await page.keyboard.up('Space');
    await page.keyboard.down('KeyW');await page.waitForTimeout(3300);await page.keyboard.up('KeyW');await page.waitForTimeout(700);
    await sample('above-roof');await page.keyboard.press('KeyB');
    await page.waitForFunction(()=>window.__riverCarriage().pose.altitude<18,null,{timeout:15000});await page.waitForTimeout(1500);
    const roof=await sample('roof-contact');check(roof.flying&&roof.altitude>16,'roof blocks descent');
    await page.screenshot({path:'output/playwright/flight-edge-roof.png'});
    await page.keyboard.down('KeyS');
    await page.waitForFunction(()=>window.__riverCarriage().pose.position[0]<-2762,null,{timeout:15000});await page.keyboard.up('KeyS');
    await sample('roof-escape');
    await page.waitForFunction(()=>!window.__riverCarriage().pose.flying,null,{timeout:20000});
    await page.waitForFunction(id=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===id)?.altitude===0,ownerId);
    await peer.waitForFunction(id=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===id)?.altitude===0,ownerId);
    const landed=await sample('landed');
    check(!corrections.length,`movement corrections: ${JSON.stringify(corrections)}`);
    const dropped=await page.evaluate(()=>({dropped:window.__riverConnection.drop(),connected:window.__riverConnection.state().connected}));
    check(dropped.dropped&&!dropped.connected,'real town socket disconnects before reconnect');await ready(page);
    await page.waitForTimeout(700);const reconnected=await sample('reconnected');
    check(!reconnected.flying&&reconnected.altitude===0,'reconnect preserves the acknowledged grounded state');
    check(Math.hypot(...reconnected.position.map((n,i)=>n-landed.position[i]))<1,'reconnect preserves landed position');
    check(!corrections.length,`post-reconnect corrections: ${JSON.stringify(corrections)}`);
    return {building:'osm-way-625330792',samples,corrections,scope:'Real controller, authenticated loopback owner and guest, mapped facade and roof; no production auth claim.'};
  } catch(error) {console.error(JSON.stringify({samples,corrections,failedPose:await pose().catch(()=>null)}));throw error;} finally {await peerContext.close();}
}
