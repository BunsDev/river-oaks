import {createPersona} from './personas.js';

export function createCarriageEncounter(world) {
  if(world?.scene!=='district'||!world.walkSpawn?.every(Number.isFinite))return [];
  const persona=createPersona(31,'Prince Jev','Jevica’s carriage');
  Object.assign(persona,{role:'Prince and companion',homeContext:'Fictional prince who drives Jevica’s carriage',interest:'unicorn care, evening walks and scenic carriage rides',
    routine:'driving the unicorn coach, then stepping down to walk at Jevica’s side',
    about:'I’m Prince Jev. I drive your carriage, care for the unicorn team, and whenever you like I’ll step down and walk the district with you.',
    story:'A good walk needs no destination: an open street, an unhurried pace, and someone worth keeping in step with.',
    returnGreeting:'Welcome back, Jevica. Shall we ride, or walk together a while?'});
  return [{id:'carriage-driver',name:'Prince Jev',role:persona.role,persona,fictional:true,stationary:true,vehicleRole:'driver',
    anchorId:'jevica-carriage',anchorName:'Jevica’s carriage',position:[...world.walkSpawn],eyeHeight:1.58}];
}
