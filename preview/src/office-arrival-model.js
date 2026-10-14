import { terrainHeight } from './geometry.js';

// Match the outdoor threshold instead of the footprint's average base height.
export const officeLobbyFloor = (world,facade) => terrainHeight(world.terrain,...facade)+(world.walkSurfaceOffset??.2);

// Authored arrival dimensions in metres, in the office's local frame. The
// mapped shell stays unchanged; these are gameplay dimensions, not a survey.
export const ARRIVAL = Object.freeze({
  duration:10.6, boardingEnd:4.2, closingEnd:5.2, ascentEnd:7.6, openingEnd:8.6,
  carWidth:3.2, carDepth:4, carHeight:3.3, doorWidth:1.7, doorHeight:2.6, frontPortalZ:.32,
  lobbyWidth:5.2, lobbyFront:8.2, lobbyHeight:4.35, start:8.9, carStop:1.45,
  facadeOffset:9.5, officeElevation:24.3,
});
export const OFFICE_FINISH = Object.freeze({stone:'#d9d5c8',floor:'#babdaf',ink:'#243b38',bronze:'#a48961',glass:'#93b7ab',ceiling:'#ebe7dc',light:'#fff0d5'});
export const ease = v => {v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);};
const mix=(a,b,v)=>a+(b-a)*v;

export function arrivalFrame(seconds,{reducedMotion=false}={}) {
  const t=Number.isFinite(seconds)?Math.max(0,seconds):0,a=ARRIVAL;
  const base={position:[0,1.25],doors:1,floor:6,done:false,progress:Math.min(1,t/a.duration)};
  if(reducedMotion||t>=a.duration)return {...base,phase:'office',done:true,progress:1};
  if(t<a.boardingEnd)return {...base,phase:t<1.3?'lobby':'boarding',position:[0,-mix(a.start,a.carStop,ease(t/a.boardingEnd))],doors:1,floor:1};
  if(t<a.closingEnd)return {...base,phase:'closing',position:[0,-a.carStop],doors:1-ease((t-a.boardingEnd)/(a.closingEnd-a.boardingEnd)),floor:1};
  if(t<a.ascentEnd)return {...base,phase:'ascending',position:[0,-a.carStop],doors:0,floor:Math.min(6,1+Math.floor(5*ease((t-a.closingEnd)/(a.ascentEnd-a.closingEnd))))};
  if(t<a.openingEnd)return {...base,phase:'opening',position:[0,-a.carStop],doors:ease((t-a.ascentEnd)/(a.openingEnd-a.ascentEnd)),floor:6};
  return {...base,phase:'arriving',position:[0,mix(-a.carStop,1.25,ease((t-a.openingEnd)/(a.duration-a.openingEnd)))],doors:1};
}

// A continuous follow path through the *open* rear door; no camera cuts across
// the car wall. The final blend reaches the existing first-person eye exactly.
export function arrivalCamera(seconds,{aspect=1.44}={}) {
  const a=ARRIVAL,t=Math.max(0,Number.isFinite(seconds)?seconds:0),f=arrivalFrame(t);
  const side=.55*Math.min(1,Math.max(.25,aspect));
  const follow=ease(t/a.boardingEnd),z=mix(a.start+2,a.carStop+2,follow);
  const end=ease((t-a.openingEnd)/(a.duration-a.openingEnd));
  const position=[mix(side,0,end),mix(1.86,1.68,end),mix(z,-1.25,end)];
  // Keep a stable forward view through the threshold while settling to the
  // first-person direction. Camera and avatar are separate continuous paths.
  const target=[0,mix(1.45,1.68,end),mix(-f.position[1]-.6,-4.25,end)];
  return {position,target,verticalFov:62};
}

// One shared bay calculation keeps the interaction at the rendered entrance.
export function officeLobbySpan(width,gymDoor) {
  const pylon=Math.max(gymDoor+1.6,37.6),left=width-17.6-4.3-4.7;
  return [Math.max(pylon+3.2,left-9.2),left-2.6];
}
