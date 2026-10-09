import { INTERACTIONS, INTERACTION_REACH, interactionDistance, interactionOnFoot } from './shared-interactions.js';

const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
const setText=(el,text)=>{if(el.textContent!==text)el.textContent=text;};
export function createGreetingsUI({host,getTown,getEnvironment,request}){
  const panel=node('section');panel.className='nearby-greetings';panel.hidden=true;panel.setAttribute('aria-label','Nearby greetings');
  const title=node('strong','Say hello'),label=node('label','Greet someone nearby'),select=node('select');select.id='greeting-person';label.htmlFor=select.id;
  const description=node('p'),status=node('p');description.setAttribute('role','status');status.setAttribute('role','status');
  const choices=node('div'),responses=node('div');choices.className=responses.className='greeting-actions';
  const buttons={};let busy=false,cooldown=0,lastPaint=-Infinity,signature='',activity=null,disposed=false;
  const send=async(message)=>{
    if(busy)return;
    const restoreFocus=panel.contains(document.activeElement);
    busy=true;status.textContent='';paint();
    try{
      const result=await request(message);if(disposed)return;
      if(!result.ok)status.textContent=result.message??'That greeting could not be confirmed.';
      else if(message.action==='invite')cooldown=performance.now()+5000;
      else if(message.type==='gesture'){cooldown=performance.now()+1600;status.textContent='Wave shared.';}
    }catch(error){if(!disposed)status.textContent=error.message;}
    finally{
      busy=false;
      if(!disposed){
        paint();
        if(restoreFocus&&(document.activeElement===document.body||panel.contains(document.activeElement))){
          if(panel.hidden)document.querySelector('#canvas-host')?.focus({preventScroll:true});
          else (activity?(buttons.accept.hidden?buttons.cancel:buttons.accept):select).focus({preventScroll:true});
        }
      }
    }
  };
  const button=(key,text,parent,action)=>{const el=node('button',text);el.type='button';el.addEventListener('click',()=>void action());parent.append(el);buttons[key]=el;return el;};
  button('wave','Wave',choices,()=>send({type:'gesture',kind:'wave'}));
  for(const [kind,{label}]of Object.entries(INTERACTIONS))button(kind,label,choices,()=>send({type:'interaction',action:'invite',kind,peerId:select.value}));
  for(const action of ['accept','decline','cancel'])button(action,action[0].toUpperCase()+action.slice(1),responses,()=>activity&&send({type:'interaction',action,id:activity.id}));
  panel.append(title,label,select,description,choices,responses,status);host?.append(panel);
  select.addEventListener('change',()=>{status.textContent='';paint();});
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
    const wasHidden=panel.hidden;panel.hidden=!town.connected||(!activity&&!peers.length);
    if(panel.hidden){if(!wasHidden&&panel.contains(document.activeElement))document.querySelector('#canvas-host')?.focus({preventScroll:true});return;}
    const key=JSON.stringify(peers.map(p=>[p.id,p.name]));
    if(key!==signature){signature=key;const previous=select.value;select.replaceChildren(...peers.map(peer=>{const option=node('option',peer.name);option.value=peer.id;return option;}));if(peers.some(p=>p.id===previous))select.value=previous;}
    label.hidden=select.hidden=Boolean(activity);choices.hidden=Boolean(activity);responses.hidden=!activity;
    if(activity){
      const incoming=activity.toId===town.selfId,peer=players.find(p=>p.id===(incoming?activity.fromId:activity.toId));
      const name=peer?.name??'Your neighbor',active=activity.status==='active';
      setText(title,active?INTERACTIONS[activity.kind].active:incoming?'An invitation for you':'Invitation sent');
      setText(description,active?`With ${name} · Walk away or stop anytime.`:incoming?`${name} would like to ${activity.kind==='dance'?'dance with you':'shake hands'}.`:`Waiting for ${name} · Expires in a few seconds.`);
      buttons.accept.hidden=buttons.decline.hidden=active||!incoming;buttons.cancel.hidden=!active&&incoming;setText(buttons.cancel,active?'Stop':'Cancel');
    }else{
      setText(title,'Say hello');
      setText(description,performance.now()<cooldown?'One moment before another greeting.':'Wave hello, or invite someone to join you.');
    }
    select.disabled=busy;
    for(const [key,el]of Object.entries(buttons))el.disabled=busy||(!['accept','decline','cancel'].includes(key)&&performance.now()<cooldown);
    if(activeElement&&panel.contains(activeElement)&&(activeElement.hidden||activeElement.parentElement?.hidden)){
      (activity?(buttons.accept.hidden?buttons.cancel:buttons.accept):select).focus({preventScroll:true});
    }
  }
  return {update(now){if(now-lastPaint<150)return;lastPaint=now;paint();},dispose(){disposed=true;panel.remove();}};
}
