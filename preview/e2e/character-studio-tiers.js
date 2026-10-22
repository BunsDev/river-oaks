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
 const outbound={alice:[],bob:[]},replies=new Map();let aliceServer=null;
 const relay=(name,p)=>p.routeWebSocket('**/multiplayer?*',client=>{
  const server=client.connectToServer();if(name==='alice')aliceServer=server;
  client.onMessage(message=>{try{outbound[name].push(JSON.parse(String(message)));}catch{outbound[name].push({unparsed:true});}server.send(message);});
  server.onMessage(message=>{try{const data=JSON.parse(String(message));if(data.type==='result'&&replies.has(data.requestId))replies.get(data.requestId)(data);}catch{/* Binary frames are not command results. */}client.send(message);});
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
 const wear=async(p,id,character,palette)=>{
  await open(p);const dialog=studio(p);
  await dialog.locator(`[data-character=${character}]`).click();await dialog.getByRole('radio',{name:palette,exact:true}).click();
  await dialog.locator('[data-wear]').click();
  await p.waitForFunction(()=>['ready','error','conflict'].includes(document.querySelector('.character-studio').dataset.accountPhase));
  if(await dialog.locator('[data-retry]').isVisible()){await p.waitForTimeout(2200);await dialog.locator('[data-retry]').click();}
  await p.waitForFunction(id=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===id)?.character?.revision>0,id);
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
  check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);
  return {passed:true,checks,measurements,scope:'Real two-account HTTP/WebSocket/browser flow on desktop Chromium; graphics tiers on main are render scale and ambient occlusion. #517 realistic material tiers, physical devices and human acceptance are not covered.'};
 }finally{await peerContext.close();}
}
