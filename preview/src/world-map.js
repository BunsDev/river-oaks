import { placeLink, positionLink } from './places.js';
import { worldIdFromSearch } from './world-contract.js';
import { travelRefusal } from './travel-message.js';
import { categorySlug } from './store-categories.js';

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

// Label only long, visible streets. Keep names upright and the atlas uncluttered.
export function mapRoadLabels(roads,projection){
  if(!projection)return [];
  const candidates=[];
  for(const road of roads??[]){
    if(!road.name||['footway','pedestrian','path','service'].includes(road.kind)||!Array.isArray(road.points))continue;
    let best=null;
    for(let i=1;i<road.points.length;i++){
      if(!finitePair(road.points[i-1])||!finitePair(road.points[i]))continue;
      const a=projection.toMap(road.points[i-1]),b=projection.toMap(road.points[i]);
      const length=Math.hypot(b[0]-a[0],b[1]-a[1]),position=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      if(length<road.name.length*12+36||position.some(value=>value<80||value>SIZE-80))continue;
      let angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
      if(angle>90)angle-=180;if(angle< -90)angle+=180;
      if(!best||length>best.length)best={name:road.name,position,angle,length};
    }
    if(best)candidates.push(best);
  }
  const labels=[];
  for(const {length,...candidate} of candidates.sort((a,b)=>b.length-a.length)){
    if(labels.some(label=>label.name===candidate.name||Math.hypot(label.position[0]-candidate.position[0],label.position[1]-candidate.position[1])<150))continue;
    labels.push(candidate);if(labels.length===6)break;
  }
  return labels;
}

// Each kind of place has its own silhouette, centred on its position so a click
// on the shape still lands on the place: a sparkle for arrival, a shopping-bag
// square, a dinner plate, a cut gem, a flower for beauty and wellness, a house.
const MARKER_SHAPES={arrival:'sparkle',shopping:'square',dining:'plate',jewelry:'gem',beauty:'flower',homes:'house'};
export const placeShape=place=>MARKER_SHAPES[place?.kind==='arrival'?'arrival':categorySlug(place?.category)]??'dot';
const star=(x,y,points,outer,inner)=>Array.from({length:points*2},(_,i)=>{
  const angle=-Math.PI/2+i*Math.PI/points,radius=i%2?inner:outer;
  return `${(x+Math.cos(angle)*radius).toFixed(2)},${(y+Math.sin(angle)*radius).toFixed(2)}`;
}).join(' L ');
const circle=(x,y,r)=>`M ${x-r} ${y} a ${r} ${r} 0 1 0 ${2*r} 0 a ${r} ${r} 0 1 0 ${-2*r} 0 Z`;
export function markerPath(shape,x,y,size=8){
  const s=size;
  switch(shape){
    case 'sparkle':return `M ${star(x,y,4,s*1.35,s*.42)} Z`;
    case 'square':return `M ${x-s*.88} ${y-s*.88} H ${x+s*.88} V ${y+s*.88} H ${x-s*.88} Z`;
    case 'plate':return `${circle(x,y,s)} ${circle(x,y,s*.42)}`;
    case 'gem':return `M ${x-s} ${y-s*.3} L ${x-s*.48} ${y-s} H ${x+s*.48} L ${x+s} ${y-s*.3} L ${x} ${y+s} Z`;
    case 'flower':return `M ${star(x,y,5,s*1.12,s*.52)} Z`;
    case 'house':return `M ${x} ${y-s} L ${x+s} ${y-s*.15} V ${y+s*.9} H ${x-s} V ${y-s*.15} Z`;
    default:return circle(x,y,s);
  }
}
// The walker's yaw turns forward to (-sin yaw, -cos yaw) on this north-up map,
// so an arrow drawn pointing up is rotated by -yaw. Unwrap against the last angle
// so a turn through south eases the short way round instead of spinning.
const KEY_PATHS={arrow:'M 0 -9 L 7 7 L 0 3 L -7 7 Z',diamond:'M 0 -8 L 7 0 L 0 8 L -7 0 Z',ring:circle(0,0,6),parcel:'M -7 -7 H 7 V 7 H -7 Z'};
export const legendPath=shape=>KEY_PATHS[shape]??markerPath(shape,0,0,7);
const CATEGORY_KEYS=[['shopping','Shopping'],['dining','Dining'],['jewelry','Jewelry'],['beauty','Beauty'],['homes','Homes']];
// The key lists the symbols this map can show: every kind of place it holds,
// saved places and players (both can appear at any time), and parcels if any.
export function mapLegend(places,hasParcels=false){
  const list=places??[],present=new Set(list.map(place=>categorySlug(place.category)).filter(Boolean));
  return [{kind:'self',shape:'arrow',label:'You'},
    ...(list.some(place=>place.kind==='arrival')?[{kind:'place',shape:'sparkle',label:'Arrival'}]:[]),
    ...CATEGORY_KEYS.filter(([slug])=>present.has(slug)).map(([slug,label])=>({kind:'place',shape:MARKER_SHAPES[slug],category:slug,label})),
    ...(list.some(place=>place.kind!=='arrival'&&!categorySlug(place.category))?[{kind:'place',shape:'dot',label:'Destination'}]:[]),
    {kind:'landmark',shape:'diamond',label:'Saved place'},{kind:'peer',shape:'ring',label:'Player'},
    ...(hasParcels?[{kind:'parcel',shape:'parcel',label:'Parcel'}]:[])];
}
export const headingDegrees=yaw=>-yaw*180/Math.PI;
export function unwrapDegrees(previous,next){
  if(!Number.isFinite(previous))return next;
  return previous+((((next-previous)%360)+540)%360-180);
}
let mapInstances=0;

