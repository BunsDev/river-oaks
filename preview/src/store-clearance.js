// Standing stations need space for bodies as well as point positions. Include
// rendered counter overhangs and seating even where those fixtures are walkable.
function footprints(room) {
  const boxes=[];
  const add=(a,d,w,l)=>boxes.push({a0:a-w/2,a1:a+w/2,d0:d-l/2,d1:d+l/2});
  for(const f of room.fixtures){
    if(f.kind==='bar'){
      add(f.a-f.side*0.5,(f.d0+f.d1)/2,0.72,f.d1-f.d0+0.04);
      add(f.a,(f.d0+f.d1)/2,0.6,f.d1-f.d0);
    }else if(f.kind==='feature'){
      add(f.a,f.d-0.2,f.w+0.1,0.42); // Low stone ledge projects into the standing area.
    }else if(['rail','shelves','niche','eyewear','towels','station'].includes(f.kind)){
      add(f.a,(f.d0+f.d1)/2,0.6,f.d1-f.d0);
    }else if(Number.isFinite(f.d)&&Number.isFinite(f.w)&&Number.isFinite(f.l)){
      if(['lightbox','artwork','feature'].includes(f.kind))continue;
      const overhang=f.kind==='reception'&&f.style==='host'?0.1:['table','counter','reception','concession','gelato'].includes(f.kind)?0.06:0;
      add(f.a,f.d,f.w+overhang,f.kind==='counter'?0.68:f.l+overhang);
    }
  }
  return boxes;
}

export function clearStandingStations(room) {
  const radius=0.28,margin=radius+0.005,boxes=footprints(room);
  for(const person of room.people){
    if(person.role==='mannequin'||person.pose==='seated')continue;
    const free=(a,d)=>a>room.aMin+radius&&a<room.aMax-radius&&d>radius&&d<room.depth-radius
      &&!boxes.some(b=>a>b.a0-radius&&a<b.a1+radius&&d>b.d0-radius&&d<b.d1+radius)
      &&room.people.every(other=>other===person||Math.hypot(a-other.a,d-other.d)>=0.55);
    if(free(person.a,person.d))continue;
    const candidates=[];
    const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    const add=(a,d)=>candidates.push([clamp(a,room.aMin+margin,room.aMax-margin),clamp(d,margin,room.depth-margin)]);
    add(person.a,person.d);
    // Exact edges preserve nearby stations instead of snapping every person to
    // a grid. The grid finds gaps between intersecting fixture footprints.
    for(const box of boxes){add(box.a0-margin,person.d);add(box.a1+margin,person.d);add(person.a,box.d0-margin);add(person.a,box.d1+margin);}
    for(let a=room.aMin+margin;a<room.aMax-margin;a+=0.1)for(let d=margin;d<room.depth-margin;d+=0.1)add(a,d);
    candidates.sort((a,b)=>Math.hypot(a[0]-person.a,a[1]-person.d)-Math.hypot(b[0]-person.a,b[1]-person.d));
    const clear=candidates.find(([a,d])=>free(a,d));
    if(clear){
      const station=person.role==='staff'&&person.pose==='attend'?room.fixtures.filter(f=>['counter','desk','reception','concession'].includes(f.kind))
        .sort((a,b)=>Math.hypot(a.a-person.a,a.d-person.d)-Math.hypot(b.a-person.a,b.d-person.d))[0]:null;
      [person.a,person.d]=clear;
      if(station){const a=station.a-person.a,d=station.d-person.d,length=Math.hypot(a,d);person.facing=[a/length,d/length];}
    }
  }
}
