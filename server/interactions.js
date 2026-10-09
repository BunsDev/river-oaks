import { INTERACTIONS, INTERACTION_REACH, INVITATION_MS, interactionDistance, interactionOnFoot } from '../preview/src/shared-interactions.js';
import { headingTo } from '../preview/src/world-interactions.js';

const reject=(error,message)=>({ok:false,error,message});
const fields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
const text=value=>typeof value==='string'&&value.length>0&&value.length<=200;

// Bounded by the town's player count: one invitation or activity per participant.
export function createInteractions({players,environment,now,movementOf,changed,residents=()=>[]}){
  let entries=[];
  const onFoot=p=>interactionOnFoot(p&&{...p,movement:movementOf(p)});
  const reachable=(a,b)=>a&&b&&a!==b&&onFoot(a)&&onFoot(b)&&interactionDistance(a,b)<=INTERACTION_REACH
    && Math.abs(a.position[2]-b.position[2])<.35
    && (environment.roomAt(a.position[0],-a.position[1])?.storeId??null)===(environment.roomAt(b.position[0],-b.position[1])?.storeId??null)
    && environment.hasSightLine([a.position[0],a.position[1],a.position[2]+1.3],[b.position[0],b.position[1],b.position[2]+1.3]);
  const find=id=>entries.find(item=>item.fromId===id||item.toId===id);
  const cancel=id=>{const before=entries.length;entries=entries.filter(item=>item.fromId!==id&&item.toId!==id);if(entries.length!==before)changed();};
  const prune=()=>{
    const before=entries.length;
    entries=entries.filter(item=>item.expiresAt>now()&&reachable(players.get(item.fromId),players.get(item.toId)));
    if(entries.length!==before)changed();
  };
  // Handshakes bring both people within arm's reach, along checked ground paths.
  function align(a,b){
    const distance=interactionDistance(a,b);if(distance<.1)return false;
    const mid=[(a.position[0]+b.position[0])/2,(a.position[1]+b.position[1])/2];
    const direction=[(b.position[0]-a.position[0])/distance,(b.position[1]-a.position[1])/distance];
    const positions=[-1,1].map(sign=>[mid[0]+direction[0]*.46*sign,mid[1]+direction[1]*.46*sign]);
    for(const [i,p] of [a,b].entries()){
      const target=positions[i],steps=Math.max(1,Math.ceil(Math.hypot(target[0]-p.position[0],target[1]-p.position[1])/.1));
      for(let step=1;step<=steps;step++){
        const x=p.position[0]+(target[0]-p.position[0])*step/steps,n=p.position[1]+(target[1]-p.position[1])*step/steps;
        if(!environment.isFree(x,-n)||Math.abs(environment.groundAt(x,-n)-p.position[2])>.2
          ||(environment.roomAt(x,-n)?.storeId??null)!==(environment.roomAt(p.position[0],-p.position[1])?.storeId??null)
          ||[...players.values(),...residents()].some(other=>other!==a&&other!==b&&Math.abs((other.position[2]??0)-p.position[2])<1&&Math.hypot(x-other.position[0],n-other.position[1])<.7))return false;
      }
    }
    [a,b].forEach((p,i)=>{p.position=[...positions[i],environment.groundAt(positions[i][0],-positions[i][1])];p.poseAt=now();p.moveBudget=.1;});
    return true;
  }
  return {
    cancel,prune,
    active(id){const item=find(id);return item?.status==='active'?item:null;},
    publicFor(player){
      const item=find(player.id);if(item?.status!=='active'||item.expiresAt<=now())return null;
      const peer=players.get(item.fromId===player.id?item.toId:item.fromId);if(!peer)return null;
      return {id:item.id,kind:item.kind,peerId:peer.id,heading:headingTo(player.position,peer.position),elapsed:Math.max(0,(now()-item.startedAt)/1000),target:[(player.position[0]+peer.position[0])/2,(player.position[2]+peer.position[2])/2+1.12,-(player.position[1]+peer.position[1])/2]};
    },
    snapshot(){prune();return structuredClone(entries);},
    command(player,message,ledger,time){
      prune();
      if(message.action==='invite'){
        if(!fields(message,['type','action','kind','peerId'])||!Object.hasOwn(INTERACTIONS,message.kind)||!text(message.peerId))return reject('invalid_interaction','Choose a greeting and a nearby person.');
        const peer=players.get(message.peerId);
        if(!reachable(player,peer))return reject('interaction_reach','Stand close together, in sight and on foot.');
        if(find(player.id)||find(peer.id))return reject('interaction_busy','Finish the current invitation or greeting first.');
        if(time-ledger.gestureAt<5000)return reject('interaction_cooldown','Wait a moment before inviting again.');
        const item={id:`${player.id}:${time}`,fromId:player.id,toId:peer.id,kind:message.kind,status:'pending',startedAt:time,expiresAt:time+INVITATION_MS};
        entries.push(item);ledger.gestureAt=time;changed();return {ok:true,interaction:structuredClone(item)};
      }
      if(!fields(message,['type','action','id'])||!text(message.id)||!['accept','decline','cancel'].includes(message.action))return reject('invalid_interaction','Choose an invitation action.');
      const item=entries.find(entry=>entry.id===message.id);
      if(!item||![item.fromId,item.toId].includes(player.id))return reject('interaction_expired','This invitation has ended.');
      if(message.action==='cancel'){cancel(player.id);return {ok:true};}
      if(item.toId!==player.id||item.status!=='pending')return reject('interaction_recipient','Only the invited person can respond.');
      if(message.action==='decline'){cancel(player.id);return {ok:true};}
      const sender=players.get(item.fromId);
      if(item.kind==='handshake'&&!align(sender,player))return reject('interaction_space','Find a little clear space together before shaking hands.');
      item.status='active';item.startedAt=time;item.expiresAt=time+INTERACTIONS[item.kind].duration;
      for(const p of [sender,player]){p.gesture=null;p.gestureUntil=0;}
      changed();return {ok:true,interaction:structuredClone(item)};
    },
    // Validate before the world commits any recovered state. No partial restores.
    validate(saved=[],nextPlayers){
      const occupied=new Set(),ids=new Set();
      if(!Array.isArray(saved)||saved.length>Math.floor(nextPlayers.size/2))throw new Error('Invalid interactions');
      for(const item of saved){
        if(!fields(item,['id','fromId','toId','kind','status','startedAt','expiresAt'])||!text(item.id)||ids.has(item.id)
          ||!nextPlayers.has(item.fromId)||!nextPlayers.has(item.toId)||item.fromId===item.toId
          ||occupied.has(item.fromId)||occupied.has(item.toId)||!Object.hasOwn(INTERACTIONS,item.kind)
          ||!['pending','active'].includes(item.status)||!Number.isFinite(item.startedAt)||item.startedAt<0
          ||item.expiresAt-item.startedAt!==(item.status==='pending'?INVITATION_MS:INTERACTIONS[item.kind].duration))throw new Error('Invalid interaction');
        occupied.add(item.fromId);occupied.add(item.toId);ids.add(item.id);
      }
      return structuredClone(saved);
    },
    restore(saved){entries=saved;},
    clear(){entries=[];},
  };
}
