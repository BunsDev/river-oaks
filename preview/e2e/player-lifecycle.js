async page => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  const result=await page.evaluate(async()=>{
    const {createPlayerAvatar}=await import('/src/player-avatar.js');
    const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const create=(requestAppearance=async()=>({ok:false}))=>{
      const calls={camera:0,flight:0,blur:0,traversal:0,obstacleReleased:0};
      const host=document.createElement('div');
      const walking={thirdPerson:true,addObstacle:()=>()=>calls.obstacleReleased++,
        setTraversal(){calls.traversal++;},setThirdPerson(){calls.camera++;},toggleFlight(){calls.flight++;return true;},getPose:()=>null};
      // A detached scene needs no renderer: the real controller, DOM, assets,
      // event targets and delayed replies still exercise their normal lifetimes.
      const controller=createPlayerAvatar({scene:{add(){}},host,walking,userId:'guest',getLocals:()=>[],getWorld:()=>null,requestAppearance,reducedMotion:true});
      const panel=[...document.querySelectorAll('.player-controls')].at(-1);
      const choose=character=>{
        const input=panel.querySelector(`input[name=player-character][value=${character}]`);
        input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));
      };
      controller.carriage.setControls=()=>{calls.blur++;};
      controller.carriage.pauseTour=()=>{calls.blur++;};
      return {controller,host,panel,choose,calls};
    };
    const checks=[];
    const check=(condition,message)=>{checks.push({passed:Boolean(condition),message});};
    for(let cycle=0;cycle<3;cycle++){
      const item=create();
      item.host.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV'}));
      check(item.calls.camera===1,'live controller handles camera input');
      item.controller.dispose();item.controller.dispose();
      item.host.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyV'}));
      item.host.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyB'}));
      window.dispatchEvent(new Event('blur'));
      check(item.calls.camera===1&&item.calls.flight===0,'disposed controller releases host keyboard listeners');
      check(item.calls.blur===0,'disposed controller releases window blur listener');
      const hidden=Object.getOwnPropertyDescriptor(document,'hidden');
      Object.defineProperty(document,'hidden',{value:true,configurable:true});
      document.dispatchEvent(new Event('visibilitychange'));
      if(hidden)Object.defineProperty(document,'hidden',hidden);else delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      check(item.calls.blur===0,'disposed controller releases document visibility listener');
      check(item.calls.obstacleReleased===1,'disposal is idempotent');
    }
    let queuedRequests=0;
    const queued=create(async()=>{queuedRequests++;return {ok:false};});
    queued.choose('rowan');queued.controller.dispose();
    await pause(350);
    check(queuedRequests===0,'disposal cancels queued appearance request');

    let release,started;
    const begun=new Promise(resolve=>{started=resolve;}),requests=[];
    const pending=create(id=>{requests.push(id);started();return new Promise(resolve=>{release=resolve;});});
    pending.choose('rowan');await begun;
    pending.choose('vesper');pending.controller.dispose();
    const appearance=pending.controller.appearance,traversal=pending.calls.traversal;
    release({ok:true,player:{appearance:'rowan-human'}});
    await pause(2300);
    check(pending.controller.appearance===appearance&&pending.calls.traversal===traversal,'late appearance reply cannot mutate the disposed controller');
    check(requests.length===1,'late reply cannot schedule the next queued appearance');
    // A post-disposal snapshot is another late producer, independent of the reply.
    pending.controller.setSharedIdentity({name:'Fixture',appearance:'rowan-human'});
    check(pending.controller.appearance===appearance&&pending.calls.traversal===traversal,'late identity snapshots stay inert');
    return {checks,queuedRequests,requests};
  });
  if(errors.length)throw new Error(errors.join('; '));
  const failed=result.checks.filter(check=>!check.passed);
  if(failed.length)throw new Error(JSON.stringify({failed,queuedRequests:result.queuedRequests,requests:result.requests}));
  return {...result,errors};
}
