import { createOfficeDeskUI } from './office-desk-ui.js';
import { officesFor, OFFICE_ROOM, OFFICE_SPEED, OFFICE_SPAWN, stepOffice } from './office-contract.js';
import { createOfficeScene } from './office-scene.js';
import './office.css';
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;};
const messages={office_permission_required:'This office is private. Ask Jevica for access.',office_lobby_required:'Walk to the office lobby to take the elevator.',office_lobby_blocked:'The lobby is temporarily obstructed.',office_owner_required:'Only Jevica can manage office access.',office_request_limit:'The request list is full. Please try again later.',office_guest_limit:'The guest list is full.',office_request_missing:'That request has already been handled.',rate_limited:'Please wait a moment and try again.'};
export function createOfficeUI({host,panelHost,renderer,getWorld,getMultiplayer,walking,createScene=createOfficeScene}) {
  const lifetime=new AbortController(),signal=lifetime.signal;
  const panel=el('section',null,'office-panel');panel.hidden=true;
  const title=el('h3','Offices'),description=el('p','Private offices · Level 6 · Owned by Jevica'),status=el('p');status.setAttribute('role','status');
  const button=(text,id,fn)=>{const b=el('button',text);if(id)b.id=id;b.type='button';b.addEventListener('click',fn,{signal});return b;};
  const lobby=button('Go to office lobby','office-lobby',async()=>{const m=getMultiplayer(),o=catalog()[0];if(!m?.connected||!o)return;const result=await m.travel({position:o.entrance});say(result.ok?'Office lobby · F takes the elevator.':result.message);});
  const enter=button('Take elevator · F','office-enter',()=>void enterOffice());enter.disabled=true;
  const request=button('Request a visit','office-request',()=>void action('request'));
  const management=el('div',null,'office-management');management.id='office-management';
  panel.append(title,description,lobby,enter,request,status,management);panelHost.append(panel);
  const guestPrompt=el('dialog',null,'office-request-dialog');guestPrompt.id='office-request-dialog';guestPrompt.setAttribute('aria-labelledby','office-request-title');
  const guestHeading=el('h2','Visit Jevica’s office');guestHeading.id='office-request-title';const guestStatus=el('p');guestStatus.setAttribute('role','status');
  const guestRequest=button('Request a visit','office-request-send',()=>void action('request'));
  const guestClose=button('Close',null,()=>guestPrompt.close());guestPrompt.append(guestHeading,guestStatus,guestRequest,guestClose);document.body.append(guestPrompt);guestPrompt.addEventListener('close',()=>host.focus({preventScroll:true}),{signal});
  const nearby=button('Office elevator · F','office-nearby',()=>void enterOffice());nearby.hidden=true;host.append(nearby);
  const dialog=el('dialog',null,'office-visit');dialog.id='office-visit';dialog.tabIndex=-1;dialog.setAttribute('aria-labelledby','office-title');
  const header=el('header'),heading=el('h2','Jevica’s office');heading.id='office-title';
  const label=el('p');label.setAttribute('role','status');
  const skip=button('Skip arrival','office-skip',()=>view?.skip());
  const exit=button('Return to lobby','office-exit',()=>void leaveOffice());
  const accessButton=button('Office access','office-access',()=>{management.hidden=!management.hidden;accessButton.setAttribute('aria-expanded',String(!management.hidden));});accessButton.setAttribute('aria-expanded','false');
  const voiceJoin=button('Join voice · Y','office-voice',()=>void mp()?.voice?.toggleJoin()),voiceMic=button('Microphone off · M','office-mic',()=>void mp()?.voice?.toggleMic());
  let desk=null,deskAccount=null;
  const openDesk=()=>{if(phase!=='office'||!view)return;keys.clear();mp()?.voice?.setTransmit(false);desk??=createOfficeDeskUI({getMultiplayer:mp,onClose:()=>{keys.clear();dialog.focus({preventScroll:true});}});deskAccount=mp()?.identity?.id;void desk.open();};
  const deskButton=button('Open desk · E','office-desk-open',openDesk);deskButton.hidden=true;
  const deskNearby=button('Use this desk · E','office-desk-nearby',openDesk);deskNearby.hidden=true;dialog.append(deskNearby);
  header.append(heading,label,skip,deskButton,accessButton,voiceJoin,voiceMic,exit);
  const help=el('p','WASD to walk · Drag or ← → to look · Escape returns to lobby','office-help');
  const pad=el('nav',null,'office-pad');pad.setAttribute('aria-label','Office movement');
  dialog.append(header,help,pad);document.body.append(dialog);
  const keys=new Set();let view=null,position=[...OFFICE_SPAWN],yaw=0,phase='closed',busy=false,movePending=false,lastMove=0,lastPoll=0,polling=null,failedOffice=null,epoch=0,currentOffice=null,owned=false,lastState='',disposed=false,accountKey='',openedAt=0;
  const catalog=()=>officesFor(getWorld()??{}),mp=()=>getMultiplayer();
  const self=()=>mp()?.snapshot?.players.find(p=>p.id===mp()?.identity?.id);
  const say=text=>{status.textContent=text??'';guestStatus.textContent=text??'';};
  const near=()=>{const o=catalog()[0],p=walking.getPosition();return Boolean(o&&p&&Math.hypot(o.entrance[0]-p[0],o.entrance[1]-p[1])<3&&walking.getPose()?.altitude<.1&&!walking.riding);};
  async function send(action,data={}) {const m=mp();if(!m?.connected)return {ok:false,message:'Reconnect to visit an office.'};const token=epoch,id=m.identity?.id;try{const result=await m.command({type:'office',action,officeId:catalog()[0]?.id,...data});return !disposed&&token===epoch&&mp()===m&&m.connected&&id===m.identity?.id?result:{ok:false,error:'stale_office_response',message:'Your connection changed. Please try again.'};}catch{return {ok:false,message:'Connection interrupted. Please try again.'};}}
  function refresh() {
    if(polling)return polling;
    if(!mp()?.connected||!catalog().length||disposed)return Promise.resolve();
    const token=epoch;const pending=(async()=>{const result=await send('list');
    if(disposed||token!==epoch)return;
    if(!result.ok){say(result.message);return;}
    currentOffice=result.offices[0];owned=currentOffice.access==='owner';
    if(currentOffice.access&&guestPrompt.open)guestPrompt.close();
    request.hidden=Boolean(currentOffice.access);request.disabled=Boolean(currentOffice.requested);request.textContent=currentOffice.requested?'Visit requested':'Request a visit';guestRequest.disabled=request.disabled;guestRequest.hidden=request.hidden;
    say(currentOffice.access==='owner'?'You own this office.':currentOffice.access?'Your visit is approved.':currentOffice.requested?'Waiting for Jevica to accept your request.':'Private office. Request access or ask Jevica to invite you.');
    renderManagement();
    })();polling=pending;void pending.finally(()=>{if(polling===pending)polling=null;});return pending;
  }
  function renderManagement(){
    const state=JSON.stringify([currentOffice,mp()?.snapshot?.players.map(p=>[p.id,p.name])]);if(state===lastState)return;lastState=state;
    management.replaceChildren();if(!owned)return;
    const h=el('h4','Office guests'),select=el('select');select.setAttribute('aria-label','Resident to invite');
    for(const p of mp()?.snapshot?.players??[])if(p.id!==self()?.id&&!p.canBuild){const option=el('option',p.name);option.value=p.id;select.append(option);}
    const invite=button('Invite resident',null,()=>void action('invite',{peerId:select.value}));invite.disabled=!select.options.length;
    management.append(h,select,invite);
    for(const r of currentOffice.requests??[]){const row=el('div',null,'office-person');row.append(el('span',r.name),button('Accept',null,()=>void action('approve',{peerId:r.userId})),button('Decline',null,()=>void action('deny',{peerId:r.userId})));management.append(row);}
    for(const g of currentOffice.guests??[]){const row=el('div',null,'office-person');row.append(el('span',g.name),button('Revoke access',null,()=>void action('revoke',{peerId:g.userId})));management.append(row);}
  }
  async function action(name,data){if(busy)return;busy=true;const r=await send(name,data);busy=false;if(disposed)return;if(r.ok){lastState='';await refresh();}else say(messages[r.error]??r.message);}
  function open(player,cinematic){
    if(view||disposed)return;epoch++;walking.halt();position=[...player.office.position];yaw=player.office.yaw;phase='loading';
    management.hidden=true;dialog.append(management);accessButton.hidden=!owned;
    dialog.dataset.phase=phase;dialog.dataset.position=JSON.stringify(position);dialog.showModal();dialog.focus();document.body.classList.add('visiting-office');
    openedAt=performance.now();
    try{view=createScene({renderer,host:dialog,self:player,players:mp().snapshot.players,reducedMotion:!cinematic||matchMedia('(prefers-reduced-motion: reduce)').matches});}
    catch{failedOffice=player.office.id;close();say('The office could not load. Please try again.');void send('leave');}
  }
  function close(){desk?.suspend();epoch++;mp()?.voice?.setTransmit(false);view?.dispose();view=null;keys.clear();phase='closed';movePending=false;panel.append(management);management.hidden=false;dialog.close();document.body.classList.remove('visiting-office');walking.halt();host.focus({preventScroll:true});}
  async function enterOffice(){
    if(busy||view)return;if(!near()){say('Go to the office lobby first.');return;}
    busy=true;const token=epoch;if(!currentOffice)await refresh();
    if(disposed||token!==epoch)return;
    if(!currentOffice){busy=false;return;}
    if(!currentOffice.access){busy=false;if(!guestPrompt.open)guestPrompt.showModal();return;}
    failedOffice=null;walking.halt();const r=await send('enter');busy=false;
    if(disposed)return;if(!r.ok){say(messages[r.error]??r.message);if(r.error==='office_permission_required'&&!guestPrompt.open)guestPrompt.showModal();return;}
    const p=self();if(p?.office)open(p,true);
  }
  async function leaveOffice(){
    if(busy)return;busy=true;keys.clear();const r=await send('leave');busy=false;
    if(disposed)return;if(r.ok){close();say('You’re back at the office lobby.');void refresh();}else label.textContent=r.message;
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();void leaveOffice();},{signal});
  const typing=e=>e.target.closest('input,select,textarea,button');
  dialog.addEventListener('keydown',e=>{if(desk?.active||typing(e)||e.metaKey||e.ctrlKey||e.altKey)return;if(e.code==='KeyE'&&!e.repeat){e.preventDefault();openDesk();return;}if(e.code==='KeyY'&&!e.repeat){e.preventDefault();void mp()?.voice?.toggleJoin();}if(e.code==='KeyM'){e.preventDefault();const v=mp()?.voice;if(v?.state.pushToTalk)v.setTransmit(true);else if(!e.repeat)void v?.toggleMic();}if(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}},{signal});
  dialog.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyM')mp()?.voice?.setTransmit(false);},{signal});
  let drag=null;
  dialog.addEventListener('pointerdown',e=>{if(e.target!==dialog)return;dialog.focus();drag={id:e.pointerId,x:e.clientX};dialog.setPointerCapture(e.pointerId);},{signal});
  dialog.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;yaw-=(e.clientX-drag.x)*.004;drag.x=e.clientX;},{signal});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])dialog.addEventListener(event,()=>{drag=null;},{signal});
  for(const [key,text]of [['KeyW','Forward'],['KeyA','Left'],['KeyS','Back'],['KeyD','Right'],['ArrowLeft','Turn left'],['ArrowRight','Turn right']]){
    const b=button(text,null,()=>{});b.dataset.officeKey=key;pad.append(b);
    b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(key);},{signal});
    for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])b.addEventListener(event,()=>keys.delete(key),{signal});
    b.addEventListener('keydown',e=>{if(['Enter','Space'].includes(e.code)){e.preventDefault();keys.add(key);}},{signal});b.addEventListener('keyup',()=>keys.delete(key),{signal});
  }
  window.addEventListener('blur',()=>keys.clear(),{signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();},{signal});
  host.addEventListener('keydown',e=>{if(e.code==='KeyF'&&!e.repeat&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&near()&&!view&&!e.target.closest('input,textarea,select,button')){e.preventDefault();e.stopImmediatePropagation();void enterOffice();}},{capture:true,signal});
  return {
    get pose(){return view?{position:[position[0],1.68,-position[1]],ground:0,altitude:0,yaw,office:true}:null;},
    get active(){return Boolean(view);},get entering(){return busy;},
    sync(players,selfId){
      if(desk&&deskAccount!==mp()?.identity?.id){desk.reset();deskAccount=mp()?.identity?.id;}
      const p=players.find(p=>p.id===selfId),key=`${selfId??''}:${Boolean(p)}`;if(key!==accountKey){accountKey=key;epoch++;busy=false;polling=null;currentOffice=null;lastPoll=0;}
      if(!p?.office)failedOffice=null;
      if(view&&!p?.office){close();say(p?'Your office visit has ended.':'Reconnect to continue your visit.');}
      // A restored authorized visit resumes without replaying the film. The
      // initiating command owns its cinematic until its acknowledgement arrives.
      else if(p?.office&&!view&&!busy&&failedOffice!==p.office.id)open(p,false);
    },
    update(now,delta){
      panel.hidden=!catalog().length;const at=near(),connected=mp()?.connected;
      nearby.textContent=currentOffice?.access?'Office elevator · F':currentOffice?.requested?'Office visit pending · F':'Request office visit · F';nearby.hidden=Boolean(view)||!at||!connected;enter.disabled=!connected||!at||busy||!currentOffice?.access;
      if(connected&&now-lastPoll>5000){lastPoll=now;void refresh();}
      if(!view)return false;
      if(!connected||!self()?.office){close();return false;}
      if(document.hidden){keys.clear();return true;}
      if(phase==='loading'&&now-openedAt>45000&&!busy){void leaveOffice();say('Your avatar could not load in time. Please try the elevator again.');return true;}
      const voice=mp()?.voice?.state;voiceJoin.disabled=!voice?.available;voiceJoin.textContent=voice?.status==='joined'?'Leave voice · Y':'Join voice · Y';voiceMic.disabled=voice?.status!=='joined';voiceMic.textContent=voice?.mic==='on'?'Mute microphone · M':'Microphone off · M';
      if(phase==='office'&&!busy&&!desk?.active){
        yaw+=((keys.has('ArrowLeft')?1:0)-(keys.has('ArrowRight')?1:0))*delta*1.6;
        let f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);const l=Math.hypot(f,s)||1;f/=l;s/=l;
        const speed=OFFICE_SPEED*delta;position=stepOffice(position,(s*Math.cos(yaw)-f*Math.sin(yaw))*speed,(f*Math.cos(yaw)+s*Math.sin(yaw))*speed);
        if(now-lastMove>=200&&!movePending){lastMove=now;movePending=true;const token=epoch;void send('move',{position:[...position],yaw}).then(r=>{if(token!==epoch||disposed)return;movePending=false;if(!r.ok){const p=self()?.office;if(p){position=[...p.position];yaw=p.yaw;}label.textContent=messages[r.error]??'Position corrected by the office.';}});}
      }
      const frame=view.render(now,position,yaw,mp().snapshot.players);if(!frame)return true;
      if(phase!==frame.phase){phase=frame.phase;dialog.dataset.phase=phase;label.textContent={loading:'Preparing your arrival…',boarding:'Walking into the elevator',closing:'Doors closing',ascending:'Going up',opening:'Level 6 · Doors opening',arriving:'Welcome to your office',office:'Level 6 · Office'}[phase];}
      if(phase==='ascending')label.textContent=`Going up · Level ${frame.floor}`;
      deskButton.hidden=phase!=='office';deskNearby.hidden=phase!=='office'||Boolean(desk?.active)||!OFFICE_ROOM.stations.some(s=>Math.hypot(position[0]-s.approach[0],position[1]-s.approach[1])<1.3);
      accessButton.hidden=!owned||phase!=='office';skip.hidden=phase==='office';help.hidden=phase!=='office';pad.hidden=phase!=='office';dialog.dataset.position=JSON.stringify(position);
      return true;
    },
    dispose(){disposed=true;lifetime.abort();close();desk?.dispose();panel.remove();dialog.remove();guestPrompt.remove();nearby.remove();},
  };
}
