import { INTERACTIONS, INTERACTION_REACH, interactionDistance, interactionOnFoot } from './shared-interactions.js';

const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
const setText=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
const typing=el=>Boolean(el?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]'));

// Greetings are intentional (Val, 2026-10-15): nothing shows until you face someone within reach.
// Then a small prompt offers "Say hello to <name> · E", and E or a tap opens the menu for that
// person. An invitation or a shared activity always shows, since it needs an answer.
export const GREETING_FACING_ANGLE = 40 * Math.PI / 180;

// pose is the walking pose: position [east, up, -north] and the camera's yaw (0 looks north, a
// positive yaw turns toward the west). Of the peers within the cone, the nearest to straight ahead.
export function facedPeer(pose, peers) {
  if (!pose || !Number.isFinite(pose.yaw)) return null;
  const east = pose.position[0], north = -pose.position[2], forwardEast = -Math.sin(pose.yaw), forwardNorth = Math.cos(pose.yaw);
  let best = null, bestAngle = GREETING_FACING_ANGLE;
  for (const peer of peers) {
    const dx = peer.position[0] - east, dn = peer.position[1] - north, length = Math.hypot(dx, dn);
    if (length < 1e-6) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, (dx * forwardEast + dn * forwardNorth) / length)));
    if (angle <= bestAngle) { best = peer; bestAngle = angle; }
  }
  return best;
}