export function createWorldMap({host,onGo,getPosition,getYaw,isOutdoor=()=>true,shareBase,say,copy}){
  const id=`world-map-${++mapInstances}`;
  const section=node('details',null,'world-map');section.open=true;
  const summary=node('summary','World map');
  const surface=node('div',null,'world-map-surface');surface.tabIndex=0;surface.setAttribute('role','group');
  surface.setAttribute('aria-label','World map. Click to choose a destination, or use arrow keys to move a destination. Tab to its action button.');
  const art=svg('svg',{viewBox:`0 0 ${SIZE} ${SIZE}`,'aria-hidden':'true',preserveAspectRatio:'none'});
  const ground=svg('rect',{x:0,y:0,width:SIZE,height:SIZE,class:'world-map-ground'});
  // A survey-dot grid and a heading-cone gradient, scoped to this map instance.
  const defs=svg('defs'),grid=svg('pattern',{id:`${id}-grid`,width:25,height:25,patternUnits:'userSpaceOnUse'});
  grid.append(svg('circle',{cx:12.5,cy:12.5,r:1.6,class:'world-map-grid-dot'}));
  defs.append(grid);
  const paper=svg('rect',{x:0,y:0,width:SIZE,height:SIZE,class:'world-map-grid',fill:`url(#${id}-grid)`});
  const parcels=svg('g',{class:'world-map-parcels'}),roads=svg('g',{class:'world-map-roads'}),buildings=svg('g',{class:'world-map-buildings'});
  const casings=svg('g',{class:'world-map-casings'}),centres=svg('g',{class:'world-map-centres'});
  const roadLabels=node('div',null,'world-map-road-labels');roadLabels.setAttribute('aria-hidden','true');
  // Places and players draw on a second, filter-free layer, so a player moving or a
  // marker growing on hover never repaints the drawing (and its shadows) beneath.
  const live=svg('svg',{viewBox:`0 0 ${SIZE} ${SIZE}`,'aria-hidden':'true',preserveAspectRatio:'none',class:'world-map-live'});
  const markers=svg('g',{class:'world-map-markers'}),people=svg('g',{class:'world-map-people'});
  // You and the chosen point are HTML above both, moved and animated with composited
  // transforms: a breathing halo, a soft cone where you are looking, and an arrow.
  const self=node('div',null,'world-map-self');self.hidden=true;
  const selfArt=svg('svg',{viewBox:'-70 -70 140 140','aria-hidden':'true'}),selfDefs=svg('defs');
  const glow=svg('radialGradient',{id:`${id}-cone`,cx:0,cy:0,r:70,gradientUnits:'userSpaceOnUse'});
  glow.append(svg('stop',{offset:'0',class:'world-map-cone-near'}),svg('stop',{offset:'1',class:'world-map-cone-far'}));
  selfDefs.append(glow);
  selfArt.append(selfDefs,svg('path',{class:'world-map-self-cone',d:'M 0 0 L -30 -62 A 69 69 0 0 1 30 -62 Z',fill:`url(#${id}-cone)`}),
    svg('path',{class:'world-map-self-arrow',d:'M 0 -16 L 12 12 L 0 5 L -12 12 Z'}));
  self.append(node('span',null,'world-map-self-halo'),selfArt);
  let heading=null,placed=null;
  const target=node('span',null,'world-map-target');target.hidden=true;
  const place=(element,[x,y])=>{element.style.setProperty('--x',(x/10).toFixed(3));element.style.setProperty('--y',(y/10).toFixed(3));};
  const targetLabel=node('div',null,'world-map-selection-label');targetLabel.hidden=true;
  const north=node('span','N','world-map-north');north.setAttribute('aria-label','North is up');
  const scale=node('span',null,'world-map-scale');
  art.append(defs,ground,paper,parcels,casings,roads,centres,buildings);live.append(markers,people);
  surface.append(art,live,roadLabels,self,target,north,scale,targetLabel);
  const legend=node('ul',null,'world-map-legend');legend.setAttribute('aria-label','Map key');
  const renderLegend=()=>legend.replaceChildren(...mapLegend(places,parcels.childElementCount>0).map(({kind,shape,category,label})=>{
    const item=node('li'),symbol=node('span',null,`world-map-key world-map-key-${kind}`),art=svg('svg',{viewBox:'-12 -12 24 24'});
    symbol.setAttribute('aria-hidden','true');if(category)symbol.dataset.category=category;
    art.append(svg('path',{d:legendPath(shape),'fill-rule':'evenodd'}));
    symbol.append(art);item.append(symbol,document.createTextNode(label));return item;
  }));
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
    parcels.replaceChildren();casings.replaceChildren();roads.replaceChildren();centres.replaceChildren();buildings.replaceChildren();roadLabels.replaceChildren();markers.replaceChildren();parcelList.replaceChildren();
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
      const walking=['footway','pedestrian','path'].includes(road.kind);
      const width=walking?clamp((road.width_m??2)*projection.scale,2,5):clamp((road.width_m??4)*projection.scale,3,24);
      const line=svg('polyline',{points:points(road.points),class:`world-map-road${walking?' world-map-path':''}`,'stroke-width':width});
      if(road.name){const title=svg('title');title.textContent=road.name;line.append(title);}
      roads.append(line);
      // Streets get a kerb casing and, when named and wide enough, a dashed centre line.
      if(!walking){
        casings.append(svg('polyline',{points:points(road.points),class:'world-map-road-casing','stroke-width':width+5}));
        if(road.name&&road.kind!=='service'&&width>=9)centres.append(svg('polyline',{points:points(road.points),class:'world-map-road-centre'}));
      }
    }
    for(const building of world.buildings??[]){
      const ring=buildingFootprint(building);
      if(ring.length<3)continue;
      buildings.append(svg('polygon',{points:points(ring),class:'world-map-building'}));
    }
    for(const label of mapRoadLabels(world.roads,projection)){
      const [x,y]=label.position,text=node('span',label.name,'world-map-road-label');
      text.style.left=`${x/10}%`;text.style.top=`${y/10}%`;text.style.transform=`translate(-50%,-50%) rotate(${label.angle}deg)`;roadLabels.append(text);
    }
    for(const place of places){
      if(!finitePair(place.position)||!projection.contains(place.position))continue;
      const [cx,cy]=mapPoint(place.position),shape=placeShape(place);
      const marker=svg('path',{d:markerPath(shape,cx,cy,place.kind==='arrival'?11.5:9.5),class:'world-map-place','data-shape':shape,'fill-rule':'evenodd'});
      const category=categorySlug(place.category);if(category)marker.dataset.category=category;
      const title=svg('title');title.textContent=place.name;marker.append(title);markers.append(marker);
    }
    for(const mark of currentMarks()){
      if(!finitePair(mark.position)||!projection.contains(mark.position))continue;
      const [x,y]=mapPoint(mark.position),diamond=svg('polygon',{points:`${x},${y-9} ${x+8},${y} ${x},${y+9} ${x-8},${y}`,class:'world-map-landmark'});
      const title=svg('title');title.textContent=mark.name;diamond.append(title);markers.append(diamond);
    }
    renderLegend();
    refresh();
  }
  function refresh(){
    if(!projection)return;
    const position=getPosition();
    if(finitePair(position)&&projection.contains(position)){
      const [cx,cy]=mapPoint(position),yaw=getYaw?.();
      if(Number.isFinite(yaw))heading=unwrapDegrees(heading,headingDegrees(yaw));
      // Glide between the half-second updates, but jump on travel or first sight.
      const jump=!placed||self.hidden||Math.hypot(cx-placed[0],cy-placed[1])>60;
      if(jump)self.classList.add('world-map-jump');
      place(self,[cx,cy]);self.style.setProperty('--heading',`${(heading??0).toFixed(2)}deg`);self.hidden=false;
      if(jump){self.getBoundingClientRect();self.classList.remove('world-map-jump');}
      placed=[cx,cy];
    }else self.hidden=true;
    if(selected){
      const [cx,cy]=mapPoint(selected.position);place(target,[cx,cy]);target.hidden=false;
      targetLabel.style.left=`clamp(96px, ${cx/10}%, calc(100% - 96px))`;targetLabel.style.top=`${cy/10}%`;
      targetLabel.classList.toggle('above',cy>SIZE/2);targetLabel.title=selected.name;
      targetLabel.textContent=selected.name;targetLabel.removeAttribute('hidden');
    }else {target.hidden=true;targetLabel.setAttribute('hidden','');}
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
    selectPlace: select,
    refresh,
    dispose(){section.remove();},
  };
}
