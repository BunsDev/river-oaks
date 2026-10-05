async page=>{
  const origin='http://127.0.0.1:5180',checks=[],errors=[];
  const check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
  const command=(tab,message)=>tab.evaluate(message=>new Promise((resolve,reject)=>{
    const socket=window.__creatorFixtureSocket,requestId='fixture-'+crypto.randomUUID();
    const deadline=setTimeout(()=>{socket.removeEventListener('message',read);reject(new Error('Creator command timed out'));},12000);
    const read=event=>{const result=JSON.parse(event.data);if(result.type==='result'&&result.requestId===requestId){clearTimeout(deadline);socket.removeEventListener('message',read);resolve(result);}};
    socket.addEventListener('message',read);socket.send(JSON.stringify({...message,requestId}));
  }),message);
  const join=async(tab,identity)=>{
    await tab.context().addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);if(String(args[0]).includes('/multiplayer?'))window.__creatorFixtureSocket=this;}};});
    tab.on('pageerror',error=>errors.push(error.message));
    await tab.context().addCookies([{name:'fixture_session',value:identity,url:origin}]);
    await tab.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});
    await tab.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true');
  };
  await join(page,'owner');
  if(!await page.locator('.visit-tools').evaluate(node=>node.open))await page.locator('.visit-tools-toggle').click();
  await page.locator('#build-kind').selectOption('object');
  check(await page.locator('#creator-name').count()===1,'Jevica can edit a named primitive assembly');
  await page.locator('#creator-name').fill('Rose glass sculpture');
  await page.locator('#creator-size-y').fill('0.2');await page.locator('#creator-position-y').fill('0.1');
  await page.locator('#creator-material').selectOption('metal');
  await page.locator('#creator-add').click();await page.locator('#creator-shape').selectOption('sphere');
  for(const axis of ['x','y','z'])await page.locator(`#creator-size-${axis}`).fill('0.7');
  await page.locator('#creator-position-y').fill('0.65');await page.locator('#creator-material').selectOption('glass');
  check(await page.locator('#creator-part option').count()===2,'Parts form one editable design');
  const district=await(await page.request.get(origin+'/data/district.json')).json(),spot=district.communityLocations[5];
  const arrival=await command(page,{type:'travel',position:spot.position.slice(0,2)});
  check(arrival.ok,'Creator travels through the authoritative room');
  await page.locator('#build-mode').click();
  const canvas=await page.locator('#canvas-host').boundingBox();let aimed=false;
  for(const [x,y]of [[.5,.72],[.42,.74],[.58,.74],[.5,.8],[.35,.7],[.65,.7],[.2,.7],[.25,.8],[.15,.85],[.3,.9],[.1,.72],[.18,.64]]){
    await page.mouse.move(canvas.x+canvas.width*x,canvas.y+canvas.height*y);await page.waitForTimeout(300);
    if(await page.locator('#build-hint').getAttribute('data-valid')==='true'){aimed=true;break;}
  }
  check(aimed,`The complete assembly has a valid placement (${await page.locator('#build-hint').textContent()})`);
  await page.locator('#build-place').click();
  await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.builds.some(item=>item.assembly?.name==='Rose glass sculpture'));
  const item=await page.evaluate(()=>window.__riverMultiplayer().snapshot.builds.find(item=>item.assembly?.name==='Rose glass sculpture'));
  check(item.assembly.parts.length===2&&item.assembly.parts[1].material==='glass','Authority confirms the full assembly and its material');
  await page.waitForFunction(id=>window.__riverCreatorObjects().rendered.some(item=>item.id===id&&item.parts.length===2),item.id);
  const context=await page.context().browser().newContext(),guest=await context.newPage();
  try{
    await join(guest,'alice');
    await guest.waitForFunction(id=>window.__riverCreatorObjects().rendered.some(item=>item.id===id&&item.parts.length===2),item.id);
    const rendered=await guest.evaluate(id=>window.__riverCreatorObjects().rendered.find(item=>item.id===id),item.id);
    check(rendered.parts[1].transmission>.5,'A second browser renders the actual physical glass surface');
    const denied=await command(guest,{type:'build',action:'remove',id:item.id});
    check(denied.error==='admin_only','Guests cannot remove the creator’s object');
    await page.locator('#build-mode').click();
    await page.locator('#build-list .shared-build-row').filter({hasText:'Rose glass sculpture'}).getByRole('button',{name:'Save design'}).click();
    await page.waitForFunction(()=>[...document.querySelectorAll('#design-list strong')].some(node=>node.textContent.includes('Rose glass sculpture')));
    check(true,'The full assembly is available as a saved design');
    await page.screenshot({path:'output/playwright/creator-objects.png'});
    const before=await guest.evaluate(()=>window.__riverCreatorObjects().resources);
    await page.locator('#build-list .shared-build-row').filter({hasText:'Rose glass sculpture'}).getByRole('button',{name:'Edit parts'}).click();
    await page.locator('#creator-part').selectOption('0');await page.locator('#creator-color').fill('#336699');
    for(const [x,y]of [[.5,.72],[.42,.74],[.58,.74],[.5,.8],[.35,.7],[.65,.7],[.2,.7],[.25,.8],[.15,.85],[.3,.9],[.1,.72],[.18,.64]]){
      await page.mouse.move(canvas.x+canvas.width*x,canvas.y+canvas.height*y);await page.waitForTimeout(300);
      if(await page.locator('#build-hint').getAttribute('data-valid')==='true')break;
    }
    await page.locator('#build-place').click();
    await page.waitForFunction(id=>window.__riverMultiplayer().snapshot.builds.find(item=>item.id===id)?.assembly.parts[0].color==='#336699',item.id);
    check(true,'Jevica edits confirmed parts through the builder controls');
    await guest.waitForFunction(id=>window.__riverCreatorObjects().rendered.find(item=>item.id===id)?.parts[0].color==='336699',item.id);
    check((await guest.evaluate(()=>window.__riverCreatorObjects().resources.materials))===before.materials,'Live edits release the previous material');
    await page.locator('#build-list .shared-build-row').filter({hasText:'Rose glass sculpture'}).getByRole('button',{name:'Remove',exact:true}).click();
    await guest.waitForFunction(id=>!window.__riverCreatorObjects().rendered.some(item=>item.id===id),item.id);
    check(true,'Removal reaches the other browser and releases its object');
    await page.locator('#design-list .shared-build-row').filter({hasText:'Rose glass sculpture'}).getByRole('button',{name:'Place a copy'}).click();
    for(const [x,y]of [[.5,.72],[.42,.74],[.58,.74],[.5,.8],[.35,.7],[.65,.7],[.2,.7],[.25,.8],[.15,.85],[.3,.9],[.1,.72],[.18,.64]]){
      await page.mouse.move(canvas.x+canvas.width*x,canvas.y+canvas.height*y);await page.waitForTimeout(300);
      if(await page.locator('#build-hint').getAttribute('data-valid')==='true')break;
    }
    await page.locator('#build-place').click();
    await page.waitForFunction(old=>window.__riverMultiplayer().snapshot.builds.some(item=>item.id!==old&&item.assembly?.name==='Rose glass sculpture'),item.id);
    const copy=await page.evaluate(()=>window.__riverMultiplayer().snapshot.builds.find(item=>item.assembly?.name==='Rose glass sculpture'));
    check(JSON.stringify(copy.assembly)===JSON.stringify(item.assembly),'Saved copies preserve the original parts rather than later edits');
    await guest.reload({waitUntil:'commit'});
    await guest.waitForFunction(id=>window.__riverMultiplayer?.().connected&&window.__riverCreatorObjects?.().rendered.some(item=>item.id===id&&item.parts.length===2),copy.id);
    check(true,'A reconnecting guest receives the complete saved assembly');
    await page.locator('#build-mode').click();
    await page.locator('#build-list .shared-build-row').filter({hasText:'Rose glass sculpture'}).getByRole('button',{name:'Remove',exact:true}).click();
    await guest.waitForFunction(id=>!window.__riverCreatorObjects().rendered.some(item=>item.id===id),copy.id);

  }finally{await context.close();}
  check(errors.length===0,`No page errors: ${errors.join(' | ')}`);
  return {checks};
}
