async page => {
  await page.goto('http://127.0.0.1:5173/src/world-contract.js');
  await page.setContent('<!doctype html><div class="app-shell"><div id="canvas-host" tabindex="0"></div><div id="community-more"></div><main id="viewport"></main><dialog id="settings-dialog"><button>Audio settings</button></dialog></div>');
  return page.evaluate(async()=>{
    const {createMultiplayer}=await import('/src/multiplayer-client.js');
    const OriginalSocket=window.WebSocket,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const wait=async(predicate,label)=>{for(let i=0;i<200;i++){if(predicate())return;await pause(25);}throw new Error(label);};
    const check=(ok,label)=>{if(!ok)throw new Error(label);};
    const poses=[],ids=new Set(),held=[];let hold=true,acks=0,pose=null,callbacks=0;
    window.WebSocket=class extends OriginalSocket {
      send(text){const message=JSON.parse(text);if(message.type==='pose'){poses.push(message);ids.add(message.requestId);}super.send(text);}
      addEventListener(type,listener,...options){
        if(type!=='message')return super.addEventListener(type,listener,...options);
        return super.addEventListener(type,event=>{
          const data=JSON.parse(event.data);
          if(hold&&data.type==='result'&&ids.has(data.requestId)){held.push(()=>listener(event));return;}
          listener(event);
        },...options);
      }
    };
    const walking={recordSubmittedPose:()=>()=>{acks++;},setInputEnabled(){}};
    const client=createMultiplayer({getWalking:()=>walking,getPose:()=>pose,onSnapshot(){callbacks++;},onPlayers(){},onCorrection(player){pose={position:[player.position[0],player.position[2]+1.68,-player.position[1]],ground:player.position[2],altitude:player.altitude,yaw:player.yaw,flying:true};}});
    let timer;
    try {
      await wait(()=>client.connected&&pose,'fixture connects');
      timer=setInterval(()=>client.update(performance.now()),20);
      await wait(()=>held.length===1,'first flight result reaches the browser');
      await pause(800);
      check(poses.length===1&&poses[0].requestId,'one explicitly acknowledged flight request remains outstanding');
      const snapshots=callbacks;await pause(400);check(callbacks>snapshots,'snapshot traffic continues while a pose acknowledgment is delayed');
      await pause(7300);
      check(poses.length===2&&client.connected,'timeout retries remain bounded while snapshots continue');
      hold=false;held.splice(0).forEach(release=>release());
      await wait(()=>acks>=2,'flight resumes after acknowledgment');
      check(poses.every(p=>typeof p.requestId==='string'),'flying poses cannot be coalesced');
      // A confirmed landing is still acknowledged, then walking uses its normal
      // coalescible cadence again.
      pose.flying=false;
      await wait(()=>poses.some(p=>p.requestId===undefined),'grounded sends return to the normal transport');
      const before=poses.length;
      const dropped=window.__riverConnection.drop();check(dropped&&!client.connected,'disconnect closes the real town socket');
      await wait(()=>client.connected,'reconnect after real socket loss');
      await wait(()=>poses.length>before,'pose sends resume after reconnect');
      return {passed:true,submitted:poses.length,acknowledged:acks,snapshots:callbacks,checks:['one in flight','explicit request ids','delayed result recovery','landing transition','socket reconnect']};
    }finally{clearInterval(timer);client.dispose();window.WebSocket=OriginalSocket;}
  });
}
