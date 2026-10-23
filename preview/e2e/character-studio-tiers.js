async page => {
 // #443: viewers at different graphics tiers must see one authoritative
 // identity. Quality is viewer-local presentation and never reaches the server.
 const origin='http://127.0.0.1:5180',checks=[],errors=[],measurements={};
 const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
 const ready=p=>p.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host').dataset.playerReady==='true',null,{timeout:60000});
 const peerContext=await page.context().browser().newContext({viewport:{width:1440,height:1000}});
 await page.context().addCookies([{name:'fixture_session',value:'alice',url:origin}]);
 await peerContext.addCookies([{name:'fixture_session',value:'bob',url:origin}]);
 const peer=await peerContext.newPage();peer.setDefaultTimeout(60000);
 for(const p of [page,peer])p.on('pageerror',e=>errors.push(e.message));
 // Record every client command on the real sockets. Alice's socket also keeps
 // its server side so the journey can inject a tampered selection command.
 // Bob's relay can also fault Alice's definition in snapshots he receives; the
 // server and Alice's account are never touched.
 const outbound={alice:[],bob:[]},replies=new Map(),connections={alice:0,bob:0};let aliceServer=null,peerFault=null,peerFaultSnapshots=0;
 const relay=(name,p)=>p.routeWebSocket('**/multiplayer?*',client=>{
  const server=client.connectToServer();connections[name]++;if(name==='alice')aliceServer=server;
  client.onMessage(message=>{try{outbound[name].push(JSON.parse(String(message)));}catch{outbound[name].push({unparsed:true});}server.send(message);});
  server.onMessage(message=>{
   let data=null;try{data=JSON.parse(String(message));}catch{/* Binary frames are not commands or snapshots. */}
   if(data?.type==='result'&&replies.has(data.requestId))replies.get(data.requestId)(data);
   const target=name==='bob'&&peerFault&&data?.type==='snapshot'&&data.players?.find(player=>player.id==='alice');
   if(target?.character){peerFault(target);peerFaultSnapshots++;client.send(JSON.stringify(data));return;}
   client.send(message);
  });
 });
 await relay('alice',page);await relay('bob',peer);
 const tier=async(p,mode)=>{
  await p.evaluate(mode=>document.querySelector(`.graphics-control [data-quality=${mode}]`).click(),mode);
  await p.waitForFunction(mode=>{try{return JSON.parse(document.querySelector('#canvas-host').dataset.quality??'{}').mode===mode;}catch{return false;}},mode);
  return p.evaluate(()=>({quality:JSON.parse(document.querySelector('#canvas-host').dataset.quality),pipeline:JSON.parse(document.querySelector('#canvas-host').dataset.pipeline??'null')}));
 };
 const account=p=>p.evaluate(()=>fetch('/api/character').then(r=>r.json()));
 const commands=(name,from=0)=>outbound[name].slice(from).filter(m=>['character','appearance','movement'].includes(m.type)||m.selection!==undefined);
 const leaked=name=>outbound[name].filter(m=>/quality|tier|lod|renderScale|occlusion/i.test(JSON.stringify(m)));
 const studio=p=>p.getByRole('dialog',{name:'Character studio'});
 const open=async p=>{
  if(!await p.locator('.visit-tools').evaluate(n=>n.open))await p.locator('.visit-tools-toggle').click();
  if(await p.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await p.locator('#panel-toggle').click();
  await p.getByRole('button',{name:'Open character studio',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
 };
 // Realistic looks have no color choices, so they pass no palette.
 const wear=async(p,id,character,palette,appearance=null)=>{
  await open(p);const dialog=studio(p);
  await dialog.locator(`[data-character=${character}]`).click();if(palette)await dialog.getByRole('radio',{name:palette,exact:true}).click();
  await dialog.locator('[data-wear]').click();
  await p.waitForFunction(()=>['ready','error','conflict'].includes(document.querySelector('.character-studio').dataset.accountPhase));
  if(await dialog.locator('[data-retry]').isVisible()){await p.waitForTimeout(2200);await dialog.locator('[data-retry]').click();}
  await p.waitForFunction(({id,appearance})=>{const character=window.__riverMultiplayer().snapshot.players.find(p=>p.id===id)?.character;return character?.revision>0&&(!appearance||character.appearanceId===appearance);},{id,appearance});
  await dialog.locator('[data-close]').click();
  return (await account(p)).selection.character;
 };
 // A viewer agrees with the owner when its remote entry is the owner's exact
 // authoritative definition and the loaded rig is that definition's appearance.
 const agrees=(viewer,id,definition)=>viewer.waitForFunction(({id,definition})=>{
  const remote=window.__riverMultiplayer().remotes.find(p=>p.id===id);
  return remote?.ready&&!remote.fallback&&remote.appearance===definition.appearanceId&&JSON.stringify(remote.character)===JSON.stringify(definition);
 },{id,definition});
 const remoteOf=(viewer,id)=>viewer.evaluate(id=>window.__riverMultiplayer().remotes.find(p=>p.id===id),id);
 const frame=async(viewer,id)=>{
  await viewer.evaluate(id=>{const p=window.__riverMultiplayer().snapshot.players.find(p=>p.id===id);const [x,z,y]=p.position;window.__riverRenderAudit.view({position:[x,y+1.3,-z+3.5],target:[x,y+1,-z],fov:38});},id);
  await viewer.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 };
 try{
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/?motion-debug=1&render-audit=1');await ready(page);
  await peer.goto(origin+'/?motion-debug=1&render-audit=1');await ready(peer);
  measurements.aliceSharp=await tier(page,'sharp');measurements.bobSmooth=await tier(peer,'smooth');
  check(measurements.aliceSharp.quality.scale===1&&measurements.aliceSharp.quality.occlusion===true,'Owner viewer renders at the Sharpest tier: full scale with ambient occlusion');
  check(measurements.bobSmooth.quality.scale===0.75&&measurements.bobSmooth.quality.occlusion===false,'Peer viewer renders at the Smoothest tier: three-quarter scale without ambient occlusion');

  const alice=await wear(page,'alice','sable','Rose silk');
  check(alice.ownerId==='alice'&&alice.revision===1&&alice.palette==='rose','Owner publishes and wears a customized revision from the Sharpest tier');
  await agrees(peer,'alice',alice);
  check(true,'Smoothest peer renders the exact authoritative owner revision');
  const bob=await wear(peer,'bob','sable','Midnight');
  check(bob.ownerId==='bob'&&bob.revision===1&&bob.palette==='midnight','Peer publishes its own revision from the Smoothest tier');
  await agrees(page,'bob',bob);
  check(true,'Sharpest owner renders the exact authoritative peer revision');
  const aliceOnBob=await remoteOf(peer,'alice'),bobOnAlice=await remoteOf(page,'bob');
  const outfit=(remote,color)=>remote.materials.some(m=>m.slot==='outfit')&&remote.materials.filter(m=>m.slot==='outfit').every(m=>m.color===color);
  check(outfit(aliceOnBob,'b66e89')&&outfit(bobOnAlice,'353044'),'Each viewer loads the other player’s published outfit materials at its own tier');
  const ownMaterials=JSON.stringify(await page.evaluate(()=>window.__riverMultiplayer().selfMaterials));
  check(JSON.stringify(aliceOnBob.materials)===ownMaterials,'Owner and Smoothest peer resolve identical material identity for the owner’s look');
  await frame(peer,'alice');await peer.screenshot({path:'output/playwright/character-studio-tiers-smooth-peer.png'});
  await frame(page,'bob');await page.screenshot({path:'output/playwright/character-studio-tiers-sharp-owner.png'});

  // Cycling every tier, including Auto's governor reset, is local presentation.
  const sentBefore=outbound.bob.length,selectionsBefore={alice:(await account(page)).selection.version,bob:(await account(peer)).selection.version};
  measurements.cycle=[];
  for(const mode of ['auto','sharp','smooth','auto','smooth']){
   measurements.cycle.push({mode,...await tier(peer,mode)});
   const remote=await remoteOf(peer,'alice');
   check(remote.ready&&!remote.fallback&&JSON.stringify(remote.character)===JSON.stringify(alice)&&JSON.stringify(remote.materials)===JSON.stringify(aliceOnBob.materials),`${mode}: peer keeps the same owner identity and materials`);
  }
  check(commands('bob',sentBefore).length===0,'Changing graphics tier sends no appearance, character or movement selection');
  check(leaked('alice').length===0&&leaked('bob').length===0,'No client message carries graphics quality, tier, scale or occlusion');
  check((await account(page)).selection.version===selectionsBefore.alice&&(await account(peer)).selection.version===selectionsBefore.bob,'Tier changes leave both authoritative selection versions unchanged');
  const snapshot=await peer.evaluate(()=>JSON.stringify(window.__riverMultiplayer().snapshot.players));
  check(!/quality|tier|lod|renderScale|occlusion/i.test(snapshot),'Authoritative snapshots carry no viewer graphics state');

  // Tampered publication attempts fail closed at the real HTTP gate.
  const tampered=await page.evaluate(async()=>{
   const session=await fetch('/auth/session').then(r=>r.json()),current=await fetch('/api/character').then(r=>r.json());
   const put=body=>fetch('/api/character/draft',{method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({expectedVersion:current.character.version,requestId:crypto.randomUUID(),...body})}).then(r=>r.status);
   const draft=current.character.draft;
   return {before:current.character,results:{
    topLevelTier:await put({definition:draft,qualityTier:'high'}),
    definitionTier:await put({definition:{...draft,qualityTier:'high'}}),
    lodParameter:await put({definition:{...draft,parameters:{lod:0}}}),
    assetUrl:await put({definition:{...draft,assets:[{...draft.assets[0],url:'https://example.com/high.glb'}]}}),
    assetSwap:await put({definition:{...draft,assets:[{...draft.assets[0],id:'man-tailored'}]}}),
    foreignOwner:await put({definition:{...draft,ownerId:'bob'}}),
   },
   // Positive control: the same helper and version succeed without tampering.
   control:await put({definition:draft}),after:(await fetch('/api/character').then(r=>r.json())).character};
  });
  measurements.tamperedStatuses=tampered.results;
  for(const [name,status]of Object.entries(tampered.results))check(status>=400&&status<500,`${name}: tampered draft is refused with a client error (${status})`);
  measurements.tamperedStatuses.control=tampered.control;
  check(tampered.control>=200&&tampered.control<300&&tampered.after.version===tampered.before.version+1,'Control: the same untampered save succeeds once from the unchanged version');
  check(JSON.stringify(tampered.after.draft)===JSON.stringify(tampered.before.draft)&&JSON.stringify(tampered.after.published)===JSON.stringify(tampered.before.published),'Refused drafts leave the owner’s draft and published revision unchanged');
  check(JSON.stringify((await account(peer)).selection.character)===JSON.stringify(bob),'Foreign-owner draft cannot touch the other account');

  // A tampered selection on the real socket is refused before world projection.
  const inject=async([name,command])=>{
   const requestId=`tier-${name}-${Date.now()}`,selection={expectedVersion:(await account(page)).selection.version,requestId:crypto.randomUUID()};
   const reply=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`${name}: no command result`)),15000);replies.set(requestId,data=>{clearTimeout(timer);resolve(data);});});
   aliceServer.send(JSON.stringify({...command,requestId,selection}));
   return [name,await reply];
  };
  const injected=[];for(const item of [['quality',{type:'character',revision:alice.revision,quality:'high'}],['foreign-revision',{type:'character',revision:99}]])injected.push(await inject(item));
  measurements.injectedResults=Object.fromEntries(injected.map(([name,reply])=>[name,{ok:reply.ok,error:reply.error??null}]));
  for(const [name,reply]of injected)check(reply.ok===false&&typeof reply.error==='string',`${name}: tampered socket selection is refused (${reply.error})`);
  check(JSON.stringify((await account(page)).selection.character)===JSON.stringify(alice),'Refused socket selections keep the owner’s worn revision');
  // Positive control: the same injection path accepts the untampered command
  // after the authoritative appearance cooldown.
  await page.waitForTimeout(2200);const [,control]=await inject(['control',{type:'character',revision:alice.revision}]);
  measurements.injectedResults.control={ok:control.ok,error:control.error??null};
  check(control.ok===true,'Control: the same socket path accepts the untampered selection');
  await agrees(peer,'alice',alice);check(true,'Peer still renders the canonical owner revision after refused tampering');

  // Reconnect: each viewer keeps its own tier and still agrees on identity.
  await peer.reload();await ready(peer);
  measurements.bobAfterReload=await peer.evaluate(()=>JSON.parse(document.querySelector('#canvas-host').dataset.quality??'null'));
  check(measurements.bobAfterReload?.mode==='smooth','Peer’s graphics tier persists locally across reconnect');
  await agrees(peer,'alice',alice);check(true,'Reconnected Smoothest peer renders the same owner revision');
  await agrees(page,'bob',bob);check(true,'Sharpest owner re-resolves the reconnected peer’s revision');

  // #517 realistic looks: each viewer applies the material tier its own
  // graphics choice implies (Sharpest high, Smoothest standard) to one definition.
  await page.waitForTimeout(2200);
  const morgan=await wear(page,'alice','morgan',null,'morgan-human');
  check(morgan.ownerId==='alice'&&morgan.appearanceId==='morgan-human'&&morgan.revision>alice.revision,'Owner publishes the realistic Morgan look as a new owned revision');
  const imani=await wear(peer,'bob','imani',null,'imani-human');
  check(imani.ownerId==='bob'&&imani.appearanceId==='imani-human'&&imani.revision>bob.revision,'Peer publishes the realistic Imani look as a new owned revision');
  await agrees(peer,'alice',morgan);await agrees(page,'bob',imani);
  check(true,'Each viewer renders the other’s exact realistic revision');
  const tierOf=(viewer,id,tier)=>viewer.waitForFunction(({id,tier})=>window.__riverMultiplayer().remotes.find(p=>p.id===id)?.realism?.tier===tier,{id,tier});
  const selfTier=(viewer,tier)=>viewer.waitForFunction(tier=>window.__riverMultiplayer().selfRealism?.tier===tier,tier);
  await tierOf(peer,'alice','standard');await tierOf(page,'bob','high');await selfTier(page,'high');await selfTier(peer,'standard');
  const realism=async()=>({
   aliceSelf:await page.evaluate(()=>window.__riverMultiplayer().selfRealism),bobSelf:await peer.evaluate(()=>window.__riverMultiplayer().selfRealism),
   aliceOnBob:(await remoteOf(peer,'alice')).realism,bobOnAlice:(await remoteOf(page,'bob')).realism});
  measurements.realism=await realism();
  const applied=report=>report.skin>0&&report.cornea>0&&report.hair>0;
  check(Object.values(measurements.realism).every(applied),'Every realistic avatar, own and remote, has its skin, corneas and hair upgraded');
  check(measurements.realism.aliceSelf.tier==='high'&&measurements.realism.aliceOnBob.tier==='standard','Owner renders its own Morgan at high while the Smoothest peer renders the same revision at standard');
  check(measurements.realism.bobSelf.tier==='standard'&&measurements.realism.bobOnAlice.tier==='high','Peer renders its own Imani at standard while the Sharpest owner renders it at high');
  await frame(peer,'alice');await peer.screenshot({path:'output/playwright/character-studio-tiers-realistic-standard-peer.png'});
  await frame(page,'bob');await page.screenshot({path:'output/playwright/character-studio-tiers-realistic-high-owner.png'});

  // Raising and lowering the peer's tier changes only its own rendering.
  const realisticBefore=outbound.bob.length,realisticVersions={alice:(await account(page)).selection.version,bob:(await account(peer)).selection.version};
  measurements.realismCycle=[];
  for(const [mode,expected]of [['sharp','high'],['smooth','standard']]){
   await tier(peer,mode);await tierOf(peer,'alice',expected);await selfTier(peer,expected);
   const remote=await remoteOf(peer,'alice');measurements.realismCycle.push({mode,remote:remote.realism});
   check(remote.ready&&!remote.fallback&&JSON.stringify(remote.character)===JSON.stringify(morgan)&&remote.appearance==='morgan-human',`${mode}: peer re-tiers Morgan to ${expected} with the same revision`);
  }
  check(commands('bob',realisticBefore).length===0&&leaked('bob').length===0,'Realistic re-tiering sends no selection and no graphics state');
  check((await account(page)).selection.version===realisticVersions.alice&&(await account(peer)).selection.version===realisticVersions.bob,'Realistic re-tiering leaves both authoritative selections unchanged');
  check((await page.evaluate(()=>window.__riverMultiplayer().selfRealism)).tier==='high','The owner’s own tier is unaffected by the peer’s choice');

  // Realistic revision recovery: a bad definition on the peer's transport falls
  // back to the authored Morgan base at the peer's own tier, then recovers the
  // exact revision on the same connection without touching the server.
  const canonicalMorgan=(await account(page)).selection.character,bobConnections=connections.bob;
  check(JSON.stringify(canonicalMorgan)===JSON.stringify(morgan),'Owner is wearing the published Morgan revision before peer faults');
  measurements.realisticFaults={};
  for(const [name,mutate]of [
   ['missing',player=>{delete player.character;}],
   ['stale-catalog',player=>{player.character.provenance.catalog='retired-catalog';}],
   ['corrupt-asset',player=>{player.character.assets[0].sha256='0'.repeat(64);}],
   ['foreign-owner',player=>{player.character.ownerId='bob';}],
  ]){
   peerFaultSnapshots=0;peerFault=mutate;
   await peer.waitForFunction(()=>{const remote=window.__riverMultiplayer().remotes.find(p=>p.id==='alice');
    return remote?.ready&&!remote.fallback&&remote.appearance==='morgan-human'&&remote.character?.revision===0&&remote.character.appearanceId==='morgan-human';});
   check(peerFaultSnapshots>0,`${name}: fault reached the peer's actual snapshot transport`);
   await tierOf(peer,'alice','standard');
   const fallback=await remoteOf(peer,'alice');
   check(applied(fallback.realism)&&fallback.realism.tier==='standard',`${name}: authored Morgan fallback keeps the peer's standard tier with realism applied`);
   if(name==='corrupt-asset'){await frame(peer,'alice');await peer.screenshot({path:'output/playwright/character-studio-tiers-realistic-fallback.png'});}
   check(JSON.stringify((await account(page)).selection.character)===JSON.stringify(canonicalMorgan),`${name}: peer fault cannot change the owner's authoritative selection`);
   peerFault=null;
   await peer.waitForFunction(expected=>{const remote=window.__riverMultiplayer().remotes.find(p=>p.id==='alice');return remote?.ready&&!remote.fallback&&JSON.stringify(remote.character)===JSON.stringify(expected);},canonicalMorgan);
   await tierOf(peer,'alice','standard');
   const recovered=await remoteOf(peer,'alice');measurements.realisticFaults[name]={fallback:fallback.realism,recovered:recovered.realism,snapshots:peerFaultSnapshots};
   check(applied(recovered.realism)&&connections.bob===bobConnections,`${name}: exact Morgan revision recovers at standard on the same connection`);
  }
  check((await page.evaluate(()=>window.__riverMultiplayer().selfRealism)).tier==='high'&&JSON.stringify((await remoteOf(page,'bob')).character)===JSON.stringify(imani),'Owner’s own tier and view of the peer are untouched by the peer’s transport faults');
  check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);
  return {passed:true,checks,measurements,scope:'Real two-account HTTP/WebSocket/browser flow on desktop Chromium: render scale/AO tiers and #517 realistic material tiers (high and standard; low is reached only by Auto under sustained load and is covered by unit tests). Physical devices, WebKit and human acceptance are not covered.'};
 }finally{await peerContext.close();}
}
