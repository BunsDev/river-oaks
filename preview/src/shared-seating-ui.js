import { buildKind,buildRoomAt } from './shared-build.js';
import { resolveSeat,seatSlots,SEAT_REACH } from './shared-seating.js';
import './shared-seating.css';

export function createSharedSeatingControls({host,getTown,getPose,getEnvironment,request,onConfirmed}) {
  const panel=document.createElement('section');panel.className='shared-seating-controls';panel.hidden=true;panel.setAttribute('aria-label','Furniture seating');
  panel.innerHTML='<label for="nearby-seat">Nearby seats</label><select id="nearby-seat"></select><button type="button" id="seat-sit">Sit down</button><button type="button" id="seat-stand" hidden>Stand up</button><p id="seat-status" role="status" aria-live="polite"></p>';
  host.append(panel);
  const select=panel.querySelector('select'),sit=panel.querySelector('#seat-sit'),stand=panel.querySelector('#seat-stand'),status=panel.querySelector('#seat-status'),label=panel.querySelector('label');
  let busy=false,lastPaint=-Infinity,signature='',choices=[];
  const send=async message=>{
    if(busy)return;busy=true;sit.disabled=stand.disabled=true;
    try{
      const result=await request(message);
      if(result.ok&&result.player){onConfirmed(result.player);status.textContent=result.player.sitting?'Seated. Drag to look around.':'You are standing.';}
      else status.textContent=result.message??'The town could not confirm that action.';
    }catch(error){status.textContent=error.message;}
    finally{busy=false;lastPaint=-Infinity;}
  };
  select.addEventListener('change',()=>{lastPaint=-Infinity;});
  sit.addEventListener('click',()=>{
    const choice=choices.find(item=>item.key===select.value);
    if(choice&&!choice.occupied)void send({type:'sit',buildId:choice.buildId,slot:choice.slot});
  });
  stand.addEventListener('click',()=>void send({type:'stand'}));
  return {panel,update(now){
    if(now-lastPaint<200)return;lastPaint=now;
    const town=getTown(),pose=getPose(),environment=getEnvironment();
    if(!town||!pose||!environment){panel.hidden=true;return;}
    const self=town.snapshot?.players.find(player=>player.id===town.identity?.id),seated=Boolean(pose.sitting);
    const position=[pose.position[0],-pose.position[2]],roomId=buildRoomAt(environment,position)?.storeId??null;
    choices=(town.snapshot?.builds??[]).flatMap(build=>seatSlots(build.kind).map(slot=>{
      const seat=resolveSeat(build,slot),distance=Math.hypot(seat.position[0]-position[0],seat.position[1]-position[1]);
      if(distance>SEAT_REACH || (buildRoomAt(environment,seat.position)?.storeId??null)!==roomId)return null;
      const occupant=town.snapshot.players.find(player=>player.sitting?.buildId===build.id&&player.sitting.slot===slot);
      return {key:`${build.id}:${slot}`,buildId:build.id,slot,distance,occupied:Boolean(occupant),
        label:`${buildKind(build.kind).label}${build.kind==='seat'?` · ${slot===0?'left':'right'}`:''} · ${build.ownerName}${occupant?' · Occupied':''}`};
    }).filter(Boolean)).sort((a,b)=>a.distance-b.distance||a.key.localeCompare(b.key)).slice(0,8);
    panel.hidden=!seated&&!choices.length;
    label.hidden=select.hidden=sit.hidden=seated;stand.hidden=!seated;
    const key=JSON.stringify(choices.map(({key,label,occupied})=>[key,label,occupied]));
    if(key!==signature) {
      signature=key;const previous=select.value;
      select.replaceChildren(...choices.map(choice=>{const option=document.createElement('option');option.value=choice.key;option.textContent=choice.label;option.disabled=choice.occupied;return option;}));
      if(choices.some(choice=>choice.key===previous&&!choice.occupied))select.value=previous;
      else select.value=choices.find(choice=>!choice.occupied)?.key??'';
    }
    const connected=Boolean(town.connected&&self);
    select.disabled=busy||!connected||pose.flying||Boolean(pose.riding);
    sit.disabled=select.disabled||!choices.some(choice=>choice.key===select.value&&!choice.occupied);
    stand.disabled=busy||!connected;
  },dispose(){panel.remove();}};
}
