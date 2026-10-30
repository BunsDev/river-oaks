import { createTownChatDock, bindTownChatComposer } from './town-chat.js';
import { createGreetingsUI } from './greetings-ui.js';
import { createWorldPolicyUI } from './world-policy-ui.js';
import { createCrimeUI } from './crime-ui.js';
import { validTownSnapshot } from './town-snapshot.js';
import './multiplayer.css';
import { DEFAULT_WORLD_ID, WORLD_PROTOCOL_VERSION, supportsWorldProtocol, ticketProtocol, worldIdFromSearch } from './world-contract.js';
import { createSocialUI } from './social-ui.js';
import { createGroupsUI } from './groups-ui.js';
import { createWorkplaceUI } from './workplace-ui.js';
import { accountName } from './resident-names.js';
import { travelRefusal } from './travel-message.js';
import { watchConnection } from './connection-deadline.js';
import { CONNECTING, IMPROVED, UPDATING, closeNotice, createStalenessWatch, retryDelay } from './connection-policy.js';
import { createVoiceChat } from './voice-chat.js';
import { createVoiceUI } from './voice-ui.js';
import { sharedVoicePreferences } from './voice-preferences.js';
import { listenerFromPose } from './voice-spatial.js';
import { sharedBlockList, createBlockUI } from './player-blocks.js';
import { observeServerTime, serverNow } from './server-clock.js';