export function createGreetingsUI({host,getTown,getEnvironment,request,getPose=()=>null,keys=globalThis.window}){
  const panel=node('section');panel.className='nearby-greetings';panel.hidden=true;panel.setAttribute('aria-label','Nearby greetings');
  const prompt=node('button');prompt.type='button';prompt.className='greeting-prompt';prompt.hidden=true;
  const promptLabel=node('span'),promptKey=node('kbd','E');prompt.append(promptLabel,promptKey);
  const title=node('strong','Say hello');
  const description=node('p'),status=node('p');description.setAttribute('role','status');status.setAttribute('role','status');
  const choices=node('div'),responses=node('div');choices.className=responses.className='greeting-actions';
  const buttons={};let busy=false,cooldown=0,lastPaint=-Infinity,activity=null,disposed=false,faced=null,menuOpen=false,target=null;
  const canvas=()=>document.querySelector('#canvas-host');
  const send=async(message)=>{
    if(busy)return;
    const restoreFocus=panel.contains(document.activeElement);
    busy=true;status.textContent='';paint();
    try{
      const result=await request(message);if(disposed)return;
      if(!result.ok)status.textContent=result.message??'That greeting could not be confirmed.';
      else if(message.action==='invite'){cooldown=performance.now()+5000;menuOpen=false;target=null;}
      else if(message.type==='gesture'){cooldown=performance.now()+1600;status.textContent='Wave shared.';}
    }catch(error){if(!disposed)status.textContent=error.message;}
    finally{
      busy=false;
      if(!disposed){
        paint();
        if(restoreFocus&&(document.activeElement===document.body||panel.contains(document.activeElement))){
          if(panel.hidden)canvas()?.focus({preventScroll:true});
          else (activity?(buttons.accept.hidden?buttons.cancel:buttons.accept):buttons.wave).focus({preventScroll:true});
        }
      }
    }
  };
  const button=(key,text,parent,action)=>{const el=node('button',text);el.type='button';el.addEventListener('click',()=>void action());parent.append(el);buttons[key]=el;return el;};
  button('wave','Wave',choices,()=>send({type:'gesture',kind:'wave'}));
  for(const [kind,{label}]of Object.entries(INTERACTIONS))button(kind,label,choices,()=>target&&send({type:'interaction',action:'invite',kind,peerId:target}));
  button('close','Close',choices,()=>closeMenu(true));
  for(const action of ['accept','decline','cancel'])button(action,action[0].toUpperCase()+action.slice(1),responses,()=>activity&&send({type:'interaction',action,id:activity.id}));
  panel.append(title,description,choices,responses,status);host?.append(panel,prompt);
  function openMenu(){
    if(!faced||activity||disposed)return;
    target=faced.id;menuOpen=true;status.textContent='';paint();
    buttons.wave.focus({preventScroll:true});
  }
  function closeMenu(refocus){
    const inside=panel.contains(document.activeElement);
    menuOpen=false;target=null;status.textContent='';paint();
    if(refocus||inside)canvas()?.focus({preventScroll:true});
  }
  prompt.addEventListener('click',openMenu);
  // E greets the person you face, ahead of talking to a resident; it does nothing otherwise here.
  const onKey=event=>{
    if(event.metaKey||event.ctrlKey||event.altKey||event.repeat||disposed)return;
    if(event.code==='Escape'&&menuOpen){event.preventDefault();closeMenu(true);return;}
    if(event.code!=='KeyE'||typing(event.target)||prompt.hidden)return;
    event.preventDefault();event.stopImmediatePropagation();openMenu();
  };
  keys?.addEventListener('keydown',onKey,true);
  // Keep controls mounted between snapshots so keyboard focus survives updates.
  function paint(){
    const activeElement=document.activeElement;
    const town=getTown(),players=town.snapshot?.players??[],self=players.find(p=>p.id===town.selfId),environment=getEnvironment();
    activity=(town.snapshot?.interactions??[]).find(item=>item.fromId===town.selfId||item.toId===town.selfId)??null;
    const peers=self&&environment&&interactionOnFoot(self)?players.filter(peer=>peer.id!==self.id&&interactionOnFoot(peer)&&interactionDistance(self,peer)<=INTERACTION_REACH
      &&Math.abs(self.position[2]-peer.position[2])<.35
      &&(environment.roomAt(self.position[0],-self.position[1])?.storeId??null)===(environment.roomAt(peer.position[0],-peer.position[1])?.storeId??null)
      &&environment.hasSightLine([self.position[0],self.position[1],self.position[2]+1.3],[peer.position[0],peer.position[1],peer.position[2]+1.3]))
      .sort((a,b)=>interactionDistance(self,a)-interactionDistance(self,b)||a.id.localeCompare(b.id)):[];
    const pose=getPose();
    faced=town.connected&&!activity&&!pose?.office?facedPeer(pose,peers):null;
    // The menu stays with the person it was opened for while they are within reach.
    const targetPeer=menuOpen?peers.find(peer=>peer.id===target)??null:null;
    if(menuOpen&&!targetPeer){menuOpen=false;target=null;}
    const mode=!town.connected?null:activity?'activity':menuOpen?'menu':null;
    prompt.hidden=!town.connected||Boolean(activity)||menuOpen||!faced;
    if(!prompt.hidden){setText(promptLabel,`Say hello to ${faced.name}`);prompt.setAttribute('aria-label',`Say hello to ${faced.name} (E)`);}
    const wasHidden=panel.hidden;panel.hidden=!mode;panel.dataset.mode=mode??'';
    if(panel.hidden){if(!wasHidden&&panel.contains(activeElement))canvas()?.focus({preventScroll:true});return;}
    choices.hidden=mode!=='menu';responses.hidden=mode!=='activity';
    if(activity){
      const incoming=activity.toId===town.selfId,peer=players.find(p=>p.id===(incoming?activity.fromId:activity.toId));
      const name=peer?.name??'Your neighbor',active=activity.status==='active';
      setText(title,active?INTERACTIONS[activity.kind].active:incoming?'An invitation for you':'Invitation sent');
      setText(description,active?`With ${name} · Walk away or stop anytime.`:incoming?`${name} would like to ${activity.kind==='dance'?'dance with you':'shake hands'}.`:`Waiting for ${name} · Expires in a few seconds.`);
      buttons.accept.hidden=buttons.decline.hidden=active||!incoming;buttons.cancel.hidden=!active&&incoming;setText(buttons.cancel,active?'Stop':'Cancel');
    }else{
      setText(title,`Say hello to ${targetPeer.name}`);
      setText(description,performance.now()<cooldown?'One moment before another greeting.':'Wave, or invite them to join you.');
    }
    for(const [key,el]of Object.entries(buttons))el.disabled=busy||(!['accept','decline','cancel','close'].includes(key)&&performance.now()<cooldown);
    if(activeElement&&panel.contains(activeElement)&&(activeElement.hidden||activeElement.parentElement?.hidden)){
      (activity?(buttons.accept.hidden?buttons.cancel:buttons.accept):buttons.wave).focus({preventScroll:true});
    }
  }
  return {update(now){if(now-lastPaint<150)return;lastPaint=now;paint();},dispose(){disposed=true;keys?.removeEventListener('keydown',onKey,true);panel.remove();prompt.remove();}};
}
