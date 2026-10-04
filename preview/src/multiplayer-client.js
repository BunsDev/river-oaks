import './multiplayer.css';
import { DEFAULT_WORLD_ID, WORLD_PROTOCOL_VERSION, worldIdFromSearch } from './world-contract.js';
import { createSocialUI } from './social-ui.js';

const element = (tag,text,className) => { const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node; };
export function createMultiplayer({ getPose, getRegionSha256 = () => null, onSnapshot, onCorrection, onPlayers, onPlaySolo = null }) {
  const reloadRegion=()=>{
    if(window.__riverRegionReloadScheduled)return;
    window.__riverRegionReloadScheduled=true;setTimeout(()=>location.reload(),0);
  };
  const gate=element('section',null,'multiplayer-gate');gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');gate.setAttribute('aria-labelledby','multiplayer-title');
  const title=element('h1','A little magic, together');title.id='multiplayer-title';title.tabIndex=-1;
  const description=element('p','Sign in, choose your character, and meet other players in a shared town of residents, wishes, and consequences.');
  const status=element('p','Connecting to the town…');status.id='multiplayer-status';status.setAttribute('role','status');
  const login=element('a','Sign in with WorkOS','multiplayer-primary');login.href='/auth/login';login.hidden=true;
  const retry=element('button','Try again');retry.type='button';retry.hidden=true;
  const playSolo=element('button','Play single player');playSolo.type='button';playSolo.hidden=!onPlaySolo;
  const gateLogout=element('button','Sign out');gateLogout.type='button';gateLogout.hidden=true;
  const card=element('div',null,'multiplayer-welcome');card.append(title,description,status,login,retry,playSolo,gateLogout);gate.append(card);document.body.append(gate);
  const panel=element('section',null,'multiplayer-roster');panel.setAttribute('aria-label','Players in town');
  const summary=element('strong','Connecting'),list=element('div'),notice=element('p');notice.setAttribute('role','status');
  const logout=element('button','Sign out');logout.type='button';
  const leaveTown=element('button','Play single player');leaveTown.type='button';leaveTown.hidden=!onPlaySolo;
  const chatSection=element('section',null,'multiplayer-chat');chatSection.setAttribute('aria-label','Town chat');
  const chatTitle=element('h3','Town chat'),chatHistory=element('div',null,'multiplayer-chat-history');
  chatHistory.setAttribute('role','log');chatHistory.setAttribute('aria-label','Town messages');chatHistory.setAttribute('aria-live','off');
  const chatForm=element('form',null,'multiplayer-chat-form'),chatInput=element('input'),chatSend=element('button','Send');
  chatInput.type='text';chatInput.maxLength=280;chatInput.placeholder='Message the town';chatInput.setAttribute('aria-label','Message the town');
  chatSend.type='submit';chatInput.disabled=chatSend.disabled=true;chatForm.append(chatInput,chatSend);
  const chatStatus=element('p',null,'multiplayer-chat-status');chatStatus.setAttribute('role','status');
  chatSection.append(chatTitle,chatHistory,chatForm,chatStatus);
  panel.append(summary,list,notice,chatSection,leaveTown,logout);document.querySelector('#community-section')?.prepend(panel);
  let socket=null,identity=null,csrfToken=null,selfId=null,connected=false,connecting=false,retryTimer=null,attempt=0,sequence=0,stopped=false,latestSnapshot=null,moderator=false,worldId=DEFAULT_WORLD_ID;
  let lastPose=0,lastFocus=0,traveling=false,returnFocus=null;const pending=new Map(),rows=new Map();
  const setStatus=(message,locked=true)=>{
    const active=document.activeElement,inside=gate.contains(active);
    if(locked&&!inside)returnFocus=active;
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
    const actions=[login,retry,playSolo,gateLogout].filter(node=>!node.hidden&&!node.disabled);
    const first=actions[0],last=actions.at(-1);
    if(!first){event.preventDefault();title.focus({preventScroll:true});}
    else if(event.shiftKey&&[title,first].includes(document.activeElement)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  const api=async(path,options={})=>{
    const response=await fetch(path,{...options,credentials:'same-origin',headers:{...options.headers,'X-CSRF-Token':csrfToken??''}});
    const data=await response.json();
    if(!response.ok){
      const message=data.error==='auth_unavailable'?'Sign-in is not configured yet. Please try again later.':data.error??'Online play is unavailable. Please try again.';
      const error=new Error(message);error.status=response.status;throw error;
    }
    return data;
  };
  const social=createSocialUI({panel,connected:()=>connected,selfId:()=>selfId,
    request:(action,data={})=>api(`/api/social/${action}?world=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});
  const displayPlayers=players=>{
    summary.textContent=`${players.length} ${players.length===1?'player':'players'} in town`;
    for(const [id,row]of rows)if(!players.some(player=>player.id===id)){row.remove();rows.delete(id);}
    for(const player of players){
      let row=rows.get(player.id);
      if(!row){
        row=element('div',null,'multiplayer-person');const name=element('span',player.name+(player.id===selfId?' (you)':''));row.append(name);rows.set(player.id,row);list.append(row);
        if(player.id!==selfId){
          const invite=element('button','Add contact');invite.type='button';invite.setAttribute('aria-label',`Add ${player.name} as a contact`);
          invite.addEventListener('click',()=>social.invite(player));row.append(invite);
          const report=element('button','Report');report.type='button';report.setAttribute('aria-label',`Report disruption by ${player.name}`);
          report.addEventListener('click',async()=>{report.disabled=true;try{const result=await command({type:'report',playerId:player.id,reason:'disruption'});notice.textContent=result.message;}catch(error){notice.textContent=error.message;}finally{report.disabled=false;}});row.append(report);
          if(moderator){const ban=element('button','Ban');ban.type='button';ban.addEventListener('click',async()=>{ban.disabled=true;try{await api('/api/moderation/ban',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:player.id,banned:true})});notice.textContent='Account removed from the town.';}catch(error){notice.textContent=error.message;ban.disabled=false;}});row.append(ban);}
        }
      }
    }
  };
  const chatRows=new Map();let chatInitialized=false;
  const displayChat=messages=>{
    const atEnd=chatHistory.scrollHeight-chatHistory.scrollTop-chatHistory.clientHeight<24;
    const ids=new Set(messages.map(message=>message.id));
    for(const [id,row] of chatRows)if(!ids.has(id)){row.remove();chatRows.delete(id);}
    for(const message of messages){
      if(chatRows.has(message.id))continue;
      const row=element('p',null,'multiplayer-chat-message');
      const author=element('strong',message.authorName+(message.authorId===selfId?' (you)':''));
      row.append(author,document.createTextNode(`: ${message.text}`));chatRows.set(message.id,row);chatHistory.append(row);
    }
    if(atEnd)chatHistory.scrollTop=chatHistory.scrollHeight;
    // Avoid announcing restored history on join, then announce each new row.
    if(!chatInitialized){chatInitialized=true;chatHistory.setAttribute('aria-live','polite');}
  };
  const clearPending=()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('Disconnected. Your action was not confirmed.'));}pending.clear();};
  const schedule=()=>{if(stopped||retryTimer)return;retryTimer=setTimeout(()=>{retryTimer=null;connect();},Math.min(30000,1000*2**Math.min(attempt++,5)));};
  async function connect(){
    if(stopped||connecting||connected)return;connecting=true;retry.hidden=true;login.hidden=true;
    setStatus('Connecting to the town…');
    try{
      worldId=worldIdFromSearch(location.search);
      const session=await api('/auth/session');
      if(!session.authenticated){identity=null;login.hidden=false;setStatus('Sign in to play with others.');connecting=false;return;}
      identity=session.user;csrfToken=session.csrfToken;
      const access=await api(`/api/multiplayer/ticket?world=${encodeURIComponent(worldId)}`,{method:'POST'});moderator=access.moderator;
      if((access.worldId??DEFAULT_WORLD_ID)!==worldId || (access.protocolVersion??WORLD_PROTOCOL_VERSION)!==WORLD_PROTOCOL_VERSION){
        const error=new Error('This world needs a newer client. Refresh the page to join.');error.status=426;throw error;
      }
      const url=new URL('/multiplayer',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('ticket',access.ticket);
      url.searchParams.set('world',worldId);url.searchParams.set('protocol',String(WORLD_PROTOCOL_VERSION));
      const ws=new WebSocket(url);socket=ws;
      const deadline=setTimeout(()=>{if(socket===ws&&!connected)ws.close();},12000);
      ws.addEventListener('message',event=>{
        if(socket!==ws)return;
        try{
          const data=JSON.parse(event.data);
          if(data.type==='snapshot'){
            if((data.worldId??DEFAULT_WORLD_ID)!==worldId || (data.protocolVersion??WORLD_PROTOCOL_VERSION)!==WORLD_PROTOCOL_VERSION){ws.close(4000,'World version changed');return;}
            if(getRegionSha256() && data.regionSha256 && data.regionSha256!==getRegionSha256()){reloadRegion();return;}
            selfId=data.selfId??selfId;latestSnapshot=data;
            if(!connected){connected=true;connecting=false;attempt=0;clearTimeout(deadline);onCorrection(data.players.find(player=>player.id===selfId));setStatus('',false);social.refresh(true);}
            onSnapshot(data);onPlayers(data.players,selfId);displayPlayers(data.players);displayChat(data.chat??[]);
            chatInput.disabled=chatSend.disabled=false;
          }else if(data.type==='result'){
            if(data.correction)onCorrection(data.correction);
            const request=pending.get(data.requestId);if(request){clearTimeout(request.timer);pending.delete(data.requestId);request.resolve(data);}
          }
        }catch{notice.textContent='A town update could not be read.';}
      });
      ws.addEventListener('close',event=>{
        clearTimeout(deadline);if(socket!==ws)return;
        socket=null;connected=false;connecting=false;chatInput.disabled=chatSend.disabled=true;clearPending();onPlayers([],selfId);
        if(stopped)return;
        if(event.code===4000 && event.reason==='World region updated.'){reloadRegion();return;}
        const terminal=[4000,4003,4009].includes(event.code);
        setStatus(event.code===4000?'This world changed. Refresh the page to join.':event.code===4003?'This account cannot join the town.':event.code===4009?'Your account joined from another tab.':'Connection lost. Rejoining the town…');retry.hidden=event.code===4000;
        if(!terminal)schedule();
      });
      ws.addEventListener('error',()=>{status.textContent='The town connection is unavailable.';});
    }catch(error){connecting=false;setStatus(error.message);retry.hidden=error.status===404||error.status===426;if(![403,404,426].includes(error.status))schedule();}
  }
  function command(message){
    if(!connected||socket?.readyState!==WebSocket.OPEN)return Promise.resolve({ok:false,message:'Reconnect before taking an action.'});
    const requestId=String(++sequence);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('The town did not confirm this action. Please try again.'));},8000);
      pending.set(requestId,{resolve,reject,timer});socket.send(JSON.stringify({...message,requestId}));
    });
  }
  chatForm.addEventListener('submit',async event=>{
    event.preventDefault();const text=chatInput.value.trim();if(!text||!connected)return;
    chatSend.disabled=true;chatStatus.textContent='';
    try{const result=await command({type:'chat',text});if(result.ok)chatInput.value='';else chatStatus.textContent=result.message;}
    catch(error){chatStatus.textContent=error.message;}
    finally{chatSend.disabled=!connected;if(connected)chatInput.focus();}
  });
  retry.addEventListener('click',()=>{clearTimeout(retryTimer);retryTimer=null;connect();});
  playSolo.addEventListener('click',()=>onPlaySolo?.());
  leaveTown.addEventListener('click',()=>onPlaySolo?.());
  const signOut=async()=>{
    logout.disabled=gateLogout.disabled=true;
    try{const result=await api('/auth/logout',{method:'POST'});stopped=true;clearTimeout(retryTimer);socket?.close();location.assign(result.url??'/');}
    catch(error){notice.textContent=error.message;if(!gate.hidden)status.textContent=error.message;logout.disabled=gateLogout.disabled=false;}
  };
  logout.addEventListener('click',signOut);gateLogout.addEventListener('click',signOut);
  connect();
  return {
    get connected(){return connected;},get traveling(){return traveling;},get identity(){return identity;},get snapshot(){return latestSnapshot;},command,
    landmarkRequest(action,data={}){
      if(!connected)return Promise.reject(new Error('Reconnect before changing landmarks.'));
      return api(`/api/landmarks/${action}?world=${encodeURIComponent(worldId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    },
    async travel(target){
      if(traveling)return {ok:false,message:'Please wait for your arrival.'};
      traveling=true;
      try{const result=await command({type:'travel',...target});if(result.ok&&result.player)onCorrection(result.player);else if(!result.ok)notice.textContent=result.message;return result;}
      catch(error){notice.textContent=error.message;return {ok:false,message:error.message};}
      finally{traveling=false;}
    },
    update(now){
      if(!connected||socket?.readyState!==WebSocket.OPEN)return;
      if(!traveling&&now-lastPose>=200){lastPose=now;const pose=getPose();if(pose)socket.send(JSON.stringify({type:'pose',position:[pose.position[0],-pose.position[2],pose.ground],yaw:pose.yaw,altitude:pose.altitude}));}
      if(now-lastFocus>=10000){lastFocus=now;const dialog=document.querySelector('#community-dialogue');if(dialog&&!dialog.hidden)command({type:'focus',localId:document.querySelector('#community-local')?.value}).catch(()=>{});}
    },
    dispose(){stopped=true;clearTimeout(retryTimer);socket?.close();clearPending();social.dispose();gate.remove();panel.remove();document.querySelector('.app-shell')?.removeAttribute('inert');},
  };
}
