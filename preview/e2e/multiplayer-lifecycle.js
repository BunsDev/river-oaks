async page => {
  // Keep real HTTP/WebSocket fixture transports while isolating this controller
  // from the application's already-running multiplayer instance.
  // A real navigation establishes loopback's address space; fulfilling a fake
  // document would trigger Chromium's local-network WebSocket protection.
  await page.goto('http://127.0.0.1:5173/src/world-contract.js');
  await page.setContent('<!doctype html><div class="app-shell"><div id="canvas-host" tabindex="0"></div><div id="community-more"></div></div>');
  await page.exposeFunction('__lifecycleProgress',message=>console.log(message));
  const result=await page.evaluate(async()=>{
    const timeout=(promise,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),10000))]);
    const {createMultiplayer}=await import('/src/multiplayer-client.js');
    const originalFetch=window.fetch,OriginalSocket=window.WebSocket,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const checks=[],sockets=[];
    const check=(condition,message)=>checks.push({passed:Boolean(condition),message});
    window.WebSocket=class extends OriginalSocket{constructor(...args){super(...args);if(new URL(args[0],location.href).pathname==='/multiplayer')sockets.push(this);}};
    const create=onSnapshot=>createMultiplayer({getPose:()=>null,onSnapshot,onPlayers(){},onCorrection(){}});
    try{
      for(const stage of ['/auth/session','/api/multiplayer/ticket']){
        let release,held,signal,ticketRequests=0,snapshots=0;
        const ready=new Promise(resolve=>{held=resolve;}),gate=new Promise(resolve=>{release=resolve;});
        window.fetch=async(path,options)=>{
          if(String(path).startsWith('/api/multiplayer/ticket'))ticketRequests++;
          const response=await originalFetch(path,options);
          if(String(path).startsWith(stage)){signal=options?.signal;held();await gate;}
          return response;
        };
        const before=sockets.length,client=create(()=>{snapshots++;});
        await window.__lifecycleProgress(`Holding ${stage}`);
        await timeout(ready,`No held response for ${stage}`);client.dispose();release();await pause(1000);
        await window.__lifecycleProgress(`Released ${stage}; sockets=${sockets.length-before}; snapshots=${snapshots}`);
        check(sockets.length===before,`${stage}: disposed connect cannot create a WebSocket`);
        check(snapshots===0&&!client.connected,`${stage}: late completion cannot publish a snapshot`);
        check(signal?.aborted===true,`${stage}: disposal aborts the owned HTTP request`);
        if(stage==='/auth/session')check(ticketRequests===0,'disposal during session read prevents requesting a ticket');
        for(const socket of sockets)if(socket.readyState<OriginalSocket.CLOSING)socket.close();
        await pause(50);
      }
      window.fetch=originalFetch;
      let joined,callbacks=0;
      const ready=new Promise(resolve=>{joined=resolve;});
      const client=createMultiplayer({getPose:()=>null,onSnapshot(){callbacks++;joined();},onPlayers(){callbacks++;},onCorrection(){callbacks++;},onHomeAccess(){callbacks++;}});
      await window.__lifecycleProgress('Connecting live controller');
      await timeout(ready,'Live controller did not join');
      const pending=client.command({type:'homeAccess',action:'list'}).then(()=>false,()=>true);
      client.dispose();
      const atDisposal=callbacks;
      check(!client.connected&&client.snapshot===null,'connected state and snapshot are cleared synchronously');
      check(await pending,'disposal rejects pending command promises');
      check(!(await client.command({type:'gesture',kind:'wave'})).ok,'disposed client refuses new commands');
      await pause(350);
      check(callbacks===atDisposal,'socket close and queued frames cannot publish after disposal');
      check(!document.querySelector('.app-shell').hasAttribute('inert'),'late callbacks cannot relock the application');
      client.dispose();
      return {checks};
    }finally{
      window.fetch=originalFetch;window.WebSocket=OriginalSocket;
      for(const socket of sockets)if(socket.readyState<OriginalSocket.CLOSING)socket.close();
    }
  });
  const failed=result.checks.filter(check=>!check.passed);
  if(failed.length)throw new Error(JSON.stringify(failed));
  return result;
}
