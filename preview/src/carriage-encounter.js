import {createPersona} from './personas.js';

export function createCarriageEncounter(world) {
  if(world?.scene!=='district'||!world.walkSpawn?.every(Number.isFinite))return [];
  const persona=createPersona(31,'Prince Jev','Jevica’s vehicles');
  Object.assign(persona,{role:'Prince and companion',homeContext:'Fictional prince who drives Jevica’s vehicles',interest:'Jevica’s happiness, evening walks and thoughtful surprises',
    routine:'chauffeuring Jevica, then stepping down to walk at Jevica’s side',
    about:'I’m your prince, Jevica. I adore you. I’ll take care of the ride, stay beside you, and make room for whatever you wish. Lead the way, or let me show you somewhere lovely—it’s always your choice.',
    story:'I love keeping pace with you. A quiet walk, a fast ride, a little adventure—I’m happiest sharing it with you. If you want space, just say the word.',
    returnGreeting:'There you are, my love. Your ride is ready. Shall we explore together?'});
  return [{id:'carriage-driver',name:'Prince Jev',role:persona.role,persona,fictional:true,stationary:true,vehicleRole:'driver',
    anchorId:'jevica-vehicles',anchorName:'Jevica’s vehicles',position:[...world.walkSpawn],eyeHeight:1.58}];
}
