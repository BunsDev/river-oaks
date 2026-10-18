import { createOfficeDeskUI } from './office-desk-ui.js';
import { officesFor, OFFICE_SPEED, OFFICE_SPAWN } from './office-contract.js';
import {
  OFFICE_EYE_HEIGHT, OFFICE_LAYOUT_LEGACY, OFFICE_SEATED_EYE_HEIGHT, officeLayout, officeNearbyPortal,
  officeNearbySeat, officeSeat, officeView, officeViews, officeWorkstations, officeElevationAt, officeStep,
} from './office-layouts.js';
import { createOfficeScene } from './office-scene.js';
import './office.css';
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;};
const messages={office_permission_required:'This office is private. An invitation from Jevica is required.',office_lobby_required:'Walk to the office lobby to take the elevator.',office_lobby_blocked:'The lobby is temporarily obstructed.',office_owner_required:'Only Jevica can manage office access.',office_request_limit:'The request list is full. Please try again later.',office_guest_limit:'The guest list is full.',office_request_missing:'That request has already been handled.',rate_limited:'Please wait a moment and try again.',office_portal_out_of_reach:'Step closer to the stairs or lift.',office_landing_blocked:'Someone is standing where you would arrive. Try again in a moment.',office_layout_stale:'The office changed. Rejoining your visit…',office_level_stale:'Position corrected by the office.',invalid_office_portal:'That way is not available here.',office_seat_out_of_reach:'Step closer to the chair.',office_seat_occupied:'Someone is already sitting there.',office_seat_blocked:'Someone is standing where you would sit. Try again in a moment.',office_stand_blocked:'There is no room to stand up yet. Try again in a moment.',office_seated:'Stand up first.',office_already_seated:'You are already seated.',office_not_seated:'You are already standing.',invalid_office_seat:'That seat is not available here.'};
export function createOfficeUI({host,panelHost,renderer,getWorld,getMultiplayer,walking,captureStreet=()=>null,createScene=createOfficeScene}) {
  const lifetime=new AbortController(),signal=lifetime.signal;
  const panel=el('section',null,'office-panel');panel.hidden=true;
  const title=el('h3','Jevica’s office'),description=el('p','Entry by invitation from Jevica · Level 6'),status=el('p');status.setAttribute('role','status');
  const button=(text,id,fn)=>{const b=el('button',text);if(id)b.id=id;b.type='button';b.addEventListener('click',fn,{signal});return b;};
  const lobby=button('Go to office lobby','office-lobby',async()=>{const m=getMultiplayer(),o=catalog()[0];if(!m?.connected||!o)return;const result=await m.travel({position:o.entrance});say(result.ok?'Office lobby · F takes the elevator.':result.message);});
  const enter=button('Take elevator · F','office-enter',()=>void enterOffice());enter.disabled=true;
  const retryCancel=button('Finish cancelling entry','office-cancel-retry',()=>void finishCancellation(cancelledEntry));retryCancel.hidden=true;
  const management=el('div',null,'office-management');management.id='office-management';
  panel.append(title,description,lobby,enter,retryCancel,status,management);panelHost.append(panel);
  const guestPrompt=el('dialog',null,'office-request-dialog');guestPrompt.id='office-request-dialog';guestPrompt.setAttribute('aria-labelledby','office-request-title');
  const guestHeading=el('h2','Visit Jevica’s office');guestHeading.id='office-request-title';const guestStatus=el('p');guestStatus.setAttribute('role','status');
  const guestClose=button('Close',null,()=>guestPrompt.close());guestPrompt.append(guestHeading,guestStatus,guestClose);document.body.append(guestPrompt);guestPrompt.addEventListener('close',()=>host.focus({preventScroll:true}),{signal});
  const pendingDialog=el('dialog',null,'office-request-dialog office-pending');pendingDialog.id='office-pending';pendingDialog.setAttribute('aria-labelledby','office-pending-title');
  const pendingTitle=el('h2','Calling your elevator','office-pending-title');pendingTitle.id='office-pending-title';
  const pendingStatus=el('p','Checking your office access…');pendingStatus.setAttribute('role','status');
  const cancelEntry=()=>{if(!entryAttempt)return;entryAttempt.cancelled=true;if(entryAttempt.sent){cancelledEntry=entryAttempt;void finishCancellation(cancelledEntry);}busy=false;pendingDialog.close();say('Elevator entry cancelled.');};
  pendingDialog.append(pendingTitle,pendingStatus,button('Cancel entry','office-entry-cancel',cancelEntry));document.body.append(pendingDialog);
  pendingDialog.addEventListener('cancel',e=>{e.preventDefault();cancelEntry();},{signal});pendingDialog.addEventListener('close',()=>host.focus({preventScroll:true}),{signal});
  const nearby=button('Office elevator · F','office-nearby',()=>void enterOffice());nearby.hidden=true;host.append(nearby);
  const dialog=el('dialog',null,'office-visit');dialog.id='office-visit';dialog.tabIndex=-1;dialog.setAttribute('aria-labelledby','office-title');
  const header=el('header'),heading=el('h2','Jevica’s office');heading.id='office-title';
  const label=el('p');label.setAttribute('role','status');
  const skip=button('Skip arrival','office-skip',()=>view?.skip());
  const exit=button('Return to street','office-exit',()=>void leaveOffice());
  const accessButton=button('Office access','office-access',()=>{management.hidden=!management.hidden;accessButton.setAttribute('aria-expanded',String(!management.hidden));});accessButton.setAttribute('aria-expanded','false');
  const voiceJoin=button('Join voice · Y','office-voice',()=>void mp()?.voice?.toggleJoin()),voiceMic=button('Microphone off · M','office-mic',()=>void mp()?.voice?.toggleMic());
  let desk=null,deskAccount=null;
  const openDesk=()=>{if(phase!=='office'||!view)return;if(viewId)setView(null);keys.clear();mp()?.voice?.setTransmit(false);desk??=createOfficeDeskUI({getMultiplayer:mp,onClose:()=>{keys.clear();dialog.focus({preventScroll:true});}});deskAccount=mp()?.identity?.id;void desk.open();};
  const deskButton=button('Open desk · E','office-desk-open',openDesk);deskButton.hidden=true;
  const deskNearby=button('Use this desk · E','office-desk-nearby',openDesk);deskNearby.hidden=true;dialog.append(deskNearby);
  // Stairs and lift are server transitions from their entry; the button appears only within reach.
  const levelButton=button('Take the stairs · Q','office-level',()=>void changeLevel());levelButton.hidden=true;dialog.append(levelButton);
  // Chairs are server claims made from their stand point; the server answers with the seated pose.
  const seatButton=button('Sit down · Z','office-seat',()=>void toggleSeat());seatButton.hidden=true;dialog.append(seatButton);
  // Views (#363) move only this visitor's camera: no command, no position, no collision.
  const viewSelect=el('select');viewSelect.id='office-view';viewSelect.setAttribute('aria-label','Office view');viewSelect.hidden=true;
  // Choosing with the pointer hands focus back to the office, so V, WASD and Escape keep working.
  viewSelect.addEventListener('change',()=>{setView(viewSelect.value||null);dialog.focus({preventScroll:true});},{signal});
  const identity=el('div',null,'office-identity'),eyebrow=el('span','RIVER OAKS · PRIVATE OFFICES','office-eyebrow');identity.append(eyebrow,heading,label);
  const actions=el('div',null,'office-actions');actions.append(skip,deskButton,viewSelect,accessButton,voiceJoin,voiceMic,exit);header.append(identity,actions);
  const journey=el('div',null,'office-journey');journey.setAttribute('aria-hidden','true');
  const progress=el('progress');progress.max=1;progress.value=0;journey.append(el('span','LOBBY'),progress,el('span','06 · OFFICE'));
  const WALKING_HELP='WASD to walk · Drag or ← → to look · Escape returns to street';
  const help=el('p',WALKING_HELP,'office-help');
  const pad=el('nav',null,'office-pad');pad.setAttribute('aria-label','Office movement');
  dialog.append(header,journey,help,pad);document.body.append(dialog);
  const headerSize=typeof ResizeObserver==='function'?new ResizeObserver(()=>dialog.style.setProperty('--office-header-bottom',`${Math.ceil(header.getBoundingClientRect().bottom)+10}px`)):null;
  headerSize?.observe(header);
  const keys=new Set();let view=null,position=[...OFFICE_SPAWN],yaw=0,layoutId=OFFICE_LAYOUT_LEGACY,levelId=null,levelPending=false,seatId=null,seatPending=false,viewId=null,closing=false,phase='closed',busy=false,entryAttempt=null,cancelledEntry=null,movePending=false,lastMove=0,lastPoll=0,lastPanelCheck=-Infinity,polling=null,failedOffice=null,epoch=0,currentOffice=null,owned=false,lastState='',disposed=false,accountKey='',openedAt=0;
  const catalog=()=>officesFor(getWorld()??{}),mp=()=>getMultiplayer();
  const self=()=>mp()?.snapshot?.players.find(p=>p.id===mp()?.identity?.id);
  accountKey=`${mp()?.identity?.id??''}:${Boolean(self())}`;
  const say=text=>{status.textContent=text??'';guestStatus.textContent=text??'';};
  const near=()=>{const o=catalog()[0],p=walking.getPosition();return Boolean(o&&p&&Math.hypot(o.entrance[0]-p[0],o.entrance[1]-p[1])<3&&walking.getPose()?.altitude<.1&&!walking.riding);};
  async function send(action,data={}) {const m=mp();if(!m?.connected)return {ok:false,message:'Reconnect to visit an office.'};const token=epoch,id=m.identity?.id;try{const result=await m.command({type:'office',action,officeId:action==='list'?catalog()[0]?.id:self()?.office?.id??currentOffice?.id??catalog()[0]?.id,...data});return !disposed&&token===epoch&&mp()===m&&m.connected&&id===m.identity?.id?result:{ok:false,error:'stale_office_response',message:'Your connection changed. Please try again.'};}catch{return {ok:false,message:'Connection interrupted. Please try again.'};}}
  function refresh() {
    if(polling)return polling;
    if(!mp()?.connected||!catalog().length||disposed)return Promise.resolve();
    const token=epoch;const pending=(async()=>{const result=await send('list');
    if(disposed||token!==epoch)return;
    if(!result.ok){say(result.message);return;}
    currentOffice=result.offices[0];if(!currentOffice)return;
    owned=currentOffice.access==='owner';
    enter.disabled=!mp()?.connected||!near()||!currentOffice.access||busy||Boolean(entryAttempt);
    if(currentOffice.access&&guestPrompt.open)guestPrompt.close();
    say(owned?'You own this office. Invite a resident to grant access.':currentOffice.access?'Jevica has invited you to her office.':'An invitation from Jevica is required to enter.');
    renderManagement();
    })();polling=pending;void pending.finally(()=>{if(polling===pending)polling=null;});return pending;
  }
  function renderManagement(){
    const state=JSON.stringify([currentOffice,mp()?.snapshot?.players.map(p=>[p.id,p.name])]);if(state===lastState)return;lastState=state;
    management.replaceChildren();if(!owned)return;
    const h=el('h4','Office guests'),select=el('select');select.setAttribute('aria-label','Resident to invite');
    for(const p of mp()?.snapshot?.players??[])if(p.id!==self()?.id&&!p.canBuild){const option=el('option',p.name);option.value=p.id;select.append(option);}
    const invite=button('Invite resident',null,()=>void action('invite',{peerId:select.value}));invite.disabled=!select.options.length;
    if(invite.disabled){const option=el('option','No other residents in town');option.value='';select.append(option);select.disabled=true;}
    management.append(h,select,invite);
    for(const g of currentOffice.guests??[]){const row=el('div',null,'office-person');row.append(el('span',g.name),button('Revoke access',null,()=>void action('revoke',{peerId:g.userId})));management.append(row);}
  }
  async function action(name,data){if(busy||entryAttempt)return;busy=true;const r=await send(name,data);busy=false;if(disposed)return;if(r.ok){lastState='';await refresh();}else say(messages[r.error]??r.message);}
  function open(player,cinematic,street=captureStreet()){
    if(view||disposed)return;epoch++;walking.halt();position=[...player.office.position];yaw=player.office.yaw;phase='loading';
    layoutId=officeLayout(player.office.layout)?player.office.layout:OFFICE_LAYOUT_LEGACY;levelId=heldLevelId=player.office.levelId??officeLayout(layoutId).spawn.levelId;levelPending=false;
    seatId=player.office.seat?.id??null;seatPending=false;viewId=null;help.textContent=WALKING_HELP;
    viewSelect.replaceChildren(...[{id:'',label:'Walking view'},...officeViews(officeLayout(layoutId))].map(item=>{const option=el('option',item.label);option.value=item.id;return option;}));viewSelect.value='';
    heading.textContent='Jevica’s office';
    label.textContent='Preparing your avatar · You can skip or return';
    management.hidden=true;dialog.append(management);accessButton.hidden=!owned;
    dialog.dataset.phase=phase;dialog.dataset.position=JSON.stringify(position);dialog.showModal();dialog.focus();document.body.classList.add('visiting-office');
    openedAt=performance.now();
    try{view=createScene({renderer,host:dialog,self:player,players:mp().snapshot.players,reducedMotion:!cinematic||matchMedia('(prefers-reduced-motion: reduce)').matches,street});}
    catch{failedOffice=player.office.id;close();say('The office could not load. Please try again.');void send('leave');}
  }
  const layout=()=>officeLayout(layoutId),elevation=()=>officeElevationAt(layout(),levelId,position)??0;
  // Seats other visitors hold are collision for prediction, as on the server.
  const occupied=()=>(mp()?.snapshot?.players??[]).filter(p=>p.id!==mp()?.identity?.id&&p.office?.seat&&p.office.id===self()?.office?.id&&p.office.layout===layoutId)
    .map(p=>officeSeat(layout(),p.office.seat.id)).filter(Boolean);
  function setView(id){
    if(phase!=='office'||!view||desk?.active)return;
    viewId=officeView(layout(),id)?.id??null;viewSelect.value=viewId??'';keys.clear();
    help.textContent=viewId?`${officeView(layout(),viewId).label} view · V for the next · Escape, WASD or the pad to walk`:WALKING_HELP;
  }
  const cycleView=()=>{const ids=officeViews(layout()).map(item=>item.id);setView(viewId?ids[ids.indexOf(viewId)+1]??null:ids[0]??null);};
  async function toggleSeat(){
    if(seatPending||levelPending||busy||phase!=='office'||!view||desk?.active||layoutId===OFFICE_LAYOUT_LEGACY)return;
    if(viewId)setView(null);
    const seat=seatId?null:officeNearbySeat(layout(),levelId,position);if(!seatId&&(!seat||occupied().includes(seat)))return;
    seatPending=true;keys.clear();const token=epoch;
    const r=await send(seatId?'stand':'sit',seatId?{layout:layoutId}:{seatId:seat.id,layout:layoutId});
    if(token!==epoch||disposed)return;seatPending=false;
    if(r.ok&&r.office){seatId=r.office.seat?.id??null;position=[...r.office.position];yaw=r.office.yaw;}
    else label.textContent=messages[r.error]??r.message??'That seat is not available right now.';
  }
  // Penthouse commands name the layout and floor they were computed on, so a stale one is refused.
  // Walking the stair can change the predicted floor before the server has seen that move, so a
  // move names the floor the server holds (where it starts) and adopts the floor it answers with.
  let heldLevelId=null;
  const placement=()=>layoutId===OFFICE_LAYOUT_LEGACY?{}:{layout:layoutId,levelId:heldLevelId??levelId};
  async function changeLevel(){
    if(levelPending||busy||phase!=='office'||!view||desk?.active)return;
    const portal=officeNearbyPortal(layout(),levelId,position);if(!portal)return;
    if(viewId)setView(null);levelPending=true;keys.clear();const token=epoch;
    const r=await send('transition',{portalId:portal.id,layout:layoutId});
    if(token!==epoch||disposed)return;levelPending=false;
    if(r.ok&&r.office){levelId=heldLevelId=r.office.levelId;position=[...r.office.position];label.textContent=layout().levels.find(l=>l.id===levelId)?.index?'Mezzanine · Library':'Main floor';}
    else label.textContent=messages[r.error]??r.message??'That way is not available right now.';
  }
  function close(){desk?.suspend();epoch++;levelPending=false;seatPending=false;seatId=null;viewId=null;viewSelect.value='';help.textContent=WALKING_HELP;mp()?.voice?.setTransmit(false);view?.dispose();view=null;keys.clear();phase='closed';movePending=false;panel.append(management);management.hidden=false;closing=true;dialog.close();closing=false;document.body.classList.remove('visiting-office');walking.halt();host.focus({preventScroll:true});}
  const sameAccount=attempt=>mp()===attempt.client&&mp()?.connected&&mp()?.identity?.id===attempt.account;
  async function finishCancellation(attempt){
    if(!attempt||attempt.cleanupPending||!sameAccount(attempt))return;
    attempt.cleanupStarted=true;attempt.cleanupPending=true;retryCancel.disabled=true;
    // Commands on this connection are ordered. A leave sent after the entry
    // cancels it even when its acknowledgement/snapshot has not reached us yet.
    let result;try{result=await attempt.client.command({type:'office',action:'leave',officeId:attempt.officeId});}catch{result={ok:false};}
    attempt.cleanupPending=false;if(disposed||!sameAccount(attempt)||cancelledEntry!==attempt)return;
    attempt.leaveConfirmed=Boolean(result.ok);retryCancel.disabled=false;retryCancel.hidden=attempt.leaveConfirmed;
    if(attempt.leaveConfirmed)say('Entry cancelled. You can continue along the street.');
    else say('Entry cancellation could not finish. Choose Finish cancelling entry to retry.');
  }
  async function enterOffice(){
    if(cancelledEntry){void finishCancellation(cancelledEntry);return;}
    if(busy||view||entryAttempt)return;if(!near()){say('Go to the office lobby first.');return;}
    const attempt={cancelled:false,client:mp(),account:mp()?.identity?.id,officeId:currentOffice?.id??catalog()[0]?.id,sent:false};entryAttempt=attempt;busy=true;
    pendingStatus.textContent='Checking your office access…';pendingDialog.showModal();
    try{
      const token=epoch;if(!currentOffice)await refresh();
      if(disposed||token!==epoch||attempt.cancelled||!currentOffice)return;
      if(!currentOffice.access){pendingDialog.close();if(!guestPrompt.open)guestPrompt.showModal();return;}
      attempt.officeId=currentOffice.id;failedOffice=null;walking.halt();pendingStatus.textContent='Your elevator is ready. Preparing your arrival…';
      attempt.street=captureStreet();attempt.sent=true;const r=await send('enter');
      if(attempt.cancelled||disposed){
        if(!attempt.cleanupStarted&&sameAccount(attempt)){cancelledEntry=attempt;await finishCancellation(attempt);}
        return;
      }
      if(!sameAccount(attempt)||token!==epoch)return;
      pendingDialog.close();if(!r.ok){say(messages[r.error]??r.message);if(r.error==='office_permission_required'&&!guestPrompt.open)guestPrompt.showModal();return;}
      const p=self();if(p?.office)open(p,true,attempt.street);
    }finally{if(entryAttempt===attempt){entryAttempt=null;busy=false;if(pendingDialog.open)pendingDialog.close();}}
  }
  async function leaveOffice(){
    if(busy)return;busy=true;keys.clear();const r=await send('leave');busy=false;
    if(disposed)return;if(r.ok){close();say('You’re back under the office canopy. Continue along the street.');void refresh();}else label.textContent=r.message;
  }
  // Escape leaves a view before it leaves the office.
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(viewId){setView(null);return;}void leaveOffice();},{signal});
  // A browser may close the modal on a second Escape without a cancel event. Keep the dialog
  // and the visit consistent: reopen it and leave properly.
  dialog.addEventListener('close',()=>{if(!view||closing)return;dialog.showModal();void leaveOffice();},{signal});
  const typing=e=>e.target.closest('input,select,textarea,button');
  dialog.addEventListener('keydown',e=>{if(desk?.active||typing(e)||e.metaKey||e.ctrlKey||e.altKey)return;if(e.code==='KeyE'&&!e.repeat){e.preventDefault();openDesk();return;}if(e.code==='KeyQ'&&!e.repeat){e.preventDefault();void changeLevel();return;}if(e.code==='KeyZ'&&!e.repeat){e.preventDefault();void toggleSeat();return;}if(e.code==='KeyV'&&!e.repeat){e.preventDefault();cycleView();return;}if(e.code==='KeyY'&&!e.repeat){e.preventDefault();void mp()?.voice?.toggleJoin();}if(e.code==='KeyM'){e.preventDefault();const v=mp()?.voice;if(v?.state.pushToTalk)v.setTransmit(true);else if(!e.repeat)void v?.toggleMic();}if(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();if(viewId)setView(null);keys.add(e.code);}},{signal});
  dialog.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyM')mp()?.voice?.setTransmit(false);},{signal});
  let drag=null;
  dialog.addEventListener('pointerdown',e=>{if(e.target!==dialog||phase!=='office'||desk?.active||viewId)return;dialog.focus();drag={id:e.pointerId,x:e.clientX};dialog.setPointerCapture(e.pointerId);},{signal});
  dialog.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId||phase!=='office'||desk?.active)return;yaw-=(e.clientX-drag.x)*.004;drag.x=e.clientX;},{signal});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])dialog.addEventListener(event,()=>{drag=null;},{signal});
  for(const [key,text]of [['KeyW','Forward'],['KeyA','Left'],['KeyS','Back'],['KeyD','Right'],['ArrowLeft','Turn left'],['ArrowRight','Turn right']]){
    const b=button(text,null,()=>{});b.dataset.officeKey=key;pad.append(b);
    b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(viewId)setView(null);keys.add(key);},{signal});
    for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])b.addEventListener(event,()=>keys.delete(key),{signal});
    b.addEventListener('keydown',e=>{if(['Enter','Space'].includes(e.code)){e.preventDefault();if(viewId)setView(null);keys.add(key);}},{signal});b.addEventListener('keyup',()=>keys.delete(key),{signal});
  }
  window.addEventListener('blur',()=>keys.clear(),{signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();},{signal});
  host.addEventListener('keydown',e=>{if(e.code==='KeyF'&&!e.repeat&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&near()&&!view&&!e.target.closest('input,textarea,select,button')){e.preventDefault();e.stopImmediatePropagation();void enterOffice();}},{capture:true,signal});
  return {
    get pose(){const floor=view?elevation():0;return view?{position:[position[0],(seatId?OFFICE_SEATED_EYE_HEIGHT:OFFICE_EYE_HEIGHT)+floor,-position[1]],ground:floor,altitude:0,yaw,office:true}:null;},
    get active(){return Boolean(view);},get entering(){return busy;},
    prepare(now){view?.prepare?.(now);},
    reset(){if(entryAttempt)cancelEntry();if(view)close();},
    sync(players,selfId){
      if(desk&&deskAccount!==mp()?.identity?.id){desk.reset();deskAccount=mp()?.identity?.id;}
      const p=players.find(p=>p.id===selfId),id=mp()?.identity?.id??selfId??'',key=`${id}:${Boolean(p)}`;
      if(key!==accountKey){
        const identityChanged=id!==accountKey.slice(0,accountKey.lastIndexOf(':'));accountKey=key;epoch++;
        if(entryAttempt)cancelEntry();if(view)close();
        if(identityChanged){cancelledEntry=null;}
        else if(cancelledEntry&&!p){
          // A reconnect can resume the server's departure-grace visit. Keep the
          // cancellation intention, but fence cleanup from the old connection.
          cancelledEntry={...cancelledEntry,client:mp(),cleanupPending:false,cleanupStarted:false,leaveConfirmed:false};
        }
        retryCancel.hidden=!cancelledEntry;busy=false;polling=null;currentOffice=null;owned=false;lastState='';management.replaceChildren();accessButton.hidden=true;lastPoll=0;lastPanelCheck=-Infinity;if(guestPrompt.open)guestPrompt.close();
      }
      if(cancelledEntry&&p&&mp()?.connected&&!cancelledEntry.cleanupStarted){cancelledEntry.client=mp();void finishCancellation(cancelledEntry);}
      if(!p?.office)failedOffice=null;
      if(cancelledEntry?.leaveConfirmed&&!p?.office){cancelledEntry=null;retryCancel.hidden=true;}
      if(view&&!p?.office){close();say(p?'Your office visit has ended.':'Reconnect to continue your visit.');}
      // A restored authorized visit resumes without replaying the film. The
      // initiating command owns its cinematic until its acknowledgement arrives.
      else if(p?.office&&!view&&!busy&&!entryAttempt&&!cancelledEntry&&failedOffice!==p.office.id)open(p,false);
      // The server owns the floor: adopt a level it moved this visit to (another tab, a correction).
      else if(view&&p?.office?.levelId&&p.office.levelId!==(heldLevelId??levelId)&&!levelPending&&!movePending){levelId=heldLevelId=p.office.levelId;position=[...p.office.position];}
      // The server owns seats too: adopt a claim or release it made elsewhere (another tab, a restore, a correction).
      else if(view&&p?.office&&!seatPending&&(p.office.seat?.id??null)!==seatId){seatId=p.office.seat?.id??null;position=[...p.office.position];yaw=p.office.yaw;}
    },
    update(now,delta){
      panel.hidden=!catalog().length;const at=near(),connected=mp()?.connected;
      nearby.textContent=cancelledEntry?'Finish cancelling entry · F':currentOffice?.access?'Jevica’s office · Level 6 · F':'Jevica’s office · Invitation required · F';nearby.hidden=Boolean(view)||Boolean(entryAttempt&&!entryAttempt.cancelled)||!at||!connected;enter.disabled=!connected||!at||busy||Boolean(entryAttempt)||Boolean(cancelledEntry)||!currentOffice?.access;
      if(connected&&!document.hidden&&now-lastPoll>5000){
        let interested=at||view||guestPrompt.open||entryAttempt;
        // A hidden panel never advances lastPoll. Bound its layout read separately
        // while nearby visitors and active visits retain immediate eligibility.
        if(!interested&&now-lastPanelCheck>=250){lastPanelCheck=now;interested=panel.checkVisibility?.();}
        if(interested){lastPoll=now;void refresh();}
      }
      if(!view)return false;
      if(!connected||!self()?.office){close();return false;}
      if(document.hidden){keys.clear();return true;}
      if(phase==='loading'&&now-openedAt>45000&&!busy){void leaveOffice();say('Your avatar could not load in time. Please try the elevator again.');return true;}
      const voice=mp()?.voice?.state;voiceJoin.disabled=!voice?.available;voiceJoin.textContent=voice?.status==='joined'?'Leave voice · Y':'Join voice · Y';voiceMic.disabled=voice?.status!=='joined';voiceMic.textContent=voice?.mic==='on'?'Mute microphone · M':'Microphone off · M';
      if(phase==='office'&&!busy&&!desk?.active){
        yaw+=((keys.has('ArrowLeft')?1:0)-(keys.has('ArrowRight')?1:0))*delta*1.6;
        let f=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),s=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);const l=Math.hypot(f,s)||1;f/=l;s/=l;
        // Seated visitors look around but do not walk; standing up is a server command.
        const speed=seatId||seatPending||viewId?0:OFFICE_SPEED*delta;if(speed)({position,levelId}=officeStep(layout(),levelId,position,(s*Math.cos(yaw)-f*Math.sin(yaw))*speed,(f*Math.cos(yaw)+s*Math.sin(yaw))*speed,occupied()));
        if(speed&&now-lastMove>=200&&!movePending&&!levelPending){lastMove=now;movePending=true;const token=epoch;void send('move',{position:[...position],yaw,...placement()}).then(r=>{if(token!==epoch||disposed)return;movePending=false;if(r.ok&&r.office)heldLevelId=r.office.levelId;if(!r.ok){const p=self()?.office;if(p){position=[...p.position];yaw=p.yaw;levelId=heldLevelId=p.levelId??levelId;}label.textContent=messages[r.error]??'Position corrected by the office.';}});}
      }
      const frame=view.render(now,position,yaw,mp().snapshot.players,{layoutId,levelId,...(seatId?{seatId}:{}),...(viewId?{viewId}:{})});if(!frame)return true;
      if(phase!==frame.phase){phase=frame.phase;dialog.dataset.phase=phase;label.textContent={loading:'Preparing your avatar · You can skip or return',lobby:'Welcome · Your elevator is ahead',boarding:'Boarding your elevator',closing:'Doors closing',ascending:'Going up',opening:'Level 6 · Doors opening',arriving:'Welcome to your office',office:'Level 6 · Your workspace'}[phase];}
      if(phase==='ascending')label.textContent=`Going up · Level ${frame.floor}`;
      journey.hidden=phase==='office';progress.value=frame.progress??0;voiceJoin.hidden=voiceMic.hidden=phase!=='office';
      deskButton.hidden=phase!=='office';deskNearby.hidden=phase!=='office'||Boolean(desk?.active)||!(officeSeat(layout(),seatId)?.workstation||officeWorkstations(layout(),levelId).some(s=>Math.hypot(position[0]-s.approach[0],position[1]-s.approach[1])<1.3));
      const portal=phase==='office'&&!desk?.active&&!seatId?officeNearbyPortal(layout(),levelId,position):null;levelButton.hidden=!portal||levelPending;
      const chair=phase==='office'&&!desk?.active&&layoutId!==OFFICE_LAYOUT_LEGACY?(seatId?officeSeat(layout(),seatId):officeNearbySeat(layout(),levelId,position)):null;
      const taken=Boolean(chair&&!seatId&&occupied().includes(chair));
      viewSelect.hidden=phase!=='office'||!officeViews(layout()).length;
      seatButton.hidden=!chair||seatPending;seatButton.disabled=taken;seatButton.textContent=seatId?'Stand up · Z':taken?'Seat taken':'Sit down · Z';
      if(portal)levelButton.textContent=portal.kind==='lift'?'Use the lift · Q':layout().levels.find(l=>l.id===portal.toLevelId)?.index?'Take the stairs up · Q':'Take the stairs down · Q';
      accessButton.hidden=!owned||phase!=='office';skip.hidden=phase==='office';help.hidden=phase!=='office';pad.hidden=phase!=='office';dialog.dataset.position=JSON.stringify(position);
      return true;
    },
    inspect(){return view?.inspect?.()??null;},
    dispose(){disposed=true;if(entryAttempt)cancelEntry();lifetime.abort();headerSize?.disconnect();close();desk?.dispose();panel.remove();dialog.remove();guestPrompt.remove();pendingDialog.remove();nearby.remove();},
  };
}
