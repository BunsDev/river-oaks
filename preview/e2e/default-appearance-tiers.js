async page => {
 // #517 default-appearance trial: the owner's Jevica and alice's default Sable
 // take only their trial realism components at each viewer's own graphics tier.
 // Neither gains a cornea shell, and nothing about identity or quality reaches
 // the server. A missing roughness map falls back visibly, and a reconnect
 // restores the same look.
 const origin='http://127.0.0.1:5180',checks=[],errors=[],measurements={};
 const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
 const ready=p=>p.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host').dataset.playerReady==='true',null,{timeout:60000});
 const peerContext=await page.context().browser().newContext({viewport:{width:1440,height:1000}});
 await page.context().addCookies([{name:'fixture_session',value:'owner',url:origin}]);
 await peerContext.addCookies([{name:'fixture_session',value:'alice',url:origin}]);
 const peer=await peerContext.newPage();peer.setDefaultTimeout(60000);
 for(const p of [page,peer])p.on('pageerror',e=>errors.push(e.message));
 const outbound={owner:[],alice:[]};
 const record=(name,p)=>p.routeWebSocket('**/multiplayer?*',client=>{
  const server=client.connectToServer();
  client.onMessage(message=>{try{outbound[name].push(JSON.parse(String(message)));}catch{outbound[name].push({unparsed:true});}server.send(message);});
  server.onMessage(message=>client.send(message));
 });
 await record('owner',page);await record('alice',peer);
 const tier=async(p,mode)=>{
  await p.evaluate(mode=>document.querySelector(`.graphics-control [data-quality=${mode}]`).click(),mode);
  await p.waitForFunction(mode=>{try{return JSON.parse(document.querySelector('#canvas-host').dataset.quality??'{}').mode===mode;}catch{return false;}},mode);
 };
 const leaked=name=>outbound[name].filter(m=>/quality|tier|realism|roughness|pores|coverage/i.test(JSON.stringify(m)));
 const commands=(name,from=0)=>outbound[name].slice(from).filter(m=>['character','appearance','movement'].includes(m.type)||m.selection!==undefined);
 const remoteOf=(viewer,id)=>viewer.evaluate(id=>window.__riverMultiplayer().remotes.find(p=>p.id===id),id);
 const selfOf=viewer=>viewer.evaluate(()=>window.__riverMultiplayer().selfRealism);
 const tierOf=(viewer,id,tier)=>viewer.waitForFunction(({id,tier})=>{const r=window.__riverMultiplayer().remotes.find(p=>p.id===id)?.realism;return r?.tier===tier;},{id,tier});
 const selfTier=(viewer,tier)=>viewer.waitForFunction(tier=>window.__riverMultiplayer().selfRealism?.tier===tier,tier);
 const frame=async(viewer,id)=>{
  await viewer.evaluate(id=>{const player=window.__riverMultiplayer().snapshot.players.find(p=>p.id===id);const [x,z,y]=player.position;window.__riverRenderAudit.view({position:[x,y+1.45,-z+2.6],target:[x,y+1.1,-z],fov:32});},id);
  await viewer.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 };
 try{
  await page.goto(origin+'/?motion-debug=1&render-audit=1');await ready(page);
  await peer.goto(origin+'/?motion-debug=1&render-audit=1');await ready(peer);
  const expected=await page.evaluate(()=>import('/src/default-appearance-realism.js').then(m=>JSON.parse(JSON.stringify(m.DEFAULT_APPEARANCE_REALISM))));
  check(expected.enabled===true,'The trial is enabled in this build');
  const ownerId=await page.evaluate(()=>window.__riverMultiplayer().selfId),aliceId=await peer.evaluate(()=>window.__riverMultiplayer().selfId);
  check(await page.locator('#canvas-host').getAttribute('data-player-appearance')==='jevica','The owner account wears its default Jevica');
  check(await peer.locator('#canvas-host').getAttribute('data-player-appearance')==='sable-human','A resident account wears the default Sable');
  await peer.waitForFunction(id=>window.__riverMultiplayer().remotes.some(p=>p.id===id&&p.ready&&p.appearance==='jevica'),ownerId);
  await page.waitForFunction(id=>window.__riverMultiplayer().remotes.some(p=>p.id===id&&p.ready&&p.appearance==='sable-human'),aliceId);

  // Viewer-local tiers: the owner chooses Sharpest (high), alice Smoothest (standard).
  await tier(page,'sharp');await tier(peer,'smooth');
  await selfTier(page,'high');await selfTier(peer,'standard');await tierOf(peer,ownerId,'standard');await tierOf(page,aliceId,'high');
  // Hair, brow and lash cards change only if the policy lists coverage or strand recolor.
  const cards=id=>expected.appearances[id].some(component=>component==='coverage'||component==='hairColor');
  const trial=(report,id)=>report&&JSON.stringify(report.components)===JSON.stringify(expected.appearances[id])&&report.cornea===0&&report.skin>0&&(cards(id)?report.hair>0:report.hair+report.brows+report.lashes===0)&&!report.fallback;
  measurements.tiers={jevicaSelf:await selfOf(page),sableSelf:await selfOf(peer),jevicaOnAlice:(await remoteOf(peer,ownerId)).realism,sableOnOwner:(await remoteOf(page,aliceId)).realism};
  check(trial(measurements.tiers.jevicaSelf,'jevica')&&trial(measurements.tiers.jevicaOnAlice,'jevica'),'Jevica has only her trial components, own and remote, with no cornea shell');
  check(trial(measurements.tiers.sableSelf,'sable-human')&&trial(measurements.tiers.sableOnOwner,'sable-human'),'Sable has only her trial components, own and remote, with no cornea shell');
  check(measurements.tiers.jevicaSelf.tier==='high'&&measurements.tiers.jevicaOnAlice.tier==='standard','The owner renders her own Jevica at high while alice renders the same look at standard');
  check(measurements.tiers.sableSelf.tier==='standard'&&measurements.tiers.sableOnOwner.tier==='high','Alice renders her own Sable at standard while the owner renders it at high');
  const ownerView=await remoteOf(page,aliceId),aliceView=await remoteOf(peer,ownerId);
  check(ownerView.character?.appearanceId==='sable-human'&&aliceView.character?.appearanceId==='jevica','Each viewer holds the other’s canonical definition');
  await frame(page,aliceId);await page.screenshot({path:'output/playwright/default-appearance-sable-high-owner.png'});
  await frame(peer,ownerId);await peer.screenshot({path:'output/playwright/default-appearance-jevica-standard-peer.png'});

  // Re-tiering changes only the viewer's own rendering, and sends nothing.
  const before=outbound.alice.length,definitions={owner:JSON.stringify(aliceView.character),alice:JSON.stringify(ownerView.character)};
  measurements.cycle=[];
  for(const [mode,expectedTier] of [['sharp','high'],['smooth','standard']]){
   await tier(peer,mode);await tierOf(peer,ownerId,expectedTier);await selfTier(peer,expectedTier);
   const remote=await remoteOf(peer,ownerId);measurements.cycle.push({mode,remote:remote.realism,self:await selfOf(peer)});
   check(trial(remote.realism,'jevica')&&JSON.stringify(remote.character)===definitions.owner&&remote.appearance==='jevica',`${mode}: alice re-tiers Jevica to ${expectedTier} with the same definition`);
  }
  check(commands('alice',before).length===0,'Re-tiering sends no selection command');
  check(leaked('owner').length===0&&leaked('alice').length===0,'No client message carries graphics quality or realism state');
  check(JSON.stringify((await remoteOf(page,aliceId)).character)===definitions.alice&&(await selfOf(page)).tier==='high','The owner’s own tier and view of alice are unaffected');

  // Missing roughness map: alice reloads without it. Her Sable and her view of
  // Jevica fall back to the standard tier without the map, and say so.
  await peerContext.route('**/assets/characters/realism/skin-roughness.webp',route=>route.abort());
  await peer.reload();await ready(peer);
  await peer.waitForFunction(id=>window.__riverMultiplayer().remotes.some(p=>p.id===id&&p.ready&&p.appearance==='jevica'),ownerId);
  await selfTier(peer,'standard');await tierOf(peer,ownerId,'standard');
  measurements.fallback={self:await selfOf(peer),jevica:(await remoteOf(peer,ownerId)).realism};
  for(const [label,report,id] of [['Sable',measurements.fallback.self,'sable-human'],['Jevica',measurements.fallback.jevica,'jevica']])
   check(report.fallback==='roughness_unavailable'&&report.cornea===0&&JSON.stringify(report.components)===JSON.stringify(expected.appearances[id])&&report.unsupported.some(item=>item.startsWith('roughness:')),`${label}: a missing roughness map is reported and keeps the trial components`);
  check(await peer.locator('#canvas-host').getAttribute('data-player-appearance')==='sable-human','The fallback keeps Sable’s identity');

  // Reconnect with the map available again: the same look returns on both sides.
  await peerContext.unroute('**/assets/characters/realism/skin-roughness.webp');
  await peer.reload();await ready(peer);
  await peer.waitForFunction(id=>window.__riverMultiplayer().remotes.some(p=>p.id===id&&p.ready&&p.appearance==='jevica'),ownerId);
  await page.waitForFunction(id=>window.__riverMultiplayer().remotes.some(p=>p.id===id&&p.ready&&p.appearance==='sable-human'),aliceId);
  await selfTier(peer,'standard');await tierOf(page,aliceId,'high');
  measurements.reconnect={sableSelf:await selfOf(peer),sableOnOwner:(await remoteOf(page,aliceId)).realism,jevicaOnAlice:(await remoteOf(peer,ownerId)).realism};
  check(trial(measurements.reconnect.sableSelf,'sable-human')&&trial(measurements.reconnect.sableOnOwner,'sable-human')&&trial(measurements.reconnect.jevicaOnAlice,'jevica'),'After reconnect both looks return with their trial components and no fallback');
  check(JSON.stringify((await remoteOf(page,aliceId)).character)===definitions.alice,'Alice’s definition is unchanged across reconnect');
  check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);
  return {passed:true,checks,measurements,scope:'Real two-account HTTP/WebSocket/browser flow on desktop Chromium: #517 named-default trial components at high and standard; low is reached only by Auto under sustained load and is covered by unit tests. Physical devices, WebKit and human visual acceptance are not covered.'};
 }finally{await peerContext.close();}
}
