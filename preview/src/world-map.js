import { placeLink, positionLink } from './places.js';
import { worldIdFromSearch } from './world-contract.js';
import { travelRefusal } from './travel-message.js';

const SVG='http://www.w3.org/2000/svg', SIZE=1000, PAD=36;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finitePair=value=>Array.isArray(value)&&value.length>=2&&Number.isFinite(value[0])&&Number.isFinite(value[1]);
const svg=(tag,attributes={})=>{
  const node=document.createElementNS(SVG,tag);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
  return node;
};
const node=(tag,text,className)=>{
  const element=document.createElement(tag);
  if(text)element.textContent=text;
  if(className)element.className=className;
  return element;
};

export function mapProjection(bounds){
  if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite)
    ||bounds[2]<=bounds[0]||bounds[3]<=bounds[1])return null;
  const width=bounds[2]-bounds[0],height=bounds[3]-bounds[1];
  const scale=(SIZE-2*PAD)/Math.max(width,height);
  const center=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];
  const toMap=position=>[SIZE/2+(position[0]-center[0])*scale,SIZE/2-(position[1]-center[1])*scale];
  const toWorld=position=>[center[0]+(position[0]-SIZE/2)/scale,center[1]-(position[1]-SIZE/2)/scale];
  const contains=position=>position[0]>=bounds[0]&&position[0]<=bounds[2]&&position[1]>=bounds[1]&&position[1]<=bounds[3];
  return {scale,toMap,toWorld,contains,bounds:[...bounds]};
}

export function buildingFootprint(building){
  if(Array.isArray(building?.ring)&&building.ring.length>=3&&building.ring.every(finitePair))
    return building.ring.map(point=>point.slice(0,2));
  if(!finitePair(building?.center)||!finitePair(building?.size))return [];
  const angle=(Number.isFinite(building.yaw_deg)?building.yaw_deg:0)*Math.PI/180;
  const cos=Math.cos(angle),sin=Math.sin(angle),[width,depth]=building.size;
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>{
    const east=x*width/2,north=y*depth/2;
    return [building.center[0]+east*cos-north*sin,building.center[1]+east*sin+north*cos];
  });
}

export function nearestMapPlace(places,point,projection,within=20){
  if(!projection||!finitePair(point))return null;
  let selected=null,distance=within;
  for(const place of places){
    if(!finitePair(place.position))continue;
    const marker=projection.toMap(place.position),next=Math.hypot(marker[0]-point[0],marker[1]-point[1]);
    if(next<=distance){selected=place;distance=next;}
  }
  return selected;
}

