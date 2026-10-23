async page => {
  // Keep real HTTP/WebSocket fixture transports while isolating this controller
  // from the application's already-running multiplayer instance.
  // A real navigation establishes loopback's address space; fulfilling a fake
  // document would trigger Chromium's local-network WebSocket protection.
  await page.goto('http://127.0.0.1:5173/src/world-contract.js');
  await page.setContent('<!doctype html><div class="app-shell"><div id="canvas-host" tabindex="0"></div><div id="community-more"></div><main id="viewport"></main><dialog id="settings-dialog"><button>Audio settings</button></dialog></div>');
  await page.exposeFunction('__lifecycleProgress',message=>console.log(message));
  const result=await page.evaluate(async()=>{
    const timeout=(promise,label)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label)),10000))]);
    const {createMultiplayer}=await import('/src/multiplayer-client.js');
    const originalFetch=window.fetch,OriginalSocket=window.WebSocket,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const checks=[],sockets=[];
    const check=(condition,message)=>checks.push({passed:Boolean(condition),message});
    let holdNextReply=false,heldRequestId=null,replyHeld,releaseReply;
    window.WebSocket=class extends OriginalSocket{
      constructor(...args){super(...args);if(new URL(args[0],location.href).pathname==='/multiplayer')sockets.push(this);}
      send(raw){
        const message=JSON.parse(raw);
        if(holdNextReply&&message.type==='homeAccess'&&message.action==='list'){holdNextReply=false;heldRequestId=message.requestId;}
        super.send(raw);
      }
      addEventListener(type,listener,options){
        if(type!=='message')return super.addEventListener(type,listener,options);
        return super.addEventListener(type,event=>{
          const message=JSON.parse(event.data);
          if(heldRequestId!==null&&message.type==='result'&&message.requestId===heldRequestId){
            heldRequestId=null;releaseReply=()=>listener.call(this,event);replyHeld(message);return;
          }
          listener.call(this,event);
        },options);
      }
    };
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
      let joined,rejoined,callbacks=0;
      const ready=new Promise(resolve=>{joined=resolve;});
      const client=createMultiplayer({getPose:()=>null,onSnapshot(){callbacks++;joined();rejoined?.();},onPlayers(){callbacks++;},onCorrection(){callbacks++;},onHomeAccess(){callbacks++;}});
      await window.__lifecycleProgress('Connecting live controller');
      await timeout(ready,'Live controller did not join');
      const settings=document.querySelector('#settings-dialog'); settings.showModal(); settings.querySelector('button').focus();
      const reconnect=new Promise(resolve=>{rejoined=resolve;}),socket=sockets.at(-1);
      const closed=new Promise(resolve=>socket.addEventListener('close',resolve,{once:true})); socket.close(); await closed;
      check(!settings.open,'connection loss dismisses Settings before making the application inert');
      check(document.activeElement.id==='multiplayer-title','connection gate receives focus after Settings is dismissed');
      await timeout(reconnect,'Controller did not reconnect after settings gate test');
      // Hold the real successful result at the production client's message callback.
      // Disposal must fence it even when that callback was already queued.
      const held=new Promise(resolve=>{replyHeld=resolve;});holdNextReply=true;
      let confirmed=false,rejected=false;
      const pending=client.command({type:'homeAccess',action:'list'}).then(()=>{confirmed=true;return false;},()=>{rejected=true;return true;});
      const late=await timeout(held,'No command result held for disposal');
      check(late.ok===true,'the held late reply is a successful real transport command result');
      client.dispose();
      const atDisposal=callbacks;
      check(!client.connected&&client.snapshot===null,'connected state and snapshot are cleared synchronously');
      await Promise.resolve();
      check(rejected,'disposal rejects the pending command before its held reply is delivered');
      releaseReply();
      check(await pending,'disposal rejects pending command promises');
      await Promise.resolve();
      check(!confirmed&&!client.connected&&client.snapshot===null,'a successful late command reply cannot revive the disposed client or confirm its rejected action');
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
