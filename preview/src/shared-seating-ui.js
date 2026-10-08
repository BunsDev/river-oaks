import { buildKind,buildRoomAt } from './shared-build.js';
import { resolveSeat,seatSlots,SEAT_REACH } from './shared-seating.js';
import './shared-seating.css';

// `getBenches` lists storefront bench places ({buildId, slot, x, north}) and
// `isHeld(key)` says whether a resident sits on one, so the panel offers the
// same seats as the Z key.
// Choosing a particular nearby seat. Standing up is the walking HUD's primary
// action while seated (and Z), so this panel only shows when the player can sit.
// isBusy shares one in-flight guard with the HUD's seat commands.
export function createSharedSeatingControls({host,getTown,getPose,getEnvironment,request,onConfirmed,getBenches=()=>[],isHeld=()=>false,isBusy=()=>false}) {
  const panel=document.createElement('section');panel.className='shared-seating-controls';panel.hidden=true;panel.setAttribute('aria-label','Furniture seating');
  panel.innerHTML='<label for="nearby-seat">Nearby seats</label><select id="nearby-seat"></select><button type="button" id="seat-sit">Sit down</button><p id="seat-status" role="status" aria-live="polite"></p>';
  host.append(panel);
  const select=panel.querySelector('select'),sit=panel.querySelector('#seat-sit'),status=panel.querySelector('#seat-status');
  let busy=false,lastPaint=-Infinity,signature='',choices=[];
  const send=async message=>{
    if(busy||isBusy())return;busy=true;sit.disabled=true;
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
  return {panel,busy:()=>busy,update(now){
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
    }).filter(Boolean)).concat(getBenches().map(seat=>{
      const distance=Math.hypot(seat.x-position[0],seat.north-position[1]),key=`${seat.buildId}:${seat.slot}`;
      if(distance>SEAT_REACH || (buildRoomAt(environment,[seat.x,seat.north])?.storeId??null)!==roomId)return null;
      const occupied=isHeld(key)||town.snapshot.players.some(player=>player.sitting?.buildId===seat.buildId&&player.sitting.slot===seat.slot);
      return {key,buildId:seat.buildId,slot:seat.slot,distance,occupied,label:`Storefront bench · ${seat.slot===0?'left':'right'}${occupied?' · Occupied':''}`};
    }).filter(Boolean)).sort((a,b)=>a.distance-b.distance||a.key.localeCompare(b.key)).slice(0,8);
    panel.hidden=seated||!choices.length;
    const key=JSON.stringify(choices.map(({key,label,occupied})=>[key,label,occupied]));
    if(key!==signature) {
      signature=key;const previous=select.value;
      select.replaceChildren(...choices.map(choice=>{const option=document.createElement('option');option.value=choice.key;option.textContent=choice.label;option.disabled=choice.occupied;return option;}));
      if(choices.some(choice=>choice.key===previous&&!choice.occupied))select.value=previous;
      else select.value=choices.find(choice=>!choice.occupied)?.key??'';
    }
    const connected=Boolean(town.connected&&self);
    select.disabled=busy||isBusy()||!connected||pose.flying||Boolean(pose.riding);
    sit.disabled=select.disabled||!choices.some(choice=>choice.key===select.value&&!choice.occupied);
  },dispose(){panel.remove();}};
}
