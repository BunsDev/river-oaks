import { placeLink, positionLink } from './places.js';
import { worldIdFromSearch } from './world-contract.js';

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

export function createWorldMap({host,onGo,getPosition,getYaw,shareBase,say,copy}){
  const section=node('details',null,'world-map');section.open=true;
  const summary=node('summary','World map');
  const surface=node('div',null,'world-map-surface');surface.tabIndex=0;surface.setAttribute('role','group');
  surface.setAttribute('aria-label','World map. Click to choose a destination, or use arrow keys to move a destination. Tab to Go here.');
  const art=svg('svg',{viewBox:`0 0 ${SIZE} ${SIZE}`,'aria-hidden':'true',preserveAspectRatio:'none'});
  const ground=svg('rect',{x:0,y:0,width:SIZE,height:SIZE,class:'world-map-ground'});
  const roads=svg('g',{class:'world-map-roads'}),buildings=svg('g',{class:'world-map-buildings'});
  const markers=svg('g',{class:'world-map-markers'}),overlay=svg('g',{class:'world-map-overlay'});
  const self=svg('circle',{class:'world-map-self',r:11,hidden:''});
  const target=svg('circle',{class:'world-map-target',r:15,hidden:''});
  const north=node('span','N ↑','world-map-north');
  const scale=node('span',null,'world-map-scale');
  overlay.append(self,target);art.append(ground,roads,buildings,markers,overlay);surface.append(art,north,scale);
  const legend=node('p','● You   ◆ Saved place   • Destination','world-map-legend');
  const instructions='Click the map or use arrow keys to choose a point. Shift moves 1 m. Go here confirms travel.';
  const hint=node('p',instructions,'world-map-hint');hint.setAttribute('aria-live','polite');
  const actions=node('div',null,'world-map-actions');
  const go=node('button','Go here'),link=node('button','Copy link'),clear=node('button','Clear');
  for(const button of [go,link,clear]){button.type='button';button.disabled=true;actions.append(button);}
  const status=node('p',null,'world-map-status');status.setAttribute('role','status');
  section.append(summary,surface,legend,hint,actions,status);
  host.querySelector('#places-here')?.after(section);
  section.hidden=true;
  let world=null,projection=null,places=[],landmarks=[],selected=null;
  const hereWorldId=()=>worldIdFromSearch(location.search);
  const currentMarks=()=>landmarks.filter(mark=>!mark.worldId||mark.worldId===hereWorldId());
  const mapPoint=position=>projection.toMap(position).map(value=>+value.toFixed(2));
  const points=positions=>positions.map(position=>mapPoint(position).join(',')).join(' ');
  function renderStatic(){
    roads.replaceChildren();buildings.replaceChildren();markers.replaceChildren();
    if(!projection||!world)return;
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
    const name=next?.name??'';
    hint.textContent=next?name==='Map point'?`Map point · ${next.position[0].toFixed(1)} east, ${next.position[1].toFixed(1)} north`:`Selected: ${name}`
      :instructions;
    go.disabled=link.disabled=clear.disabled=!next;
    status.textContent='';
    refresh();
    if(next&&section.open)actions.scrollIntoView({block:'nearest'});
  }
  function chooseMapPoint(point){
    if(!projection)return;
    const position=projection.toWorld(point);
    if(!projection.contains(position)){status.textContent='Choose a point inside this world.';return;}
    const items=[...places,...currentMarks()];
    const nearby=nearestMapPlace(items,point,projection);
    select(nearby??{id:'map-point',name:'Map point',kind:'link',position:position.map(value=>+value.toFixed(1)),yaw:getYaw?.()??0});
  }
  surface.addEventListener('click',event=>{
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
        ? result.error==='destination_blocked'||result.message==='destination_blocked'
          ? 'That point is blocked. Choose a nearby path or open space.'
          : result.error==='travel_cooldown'||result.message==='travel_cooldown'
            ? 'Wait a moment before travelling again.'
            : result.message??'That point is not reachable right now.'
        :`You're at ${destination.name}.`;
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
      summary.textContent=next?.title?`${next.title} map`:'World map';
      if(projection){
        const distance=Math.max(projection.bounds[2]-projection.bounds[0],projection.bounds[3]-projection.bounds[1])>150?50:10;
        scale.textContent=`${distance} m`;scale.style.setProperty('--world-map-scale-width',`${distance*projection.scale/10}%`);
      }
      select(null);renderStatic();
    },
    setPlaces(next){places=next;renderStatic();},
    setLandmarks(next){landmarks=next;renderStatic();},
    refresh,
    dispose(){section.remove();},
  };
}
