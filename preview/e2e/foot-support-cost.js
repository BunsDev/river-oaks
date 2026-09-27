async page=>{
  const origin='http://127.0.0.1:5173';
  await page.goto(`${origin}/e2e/fixtures/motion.html`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  return page.evaluate(async()=>{
    const [{loadResidentAvatar},{createWalkingEnvironment},{terrainHeight},world]=await Promise.all([
      import('/src/avatars.js'),import('/src/walking.js'),import('/src/geometry.js'),fetch('/data/district.json').then(r=>r.json()),
    ]);
    const environment=createWalkingEnvironment(world),room=environment.rooms[0];
    const outdoor=[environment.spawn[0],-environment.spawn[1]],indoor=room.toWorld((room.aMin+room.aMax)/2,room.depth/2);
    const cases=[
      {name:'24 outdoor residents',count:24,origin:outdoor,ground:(x,z)=>terrainHeight(world.terrain,x,-z)+(world.walkSurfaceOffset??.15)},
      {name:'player outside',count:1,origin:outdoor,ground:environment.groundAt},
      {name:'player inside',count:1,origin:[indoor[0],-indoor[1]],ground:environment.groundAt,room},
    ];
    const results=[];
    for(const scenario of cases)for(const speed of [0,1.1])for(const footprints of [false,true]) {
      const avatars=await Promise.all(Array.from({length:scenario.count},(_,i)=>scenario.count===1?loadResidentAvatar(4,'player','jevica'):loadResidentAvatar(i,`cost-${i}`)));
      if(!footprints)for(const a of avatars)for(const leg of a.feet){leg.sole=[];leg.roll=null;}
      let distance=0,queries=0;const timings=[];
      const ground=(x,z)=>{queries++;return scenario.ground(x,z);};
      for(let frame=0;frame<240;frame++) {
        distance+=speed/60;
        for(const [i,a] of avatars.entries()){
          let x=scenario.origin[0]+(scenario.count===1?0:i*.3),z=scenario.origin[1]+distance;
          if(scenario.room){const p=room.toWorld(room.center+.5*Math.sin(distance/.5),room.depth/2+.5*Math.cos(distance/.5));x=p[0];z=-p[1];if(!room.contains(x,-z))throw new Error('Indoor benchmark left its room');}
          a.object.position.set(x,scenario.ground(x,z),z);
        }
        const start=performance.now();
        for(const a of avatars)a.update(frame*1000/60,'continue',false,{speed,distance},ground);
        if(frame>=60)timings.push(performance.now()-start);
      }
      timings.sort((a,b)=>a-b);
      results.push({scenario:scenario.name,speed,footprints,medianMs:timings[Math.floor(timings.length*.5)],p95Ms:timings[Math.floor(timings.length*.95)],queriesPerFrame:queries/240});
      avatars.forEach(a=>a.dispose());
    }
    return {rooms:environment.rooms.length,results,scope:'CPU avatar updates using actual district terrain and production room lookup, six resident profiles and the Jevica player rig. Indoor positions remain in the room. Footprint-disabled path also disables the foot rocker to compare total contact-solving cost, not a district FPS baseline; costume and rendering excluded.'};
  });
}
