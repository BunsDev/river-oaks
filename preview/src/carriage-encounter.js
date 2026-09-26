import {createPersona} from './personas.js';

export function createCarriageEncounter(world) {
  if(world?.scene!=='district'||!world.walkSpawn?.every(Number.isFinite))return [];
  const persona=createPersona(31,'Jules','Jevica’s carriage');
  Object.assign(persona,{role:'Unicorn coachman',homeContext:'Fictional carriage driver',interest:'unicorn care and scenic carriage rides',
    routine:'checking the harness, caring for the team and driving the coach',
    about:'I’m Jules, Jevica’s coachman. I look after the unicorn team and guide the carriage through the district.',
    story:'A smooth ride starts before the wheels turn: a comfortable harness, a calm team, and time to notice the road.',
    returnGreeting:'Welcome back. The cabin is yours; I’ll take care of the team.'});
  return [{id:'carriage-driver',name:'Jules',role:persona.role,persona,fictional:true,stationary:true,vehicleRole:'driver',
    anchorId:'jevica-carriage',anchorName:'Jevica’s carriage',position:[...world.walkSpawn],eyeHeight:1.58}];
}