const element = (tag,text,className) => { const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node; };
export function createMultiplayer({ getPose, getEnvironment = () => null, getRegionSha256 = () => null, getDistrictRevision = () => undefined, getMeetingPlaces = () => [], getOwnerHomes = () => [], onSnapshot, onCorrection, onPlayers, onHomeAccess = () => {}, creationToolsEnabled = false, getWalking = () => null, onVoiceChange = () => {} }) {
  const lifetime=new AbortController();let connectionDeadline=null;
  const reloadRegion=()=>{
    if(window.__riverRegionReloadScheduled)return;
    window.__riverRegionReloadScheduled=true;setTimeout(()=>location.reload(),0);
  };
  // Reload once for a changed district revision; a second mismatch means the town and the
  // page disagree after a fresh load, so stop rather than loop.
  const districtChanged=(ws,served)=>{
    let tried=null;try{tried=sessionStorage.getItem('river-oaks-district-reload');}catch{}
    if(tried!==String(served)){try{sessionStorage.setItem('river-oaks-district-reload',String(served));}catch{}reloadRegion();return;}
    ws.close(4000,'District revision changed');
  };
  const gate=element('section',null,'multiplayer-gate');gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');gate.setAttribute('aria-labelledby','multiplayer-title');
  const orbit=element('span',null,'access-orbit');orbit.setAttribute('aria-hidden','true');
  const brand=element('div','TypeSafe Place','access-kicker');
  const title=element('h1','Your district is just ahead');title.id='multiplayer-title';title.tabIndex=-1;
  const description=element('p','Connecting you to your people and places.');
  const status=element('p','Connecting to the town…');status.id='multiplayer-status';status.setAttribute('role','status');
  const login=element('a','Sign in with GitHub','multiplayer-primary');login.href='/auth/login?provider=github';login.hidden=true;
  const retry=element('button','Try again');retry.type='button';retry.hidden=true;
  const gateLogout=element('button','Sign out');gateLogout.type='button';gateLogout.hidden=true;
  const card=element('div',null,'multiplayer-welcome');card.append(orbit,brand,title,description,status,login,retry,gateLogout);gate.append(card);document.body.append(gate);
  const panel=element('section',null,'multiplayer-roster');panel.setAttribute('aria-label','Players in town');
  const summary=element('strong','Connecting'),list=element('div'),notice=element('p');notice.setAttribute('role','status');
  const logout=element('button','Sign out');logout.type='button';
  const chatSection=element('section',null,'multiplayer-chat');chatSection.setAttribute('aria-label','Town chat');
  const chatTitle=element('h3','Town chat'),chatHistory=element('div',null,'multiplayer-chat-history');
  chatHistory.setAttribute('role','log');chatHistory.setAttribute('aria-label','Town messages');chatHistory.setAttribute('aria-live','off');
  const chatForm=element('form',null,'multiplayer-chat-form'),chatInput=element('input'),chatSend=element('button','Send');
  chatInput.type='text';chatInput.maxLength=280;chatInput.placeholder='Message the town';chatInput.setAttribute('aria-label','Message the town');
  chatSend.type='submit';chatInput.disabled=chatSend.disabled=true;chatForm.append(chatInput,chatSend);
  const chatStatus=element('p',null,'multiplayer-chat-status');chatStatus.setAttribute('role','status');
  chatSection.append(chatTitle,chatHistory,chatForm,chatStatus);
  const gestures=element('section',null,'multiplayer-gestures');gestures.setAttribute('aria-label','Avatar gestures');
  const gestureTitle=element('h3','Greet someone'),gestureControls=element('div',null,'multiplayer-gesture-controls'),gestureStatus=element('p');gestureStatus.setAttribute('role','status');
  const gestureButtons=['wave','bow'].map(kind=>{
    const button=element('button',kind==='wave'?'Wave':'Bow');button.type='button';button.disabled=true;
    button.addEventListener('click',async()=>{
      button.disabled=true;gestureStatus.textContent='';
      try{const result=await command({type:'gesture',kind});gestureStatus.textContent=result.ok?`${button.textContent} shared with the town.`:result.message;}
      catch(error){gestureStatus.textContent=error.message;}
      finally{button.disabled=!connected;}
    });
    gestureControls.append(button);return button;
  });
  gestures.append(gestureTitle,gestureControls,gestureStatus);
  panel.append(summary,list,notice,chatSection,gestures,logout);
  // Residents and the local meeting action lead; connected-town tools follow.
  document.querySelector('#community-more')?.before(panel);
  let socket=null,identity=null,csrfToken=null,selfId=null,connected=false,connecting=false,retryTimer=null,attempt=0,sequence=0,stopped=false,latestSnapshot=null,moderator=false,worldId=DEFAULT_WORLD_ID,homeAccess=[];
  let lastPose=0,lastFocus=0,traveling=false,returnFocus=null,signingOut=false,authorization=0,townAttempt=0;const pending=new Map(),rows=new Map();
  const setStatus=(message,locked=true)=>{
    const active=document.activeElement,inside=gate.contains(active);
    if(locked&&!inside)returnFocus=active;
    // A modal inside the app must release focus before the access gate makes it inert.
    if(locked)document.querySelector('#settings-dialog[open]')?.close();
    status.textContent=message;gate.hidden=!locked;gateLogout.hidden=!locked||!identity;
    document.querySelector('.app-shell')?.toggleAttribute('inert',locked);panel.dataset.connected=String(connected);
    if(locked&&(!inside||active.hidden))title.focus({preventScroll:true});
    else if(!locked&&inside){
      const target=returnFocus?.isConnected&&returnFocus!==document.body&&!returnFocus.closest('[inert]')&&returnFocus.getClientRects().length?returnFocus:document.querySelector('#canvas-host');
      target?.focus({preventScroll:true});returnFocus=null;
    }
  };
  gate.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const actions=[login,retry,gateLogout].filter(node=>!node.hidden&&!node.disabled);
    const first=actions[0],last=actions.at(-1);
    if(!first){event.preventDefault();title.focus({preventScroll:true});}
    else if(event.shiftKey&&[title,first].includes(document.activeElement)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  const api=async(path,options={})=>{
    lifetime.signal.throwIfAborted();
    const asked=blocks.session;
    const signal=options.signal?AbortSignal.any([lifetime.signal,options.signal]):lifetime.signal;
    const response=await fetch(path,{...options,signal,credentials:'same-origin',headers:{...options.headers,'X-CSRF-Token':csrfToken??''}});
    const data=await response.json();
    lifetime.signal.throwIfAborted();
    if(!response.ok){
      if(response.status===401&&asked===blocks.session)detachBlocks();
      const message=data.error==='auth_unavailable'?'Sign-in is not configured yet. Please try again later.':data.error??'Online play is unavailable. Please try again.';
      const error=new Error(message);error.status=response.status;throw error;
    }
    return data;
  };
  const socialRequest=(action,data={})=>api(`/api/social/${action}?world=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const blocks=sharedBlockList();let blockSession=null,blockGeneration=null;
  const blockUI=createBlockUI({blocks,announce:text=>{notice.textContent=text;}});
  const detachBlocks=()=>{if(blockGeneration===blocks.session)blocks.attach(null);blockSession=null;blockGeneration=null;notice.textContent='';};
  const attachBlocks=()=>{
    if(signingOut||stopped)return;
    if(blockGeneration===blocks.session&&blockSession?.id===identity?.id&&blockSession?.csrfToken===csrfToken)return;
    blockSession={id:identity.id,csrfToken};notice.textContent='';displayPlayers([]);
    blocks.attach((action,data={})=>api(`/api/blocks/${action}?world=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}));
    blockGeneration=blocks.session;
  };
  const refreshBlocks=()=>{
    if(signingOut||!blocks.connected||blockGeneration!==blocks.session)return;
    const asked=blocks.session;
    void blocks.refresh().catch(error=>{if(!stopped&&asked===blocks.session)notice.textContent=error.message;});
  };
  const canManageHomes=()=>Boolean(latestSnapshot?.players.find(player=>player.id===selfId)?.canBuild);
  const social=createSocialUI({panel,connected:()=>connected,selfId:()=>selfId,getMeetingPlaces,getOwnerHomes,
    getHomeAccess:()=>homeAccess,canManageHomes,
    homeAccessAction:async(action,storeId,peerId)=>{
      const result=await command({type:'homeAccess',action,storeId,peerId});
      if(!result.ok)throw new Error(result.message??'Home access could not be changed.');
      await refreshHomeAccess();
    },
    request:socialRequest,
    profileRequest:(action,data={})=>api(`/api/profile/${action}?world=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});
  const groups=creationToolsEnabled?createGroupsUI({panel,connected:()=>connected,selfId:()=>selfId,socialRequest,
    request:(action,data={})=>api(`/api/groups/${action}?world=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})}):null;
  // Default off: VITE_WORKPLACE=true shows the draft-only workplace test (#214).
  const workplace=import.meta.env.VITE_WORKPLACE==='true'?createWorkplaceUI({panel,connected:()=>connected,
    request:(action,data={})=>api(`/api/workplace/${action}?world=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})}):null;
  panel.append(logout);
  const chatDock = createTownChatDock(chatSection);
  const greetings=createGreetingsUI({host:document.querySelector('#viewport'),getTown:()=>({connected,selfId,snapshot:latestSnapshot}),getEnvironment,request:command,getPose});
  const worldRules=createWorldPolicyUI({panel,getTown:()=>({connected,selfId}),getEnvironment,command});
  const crimeHud=createCrimeUI({host:document.querySelector('#viewport'),getTown:()=>({connected,selfId,snapshot:latestSnapshot}),getEnvironment,request:command});
  let activeGreeting=null;
  const latestPlayers=new Map();
  // Shared voice. Its requests go straight to fetch rather than api(): api()
  // refuses once the client is disposed, and the final leave must still go out.
  const voiceRequest=async(action,body={},options={})=>{
    const response=await fetch(`/api/voice/${action}?world=${encodeURIComponent(worldId)}`,{method:'POST',credentials:'same-origin',keepalive:Boolean(options.keepalive),
      headers:{'Content-Type':'application/json','X-CSRF-Token':csrfToken??''},body:JSON.stringify(body)});
    let data=null;try{data=await response.json();}catch{data=null;}
    return {status:response.status,data};
  };
  // Development only: a browser journey may hand in a fake transport (as VITE_WORKPLACE gates the workplace panel).
  const voiceTransport=import.meta.env.DEV&&window.__riverVoiceTransport?{loadTransport:async()=>window.__riverVoiceTransport}:{};
  const voice=createVoiceChat({request:voiceRequest,preferences:sharedVoicePreferences(),getListener:()=>listenerFromPose(getPose()),onChange:state=>{voiceUI.render(state);onVoiceChange(state);},...voiceTransport});
  const voiceUI=createVoiceUI({voice,chatSection,chatDock,walking:getWalking(),players:()=>latestPlayers});
  const displayPlayers=players=>{
    latestPlayers.clear();for(const player of players)latestPlayers.set(player.id,player);
    summary.textContent=`${players.length} ${players.length===1?'player':'players'} in town`;
    for(const [id,row]of rows)if(!players.some(player=>player.id===id)){row.remove();rows.delete(id);voiceUI.forgetRow(id);blockUI.forgetRow(id);}
    for(const player of players){
      let row=rows.get(player.id);
      if(row && row.dataset.name!==player.name) {
        // A resident who signs in again keeps their row but may carry a new name.
        row.dataset.name=player.name;
        row.querySelector('.multiplayer-person-name').textContent=player.name+(player.id===selfId?' (you)':'');
        for(const button of row.querySelectorAll('[data-label]'))button.setAttribute('aria-label',button.dataset.label.replace('{name}',player.name));
      }
      if(!row){
        row=element('div',null,'multiplayer-person');row.dataset.peerId=player.id;row.dataset.name=player.name;
        const name=element('span',player.name+(player.id===selfId?' (you)':''),'multiplayer-person-name');row.append(name);rows.set(player.id,row);list.append(row);
        if(player.id!==selfId){
          const profile=element('button','Profile');profile.type='button';profile.dataset.label='View profile for {name}';profile.setAttribute('aria-label',`View profile for ${player.name}`);
          profile.addEventListener('click',()=>social.inspect(latestPlayers.get(player.id)??player));row.append(profile);
          const invite=element('button','Add contact');invite.type='button';invite.dataset.label='Add {name} as a contact';invite.setAttribute('aria-label',`Add ${player.name} as a contact`);
          invite.addEventListener('click',()=>social.invite(latestPlayers.get(player.id)??player));row.append(invite);
          const report=element('button','Report');report.type='button';report.dataset.label='Report disruption by {name}';report.setAttribute('aria-label',`Report disruption by ${player.name}`);
          report.addEventListener('click',async()=>{report.disabled=true;try{const result=await command({type:'report',playerId:player.id,reason:'disruption'});notice.textContent=result.message;}catch(error){notice.textContent=error.message;}finally{report.disabled=false;}});row.append(report);
          blockUI.rosterButton(row,player);
          if(moderator){const ban=element('button','Ban');ban.type='button';ban.addEventListener('click',async()=>{ban.disabled=true;try{await api('/api/moderation/ban',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:player.id,banned:true})});notice.textContent='Account removed from the town.';}catch(error){notice.textContent=error.message;ban.disabled=false;}});row.append(ban);}
          voiceUI.rosterButton(row,player);
        }
      }
    }
  };
  const chatRows=new Map();let chatInitialized=false;
  const displayChat=messages=>{
    const follow=chatDock.beforeUpdate();let added=0;
    const ids=new Set(messages.map(message=>message.id));
    for(const [id,row] of chatRows)if(!ids.has(id)){row.remove();chatRows.delete(id);}
    for(const message of messages){
      if(chatRows.has(message.id))continue;
      added++;
      const row=element('p',null,'multiplayer-chat-message');row.dataset.authorId=message.authorId;
      const author=element('strong',message.authorName+(message.authorId===selfId?' (you)':''));
      row.append(author,document.createTextNode(`: ${message.text}`));chatRows.set(message.id,row);chatHistory.append(row);
    }
    chatDock.updated({added,initial:!chatInitialized,follow});
    // Avoid announcing restored history on join, then announce each new row.
    if(!chatInitialized){chatInitialized=true;chatHistory.setAttribute('aria-live','polite');}
  };
  const clearPending=()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('Disconnected. Your action was not confirmed.'));}pending.clear();};
  async function refreshHomeAccess(){
    if(!connected||document.visibilityState==='hidden'||!getOwnerHomes().length)return;
    const current=socket;
    try{
      const result=await command({type:'homeAccess',action:'list'});
      if(stopped||current!==socket||!result.ok)return;
      homeAccess=result.homes??[];onHomeAccess(homeAccess);social.refreshHomeAccess();
    }catch{ /* Reconnect and retry on the next refresh. */ }
  }
  const homeAccessTimer=setInterval(refreshHomeAccess,10_000);
  const staleness=createStalenessWatch();
  let rotation=null,previousSocket=null,updating=false,halted=false;
  // The gate's words follow the reason: an update says the world is improving.
  const show=notice=>{
    title.textContent=notice.title??CONNECTING.title;description.textContent=notice.description??CONNECTING.description;
    retry.textContent=notice.refresh?'Refresh':'Try again';retry.dataset.action=notice.refresh?'refresh':'retry';
    setStatus(notice.status);
  };
  const schedule=()=>{if(stopped||retryTimer)return;retryTimer=setTimeout(()=>{retryTimer=null;connect();},retryDelay(attempt++));};
  // The session and a fresh ticket for one town socket.
  async function townUrl(continues=null){
    if(signingOut)return null;
    const asked=authorization,attempt=++townAttempt;
    worldId=worldIdFromSearch(location.search);
    const session=await api('/auth/session');
    if(stopped||signingOut||asked!==authorization||attempt!==townAttempt)return null;
    if(!session.authenticated){identity=null;csrfToken=null;detachBlocks();displayPlayers([]);return 'signed-out';}
    identity=session.user;csrfToken=session.csrfToken;
    attachBlocks();
    const access=await api(`/api/multiplayer/ticket?world=${encodeURIComponent(worldId)}`,{method:'POST'});if(stopped||signingOut||asked!==authorization||attempt!==townAttempt)return null;moderator=access.moderator;
    // Ask for the protocol this world's ticket names, so an older server or world keeps protocol 3.
    const protocol=ticketProtocol(access.protocolVersion);
    if((access.worldId??DEFAULT_WORLD_ID)!==worldId || protocol===null){
      const error=new Error(IMPROVED.status);error.status=426;throw error;
    }
    const url=new URL('/multiplayer',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('ticket',access.ticket);
    url.searchParams.set('world',worldId);url.searchParams.set('protocol',String(protocol));
    // A fresh socket for a hand-over names the connection it continues, so voice can follow.
    if(typeof continues==='string'&&continues)url.searchParams.set('continues',continues);
    return url;
  }
  async function connect(){
    if(stopped||signingOut||connecting||connected)return;connecting=true;halted=false;retry.hidden=true;login.hidden=true;
    const asked=authorization;
    show(updating?UPDATING:CONNECTING);
    try{
      const url=await townUrl();
      if(stopped||signingOut||asked!==authorization)return;
      if(!url){if(asked===authorization)connecting=false;return;}
      if(url==='signed-out'){login.hidden=false;halted=true;show({...CONNECTING,status:'Sign in to play.'});connecting=false;return;}
      openSocket(url);
    }catch(error){
      if(stopped||signingOut||asked!==authorization)return;connecting=false;
      if(error.status===426){updating=false;halted=true;show(IMPROVED);retry.hidden=false;return;}
      // While an update lands the town answers slowly or not at all; keep saying so.
      show(updating&&![403,404].includes(error.status)?UPDATING:{...CONNECTING,status:error.message});
      retry.hidden=error.status===404;
      if([403,404].includes(error.status))halted=true;else schedule();
    }
  }
  // One town socket. A replacement (`from`: the socket it replaces) takes over on its first good snapshot.
  function openSocket(url,from=null){
    const ws=new WebSocket(url);if(!from)socket=ws;
    // Open quickly, then allow time for the first snapshot; a busy page keeps its connection.
    const deadline=watchConnection(ws,{onExpire:()=>{if(from?rotation?.ws===ws:socket===ws&&!connected)ws.close();}});
    if(!from)connectionDeadline=deadline;
    ws.addEventListener('open',()=>deadline.opened());
    ws.addEventListener('message',event=>{
      if(stopped||debugDeaf===ws)return;
      try{
        const data=JSON.parse(event.data);
        // Results for commands sent just before a hand-over still arrive on the socket that carried them.
        if(data.type==='result'){if(socket===ws||previousSocket===ws)settle(data);return;}
        if(socket!==ws){
          if(rotation?.ws!==ws||data.type!=='snapshot'||!validTownSnapshot(data,selfId))return;
          promote(ws,deadline);
        }
        if(data.type==='snapshot')receive(ws,data,deadline);
        else if(data.type==='rotate')void rotate(ws,data.connectionId);
      }catch{notice.textContent='A town update could not be read.';}
    });
    ws.addEventListener('close',event=>{
      deadline.stop();if(lifetime.signal.aborted)return;
      if(previousSocket===ws)previousSocket=null;
      if(rotation?.ws===ws){abandonRotation();return;}
      if(socket!==ws)return;
      // The replacement is on its way: this close is the planned one, not a loss.
      if(rotation?.from===ws){rotation.fromClosed={code:event.code,reason:event.reason};return;}
      lost(ws,event.code,event.reason);
    });
    ws.addEventListener('error',()=>{if(!stopped&&socket===ws&&!rotation)status.textContent='The town connection is unavailable.';});
    return ws;
  }
  function receive(ws,data,deadline){
    if(!validTownSnapshot(data,selfId)){notice.textContent='A town update could not be read.';ws.close(4002,'Invalid town snapshot');return;}
    if((data.worldId??DEFAULT_WORLD_ID)!==worldId || !supportsWorldProtocol(data.protocolVersion??WORLD_PROTOCOL_VERSION)){ws.close(4000,'World version changed');return;}
    if(getRegionSha256() && data.regionSha256 && data.regionSha256!==getRegionSha256()){reloadRegion();return;}
    // The default district's revision (#507): the town and this page must draw the same campus or garage.
    const loadedDistrict=getDistrictRevision();
    if(worldId===DEFAULT_WORLD_ID && loadedDistrict!==undefined && (data.districtRevision??null)!==loadedDistrict){districtChanged(ws,data.districtRevision??null);return;}
    staleness.heard(performance.now());
    // The server checks every name; checking again here means no
    // surface fed by a snapshot can show anyone but Jevica's accounts as Jevica.
    if(Array.isArray(data.players))for(const player of data.players)player.name=accountName(player.id,player.name);
    if(Array.isArray(data.chat))for(const entry of data.chat)entry.authorName=accountName(entry.authorId,entry.authorName);
    if(Array.isArray(data.builds))for(const item of data.builds)item.ownerName=accountName(item.ownerId,item.ownerName);
    selfId=data.selfId??selfId;latestSnapshot=data;observeServerTime(data.serverTimeMs);
    if(!connected){connected=true;connecting=false;attempt=0;updating=false;deadline.stop();onCorrection(data.players.find(player=>player.id===selfId));title.textContent=CONNECTING.title;description.textContent=CONNECTING.description;setStatus('',false);social.refresh(true);groups?.refresh(true);void workplace?.refresh();void refreshHomeAccess();refreshBlocks();}
    const self=data.players.find(player=>player.id===selfId);
    if(self?.interaction?.id&&self.interaction.id!==activeGreeting)onCorrection(self);
    activeGreeting=self?.interaction?.id??null;
    onSnapshot(data);onPlayers(data.players,selfId);displayPlayers(data.players);displayChat(data.chat??[]);worldRules.sync(data);crimeHud.sync();
    voice.setAvailable(Boolean(data.voice?.available),self?.voice?.space??null);voice.sync(data.players,selfId);
    chatInput.disabled=chatSend.disabled=false;gestureButtons.forEach(button=>button.disabled=false);
  }
  function settle(data){
    if(data.correction)onCorrection(data.correction);
    const request=pending.get(data.requestId);if(request){clearTimeout(request.timer);pending.delete(data.requestId);request.resolve(data);}
  }
  // The town retires each socket after a few minutes (the host's request limit) and warns
  // first. The page moves to a fresh socket and nothing is dropped: commands already sent
  // finish here, new ones wait for the fresh socket, and the player never leaves the town.
  async function rotate(from,continues=null){
    if(rotation||stopped||socket!==from)return;
    const current=rotation={from,ws:null,fromClosed:null,queued:[]};
    const until=performance.now()+3000;
    while(pending.size&&performance.now()<until&&rotation===current)await new Promise(resolve=>setTimeout(resolve,100));
    if(rotation!==current)return;
    try{
      const url=await townUrl(continues);
      if(rotation!==current)return;
      if(!url||url==='signed-out'){abandonRotation();return;}
      current.ws=openSocket(url,from);
    }catch{if(rotation===current)abandonRotation();}
  }
  function promote(ws,deadline){
    const {from,queued}=rotation;rotation=null;
    socket=ws;previousSocket=from;connectionDeadline?.stop();connectionDeadline=deadline;deadline.stop();rotations++;rotatedAt.push(Date.now());if(rotatedAt.length>20)rotatedAt.shift();
    try{from.close(1000,'Moved to a fresh connection.');}catch{ /* already closing */ }
    for(const item of queued)send(item);
    voice.onConnectionChanged();
  }
  // No fresh socket after all: carry on with the old one, or reconnect if it is already gone.
  function abandonRotation(){
    const current=rotation;rotation=null;if(!current)return;
    try{current.ws?.close();}catch{ /* never opened */ }
    if(current.fromClosed&&socket===current.from)lost(current.from,current.fromClosed.code,current.fromClosed.reason);
    else for(const item of current.queued)send(item);
  }
  function lost(ws,code,reason){
    if(socket!==ws)return;
    if(rotation){const {ws:replacement,queued}=rotation;rotation=null;try{replacement?.close();}catch{ /* never opened */ }for(const item of queued)item.resolve({ok:false,message:'Reconnect before taking an action.'});}
    socket=null;previousSocket=null;connected=false;connecting=false;latestSnapshot=null;worldRules.sync(null);crimeHud.sync();homeAccess=[];onHomeAccess(homeAccess);social.refreshHomeAccess();chatInput.disabled=chatSend.disabled=true;gestureButtons.forEach(button=>button.disabled=true);clearPending();onPlayers([],selfId);
    const notice=closeNotice(code,reason);
    displayPlayers([]);
    if(notice.terminal)detachBlocks();
    // Voice leases die with the connection; a non-terminal close rejoins voice with the town.
    voice.onConnectionLost(notice.terminal);
    if(stopped)return;
    if(code===4000 && reason==='World region updated.'){reloadRegion();return;}
    updating=notice.kind==='updating';halted=notice.terminal;
    show(notice);retry.hidden=false;
    if(!notice.terminal)schedule();
  }
  // A socket can die without closing (a Wi-Fi switch, a laptop that slept, a router's idle
  // timeout). The town sends a snapshot every 200 ms; a visible page that hears nothing moves on.
  const watchdog=setInterval(()=>{
    const now=performance.now();
    if(stopped||!connected||!socket||document.visibilityState!=='visible'){staleness.resume(now);return;}
    if(!staleness.stale(now))return;
    const ws=socket;lost(ws,4901,'No town updates.');try{ws.close(4901,'No town updates.');}catch{ /* already closing */ }
  },1000);
  // Back online, or back in view: retry now instead of waiting out the backoff.
  const resume=({fresh=false}={})=>{
    staleness.resume(performance.now());
    if(fresh&&!stopped&&!halted&&socket){
      // A bfcache page may hold buffered snapshots from before suspension.
      // Re-admit through the existing session/ticket path and fence the old socket.
      const previous=socket;lost(previous,4902,'Resuming this page.');
      try{previous.close(1000,'Resuming this page.');}catch{ /* already closed */ }
    }
    if(stopped||connected||connecting||halted||!retryTimer)return;
    clearTimeout(retryTimer);retryTimer=null;connect();
  };
  window.addEventListener('online',resume,{signal:lifetime.signal});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume();},{signal:lifetime.signal});
  let flightRequest=null,flightTracking=false,maneuverUntil=0,maneuverSeq=0;
  function command(message){
    if(stopped||!connected)return Promise.resolve({ok:false,message:'Reconnect before taking an action.'});
    const requestId=String(++sequence);
    return new Promise((resolve,reject)=>{
      const item={message:{...message,requestId},requestId,resolve,reject};
      if(rotation)rotation.queued.push(item);else send(item);
    });
  }
  function send(item){
    if(stopped||!connected||socket?.readyState!==WebSocket.OPEN){item.resolve({ok:false,message:'Reconnect before taking an action.'});return;}
    const timer=setTimeout(()=>{pending.delete(item.requestId);item.reject(new Error('The town did not confirm this action. Please try again.'));},8000);
    pending.set(item.requestId,{resolve:item.resolve,reject:item.reject,timer});socket.send(JSON.stringify(item.message));
  }
  // Development only: browser journeys play the losses this page must survive.
  let debugDeaf=null,rotations=0;const rotatedAt=[];
  if(import.meta.env.DEV)window.__riverConnection={
    state:()=>({connected,connecting,rotating:Boolean(rotation),rotations,rotatedAt:[...rotatedAt],attempt,retryScheduled:Boolean(retryTimer),halted,updating,gate:!gate.hidden,title:title.textContent,status:status.textContent}),
    // The socket stays open but nothing it carries is heard: a dead socket that never closed.
    deafen(){debugDeaf=socket;},
    // A close as the town or the network would deliver it, after `attempt` failed tries.
    drop({code=1006,reason='',attempt:tries=null}={}){const ws=socket;if(!ws)return false;if(tries!==null)attempt=tries;lost(ws,code,reason);try{ws.close();}catch{ /* already closing */ }return true;},
  };
  bindTownChatComposer({ form: chatForm, input: chatInput, send: chatSend, status: chatStatus,
    connected: () => connected, sendMessage: text => command({ type: 'chat', text }),
    onSent: () => chatDock.reveal(), signal: lifetime.signal });
  retry.addEventListener('click',()=>{if(retry.dataset.action==='refresh'){location.reload();return;}clearTimeout(retryTimer);retryTimer=null;connect();});
  const signOut=async()=>{
    logout.disabled=gateLogout.disabled=true;
    signingOut=true;authorization++;connecting=false;clearTimeout(retryTimer);retryTimer=null;
    detachBlocks();
    voice.leave('sign-out');
    try{const result=await api('/auth/logout',{method:'POST'});stopped=true;clearTimeout(retryTimer);socket?.close();location.assign(result.url??'/');}
    catch(error){
      signingOut=false;authorization++;
      // A failed sign-out may be retried, but only a fresh session can restore its controls.
      if(!stopped&&error.status!==401)try{
        const session=await api('/auth/session');
        if(session.authenticated&&session.user.id===identity?.id){identity=session.user;csrfToken=session.csrfToken;attachBlocks();if(connected)refreshBlocks();else connect();}
      }catch{ /* Keep the list detached if the session could not be verified. */ }
      notice.textContent=error.message;if(!gate.hidden)status.textContent=error.message;logout.disabled=gateLogout.disabled=false;
    }
  };
  logout.addEventListener('click',signOut);gateLogout.addEventListener('click',signOut);
  connect();
  return {
    resume,
    characterRequest(action,body){
      const routes={read:['/api/character','GET'],draft:['/api/character/draft','PUT'],publish:['/api/character/publish','POST'],rollback:['/api/character/rollback','POST']};
      const route=routes[action];if(!route)return Promise.reject(new TypeError('Unknown character action'));
      const [path,method]=route;
      return api(`${path}?world=${encodeURIComponent(worldId)}`,{method,signal:AbortSignal.timeout(15000),
        ...(method==='GET'?{cache:'no-store'}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
    },
    claimStoreIntro: storeId => api(`/api/profile/claim-intro?world=${encodeURIComponent(worldId)}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({storeId})}),
    get connected(){return connected;},get traveling(){return traveling;},get identity(){return identity;},get snapshot(){return latestSnapshot;},get homeAccess(){return homeAccess;},get voice(){return voice;},command,
    landmarkRequest(action,data={}){
      if(!connected)return Promise.reject(new Error('Reconnect before changing landmarks.'));
      return api(`/api/landmarks/${action}?world=${encodeURIComponent(worldId)}${action==='list'?'&allWorlds=1':''}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    },
    // A Ribbonwing maneuver (#777). The seq only rises, across reloads too (it
    // starts from the clock); a lost reply is retried once with the same id,
    // which the town answers without starting the path again.
    async maneuver(kind){
      maneuverSeq=Math.max(maneuverSeq+1,Date.now());
      const request={type:'maneuver',kind,id:`rw-${crypto.randomUUID()}`,seq:maneuverSeq};
      // No poses while the town decides: one arriving after the maneuver began would be refused.
      let result;maneuverUntil=Infinity;
      try{result=await command(request);}
      catch{try{result=await command(request);}catch(error){maneuverUntil=0;return {ok:false,message:error.message};}}
      observeServerTime(result?.serverTimeMs);
      const m=result?.ok?result.player?.maneuver:null;maneuverUntil=m?m.startedAt+m.duration:0;
      return result;
    },
    // The Ribbonwing passenger seat (#777): invite, cancel, board or leave.
    ribbonwing:body=>command({type:'ribbonwing',...body}),
    async travel(target){
      if(traveling)return {ok:false,message:'Please wait for your arrival.'};
      traveling=true;
      // Refusals carry a code; the town notice never shows it bare (travel-message.js).
      try{const result=await command({type:'travel',...target});if(stopped)return result;if(result.ok&&result.player)onCorrection(result.player);else if(!result.ok)notice.textContent=travelRefusal(result,{blocked:'That spot is blocked. Try a nearby path or open space.',cooldown:'Wait a moment before travelling again.',fallback:'That place is not reachable right now.'});return result;}
      catch(error){notice.textContent=error.message;return {ok:false,message:error.message};}
      finally{traveling=false;}
    },
    officeDeskRequest:(action,data={})=>api(`/api/office-desk/${action}?world=${encodeURIComponent(worldId)}`,{signal:AbortSignal.timeout(15000),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),
    update(now){
      greetings.update(now);crimeHud.update(now);
      if(!connected||socket?.readyState!==WebSocket.OPEN)return;
      // A Ribbonwing maneuver owns this player's pose on the server until it ends (#777).
      // A Ribbonwing passenger's seat is the town's to move (#777).
      const aboard=Boolean(latestSnapshot?.players?.find(player=>player.id===selfId)?.passengerOf);
      if(!traveling&&!aboard&&now-lastPose>=200&&serverNow()>maneuverUntil){
        lastPose=now;const pose=getPose();
        if(pose&&!pose.office){
          const message={type:'pose',position:[pose.position[0],-pose.position[2],pose.ground],yaw:pose.riding?pose.riding.yaw+Math.PI/2:pose.yaw,altitude:pose.altitude,levelId:pose.levelId??null,...(activeGreeting?{interactionId:activeGreeting}:{}),...(pose.riding?{vehicle:pose.riding.kind}:{})};
          if((pose.flying||flightTracking)&&getWalking()?.recordSubmittedPose){
            flightTracking=true;
            if(flightRequest)return;
            const acknowledge=getWalking().recordSubmittedPose(pose);
            // Flight turns need explicit acknowledgments, so intermediate corner
            // endpoints cannot be coalesced away. Keep the normal 200ms cadence.
            const request=command(message);flightRequest=request;
            request.then(result=>{if(result.ok&&result.player){acknowledge(result.player);flightTracking=result.player.altitude>0;}}).catch(()=>{}).finally(()=>{if(flightRequest===request)flightRequest=null;});
          }else socket.send(JSON.stringify(message));
        }
      }
      if(now-lastFocus>=10000){lastFocus=now;const dialog=document.querySelector('#community-dialogue');if(dialog&&!dialog.hidden)command({type:'focus',localId:document.querySelector('#community-local')?.value}).catch(()=>{});}
    },
    dispose(){
      if(lifetime.signal.aborted)return;
      voice.dispose();voiceUI.dispose();
      blockUI.dispose();detachBlocks();
      stopped=true;lifetime.abort();clearTimeout(retryTimer);connectionDeadline?.stop();clearInterval(homeAccessTimer);clearInterval(watchdog);
      try{rotation?.ws?.close();}catch{ /* never opened */ }rotation=null;previousSocket=null;
      const current=socket;socket=null;connected=connecting=traveling=false;latestSnapshot=null;homeAccess=[];
      current?.close();clearPending();onPlayers([],selfId);onHomeAccess(homeAccess);
      identity=null;csrfToken=null;rows.clear();latestPlayers.clear();chatRows.clear();
      social.dispose();groups?.dispose();workplace?.dispose();greetings.dispose();worldRules.dispose();crimeHud.dispose();chatDock.dispose();gate.remove();panel.remove();document.querySelector('.app-shell')?.removeAttribute('inert');
    },
  };
}