export function createWorldMap({host,onGo,getPosition,getYaw,isOutdoor=()=>true,shareBase,say,copy}){
  const section=node('details',null,'world-map');section.open=true;
  const summary=node('summary','World map');
  const surface=node('div',null,'world-map-surface');surface.tabIndex=0;surface.setAttribute('role','group');
  surface.setAttribute('aria-label','World map. Click to choose a destination, or use arrow keys to move a destination. Tab to its action button.');
  const art=svg('svg',{viewBox:`0 0 ${SIZE} ${SIZE}`,'aria-hidden':'true',preserveAspectRatio:'none'});
  const ground=svg('rect',{x:0,y:0,width:SIZE,height:SIZE,class:'world-map-ground'});
  const parcels=svg('g',{class:'world-map-parcels'}),roads=svg('g',{class:'world-map-roads'}),buildings=svg('g',{class:'world-map-buildings'});
  const markers=svg('g',{class:'world-map-markers'}),people=svg('g',{class:'world-map-people'}),overlay=svg('g',{class:'world-map-overlay'});
  const self=svg('circle',{class:'world-map-self',r:11,hidden:''});
  const target=svg('circle',{class:'world-map-target',r:15,hidden:''});
  const north=node('span','N ↑','world-map-north');
  const scale=node('span',null,'world-map-scale');
  overlay.append(self,target);art.append(ground,parcels,roads,buildings,markers,people,overlay);surface.append(art,north,scale);
  const legend=node('p','● You   ◉ Player   ◇ Parcel   ◆ Saved place   • Destination','world-map-legend');
  const parcelDetails=node('details',null,'world-map-parcel-list'),parcelSummary=node('summary','Land parcels · 0'),parcelList=node('ul');
  parcelDetails.append(parcelSummary,parcelList);parcelDetails.hidden=true;
  const peopleDetails=node('details',null,'world-map-player-list'),peopleSummary=node('summary','People here · 0'),peopleList=node('ul');
  peopleDetails.append(peopleSummary,peopleList);peopleDetails.hidden=true;
  const instructions='Click the map or use arrow keys to choose a point. Shift moves 1 m. Parcels and people can be selected from their lists.';
  const hint=node('p',instructions,'world-map-hint');hint.setAttribute('aria-live','polite');
  const actions=node('div',null,'world-map-actions');
  const go=node('button','Go here'),link=node('button','Copy link'),clear=node('button','Clear');
  for(const button of [go,link,clear]){button.type='button';button.disabled=true;actions.append(button);}
  const status=node('p',null,'world-map-status');status.setAttribute('role','status');
  section.append(summary,surface,legend,parcelDetails,peopleDetails,hint,actions,status);
  host.querySelector('#places-here')?.after(section);
  section.hidden=true;
  let world=null,projection=null,places=[],landmarks=[],selected=null,peers=[],selfId=null;
  const peerNodes=new Map();let peerListSignature='';
  const hereWorldId=()=>worldIdFromSearch(location.search);
  const currentMarks=()=>landmarks.filter(mark=>!mark.worldId||mark.worldId===hereWorldId());
  const mapPoint=position=>projection.toMap(position).map(value=>+value.toFixed(2));
  const points=positions=>positions.map(position=>mapPoint(position).join(',')).join(' ');
  const authoredParcels=()=>world?.parcels?.filter(parcel=>typeof parcel.name==='string'
    &&Array.isArray(parcel.bounds_m)&&parcel.bounds_m.length===4&&Array.isArray(parcel.ring))??[];
  const ownerLabel=parcel=>!parcel.ownerId?'Unassigned':parcel.ownerId===selfId?'Your parcel':'Owned parcel';
  const parcelSelection=parcel=>({kind:'parcel',id:parcel.id,name:parcel.name,
    position:[(parcel.bounds_m[0]+parcel.bounds_m[2])/2,(parcel.bounds_m[1]+parcel.bounds_m[3])/2],
    area:Math.round((parcel.bounds_m[2]-parcel.bounds_m[0])*(parcel.bounds_m[3]-parcel.bounds_m[1])),ownerId:parcel.ownerId});
  function renderStatic(){
    parcels.replaceChildren();roads.replaceChildren();buildings.replaceChildren();markers.replaceChildren();parcelList.replaceChildren();
    if(!projection||!world)return;
    const plots=authoredParcels();parcelDetails.hidden=!plots.length;parcelSummary.textContent=`Land parcels · ${plots.length}`;
    for(const parcel of plots){
      const shape=svg('polygon',{points:points(parcel.ring),class:'world-map-parcel','data-parcel-id':parcel.id});
      if(selected?.kind==='parcel'&&selected.id===parcel.id)shape.classList.add('selected');
      const title=svg('title');title.textContent=`${parcel.name} · ${ownerLabel(parcel)}`;shape.append(title);parcels.append(shape);
      const item=node('li'),button=node('button',`${parcel.name} · ${ownerLabel(parcel)}`);
      button.type='button';button.addEventListener('click',()=>select(parcelSelection(parcel)));item.append(button);parcelList.append(item);
    }
    for(const road of world.roads??[]){
      if(!Array.isArray(road.points)||road.points.length<2||!road.points.every(finitePair))continue;
      const line=svg('polyline',{points:points(road.points),class:'world-map-road',
        'stroke-width':clamp((road.width_m??4)*projection.scale,3,34)});
      if(road.name){const title=svg('title');title.textContent=road.name;line.append(title);}
      roads.append(line);
    }
    for(const building of world.buildings??[]){
      const ring=buildingFootprint(building);
      if(ring.length<3)continue;
      buildings.append(svg('polygon',{points:points(ring),class:'world-map-building'}));
    }
    for(const place of places){
      if(!finitePair(place.position)||!projection.contains(place.position))continue;
      const [cx,cy]=mapPoint(place.position),marker=svg('circle',{cx,cy,r:place.kind==='arrival'?9:6,class:'world-map-place'});
      const title=svg('title');title.textContent=place.name;marker.append(title);markers.append(marker);
    }
    for(const mark of currentMarks()){
      if(!finitePair(mark.position)||!projection.contains(mark.position))continue;
      const [x,y]=mapPoint(mark.position),diamond=svg('polygon',{points:`${x},${y-9} ${x+8},${y} ${x},${y+9} ${x-8},${y}`,class:'world-map-landmark'});
      const title=svg('title');title.textContent=mark.name;diamond.append(title);markers.append(diamond);
    }
    refresh();
  }
  function refresh(){
    if(!projection)return;
    const position=getPosition();
    if(finitePair(position)&&projection.contains(position)){
      const [cx,cy]=mapPoint(position);self.setAttribute('cx',cx);self.setAttribute('cy',cy);self.removeAttribute('hidden');
    }else self.setAttribute('hidden','');
    if(selected){
      const [cx,cy]=mapPoint(selected.position);target.setAttribute('cx',cx);target.setAttribute('cy',cy);target.removeAttribute('hidden');
    }else target.setAttribute('hidden','');
  }
  function select(next){
    selected=next;
    for(const shape of parcels.children)shape.classList.toggle('selected',next?.kind==='parcel'&&shape.dataset.parcelId===next.id);
    const name=next?.name??'';
    hint.textContent=next?name==='Map point'?`Map point · ${next.position[0].toFixed(1)} east, ${next.position[1].toFixed(1)} north`
      :next.kind==='peer'?`Selected: ${name} · live player`
        :next.kind==='parcel'?`${name} · ${ownerLabel(next)} · ${next.area} m²`:`Selected: ${name}`
      :instructions;
    go.textContent=next?.kind==='peer'?'Meet nearby':'Go here';
    go.disabled=!next||next.kind==='parcel';clear.disabled=!next;link.disabled=!next||['peer','parcel'].includes(next.kind);
    status.textContent='';
    refresh();
    if(next&&section.open)actions.scrollIntoView({block:'nearest'});
  }
  function chooseMapPoint(point){
    if(!projection)return;
    const position=projection.toWorld(point);
    if(!projection.contains(position)){status.textContent='Choose a point inside this world.';return;}
    const items=[...places,...currentMarks(),...peers];
    const nearby=nearestMapPlace(items,point,projection);
    select(nearby??{id:'map-point',name:'Map point',kind:'link',position:position.map(value=>+value.toFixed(1)),yaw:getYaw?.()??0});
  }
  surface.addEventListener('click',event=>{
    const parcelId=event.target.closest?.('[data-parcel-id]')?.dataset.parcelId;
    if(parcelId){const parcel=authoredParcels().find(item=>item.id===parcelId);if(parcel){select(parcelSelection(parcel));return;}}
    const rect=surface.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    chooseMapPoint([(event.clientX-rect.left)/rect.width*SIZE,(event.clientY-rect.top)/rect.height*SIZE]);
  });
  surface.addEventListener('keydown',event=>{
    if(event.key==='Escape'){select(null);return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||!projection)return;
    event.preventDefault();
    const origin=selected?.position??getPosition()??world.walkSpawn;
    if(!finitePair(origin))return;
    const step=event.shiftKey?1:Math.max(2,Math.round(Math.max(projection.bounds[2]-projection.bounds[0],projection.bounds[3]-projection.bounds[1])/50));
    const delta={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,step],ArrowDown:[0,-step]}[event.key];
    const position=[clamp(origin[0]+delta[0],projection.bounds[0],projection.bounds[2]),clamp(origin[1]+delta[1],projection.bounds[1],projection.bounds[3])];
    select({id:'map-point',name:'Map point',kind:'link',position,yaw:getYaw?.()??0});
  });
  go.addEventListener('click',async()=>{
    if(!selected)return;
    const destination=selected;go.disabled=true;status.textContent=`Heading to ${destination.name}…`;
    try{
      const result=await onGo(destination);
      status.textContent=result?.ok===false
        ? travelRefusal(result,{blocked:'That point is blocked. Choose a nearby path or open space.',
          cooldown:'Wait a moment before travelling again.',fallback:'That point is not reachable right now.'})
        :destination.kind==='peer'?`You're near ${destination.name}.`:`You're at ${destination.name}.`;
      say(status.textContent,result?.ok===false?'error':'ok');
    }catch(error){status.textContent=error.message??'That point is not reachable right now.';say(status.textContent,'error');}
    finally{go.disabled=!selected;}
  });
  link.addEventListener('click',()=>{
    if(!selected)return;
    const address=selected.kind==='landmark'||selected.kind==='link'
      ?positionLink(selected.position,selected.yaw??0,shareBase()):placeLink(selected,shareBase());
    void copy(address);
  });
  clear.addEventListener('click',()=>select(null));
  return {
    setWorld(next){
      world=next;projection=mapProjection(next?.bounds_m);section.hidden=!projection;
      people.replaceChildren();peerNodes.clear();peers=[];peerListSignature='';peopleList.replaceChildren();peopleDetails.hidden=true;
      summary.textContent=next?.title?`${next.title} map`:'World map';
      if(projection){
        const distance=Math.max(projection.bounds[2]-projection.bounds[0],projection.bounds[3]-projection.bounds[1])>150?50:10;
        scale.textContent=`${distance} m`;scale.style.setProperty('--world-map-scale-width',`${distance*projection.scale/10}%`);
      }
      select(null);renderStatic();
    },
    setPlaces(next){places=next;renderStatic();},
    setLandmarks(next){landmarks=next;renderStatic();},
    setPlayers(next,playerId){
      if(selfId!==playerId){selfId=playerId;renderStatic();}
      peers=projection?(next??[]).filter(player=>player.id!==playerId&&typeof player.id==='string'
        &&typeof player.name==='string'&&finitePair(player.position)&&projection.contains(player.position)
        &&isOutdoor(player.position)).map(player=>({id:`peer:${player.id}`,ref:player.id,name:player.name,kind:'peer',position:player.position.slice(0,2)})):[];
      const active=new Set(peers.map(peer=>peer.ref));
      for(const [id,marker] of peerNodes)if(!active.has(id)){marker.remove();peerNodes.delete(id);}
      for(const peer of peers){
        let marker=peerNodes.get(peer.ref);
        if(!marker){marker=svg('circle',{class:'world-map-peer',r:8,'data-peer-id':peer.ref});const title=svg('title');marker.append(title);people.append(marker);peerNodes.set(peer.ref,marker);}
        const [cx,cy]=mapPoint(peer.position);marker.setAttribute('cx',cx);marker.setAttribute('cy',cy);
        marker.firstChild.textContent=peer.name;
      }
      const signature=peers.map(peer=>`${peer.ref}\u0000${peer.name}`).join('\u0001');
      if(signature!==peerListSignature){
        peerListSignature=signature;peopleList.replaceChildren(...peers.map(peer=>{
          const item=node('li'),button=node('button',peer.name);button.type='button';button.dataset.peerId=peer.ref;
          button.setAttribute('aria-label',`Select ${peer.name} on the map`);
          button.addEventListener('click',()=>select(peers.find(current=>current.ref===peer.ref)??null));
          item.append(button);return item;
        }));
        peopleSummary.textContent=`People here · ${peers.length}`;peopleDetails.hidden=!peers.length;
      }
      if(selected?.kind==='peer'){
        const current=peers.find(peer=>peer.ref===selected.ref);
        if(current){selected=current;refresh();}
        else{select(null);status.textContent='That player is no longer outdoors in this world.';}
      }
    },
    refresh,
    dispose(){section.remove();},
  };
}
