import { personPosition, personEyeHeight, personDistance } from './person-position.js';

/** Coordinates here are local east/north/up; collision queries use scene x/z. */
export function clearEncounterLine(environment, from, to) {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (!Number.isFinite(distance)) return false;
  const steps = Math.max(1, Math.ceil(distance / 0.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!environment.isFree(from[0] + (to[0] - from[0]) * t, -from[1] - (to[1] - from[1]) * t)) return false;
  }
  return true;
}

export function clearConversationLine(environment,from,to,eyeHeight=1.5) {
  if(![...from,...to,eyeHeight].every(Number.isFinite))return false;
  return environment.hasSightLine?.(from,[to[0],to[1],to[2]+eyeHeight]) ?? clearEncounterLine(environment,from,to);
}

/** Talking range: anyone this close with a clear line stays where they are. */
export const ENCOUNTER_NEAR = 1.0, ENCOUNTER_FAR = 4.5;

// Indoor directory visits approach the chosen person, including staff behind a
// counter, without stepping into fixtures or another room.
export function indoorEncounterPosition(environment,local,visitor,locals=[]) {
  const target=personPosition(local);
  const valid=position=>{
    if(!environment.isFree(position[0],-position[1])||(environment.roomAt(position[0],-position[1])?.storeId??null)!==(local.storeId??null))return false;
    const eye=position===visitor?visitor:[position[0],position[1],environment.groundAt(position[0],-position[1])+1.68];
    if(personDistance(local,eye)>ENCOUNTER_FAR || !clearConversationLine(environment,eye,target,personEyeHeight(local)))return false;
    return locals.every(person=>person.id===local.id||person.storeId!==local.storeId||Math.hypot(person.position[0]-position[0],person.position[1]-position[1])>=0.7);
  };
  const distance=visitor?Math.hypot(visitor[0]-target[0],visitor[1]-target[1]):Infinity;
  if(distance>=ENCOUNTER_NEAR&&distance<=ENCOUNTER_FAR&&valid(visitor))return visitor;
  const preferred=visitor?Math.atan2(visitor[1]-target[1],visitor[0]-target[0]):0,candidates=[];
  for(const radius of [1.8,2.5,3.2,4.2])for(let i=0;i<48;i++){
    const angle=preferred+i/48*Math.PI*2,position=[target[0]+Math.cos(angle)*radius,target[1]+Math.sin(angle)*radius,target[2]];
    if(valid(position))candidates.push({position,score:Math.abs(radius-2.5)+(visitor?Math.hypot(position[0]-visitor[0],position[1]-visitor[1]):i)});
  }
  candidates.sort((a,b)=>a.score-b.score);return candidates[0]?.position??null;
}

// Doorway corridors count as free space, so a resident sheltering on a threshold
// has ring candidates inside the boutique; the visitor must stay on their own side.
const insideStore = (environment, position) => {
  const room = environment.roomAt?.(position[0], -position[1]);
  return Boolean(room) && room.toLocal(position[0], position[1])[1] > 0;
};

export function encounterPosition(environment, local, visitor, locals = []) {
  const target = personPosition(local);
  if (!target?.slice(0, 3).every(Number.isFinite)) return null;
  const others = locals.filter(person => person.id !== local.id && person.position?.slice(0, 3).every(Number.isFinite));
  const validVisitor = visitor?.slice(0, 3).every(Number.isFinite);
  const side = insideStore(environment, validVisitor ? visitor : target);
  const comfortable = position => {
    if (insideStore(environment, position) !== side) return false;
    if (!clearEncounterLine(environment, position, target)) return false;
    const eye=position===visitor?visitor:[position[0],position[1],(environment.groundAt?.(position[0],-position[1])??local.position[2])+1.68];
    if(personDistance(local,eye)>ENCOUNTER_FAR || !clearConversationLine(environment,eye,target,personEyeHeight(local)))return false;
    const dx = target[0] - position[0], dy = target[1] - position[1], length2 = dx * dx + dy * dy;
    return others.every(person => {
      if (Math.abs(person.position[2] - target[2]) > 3) return true;
      const t = Math.max(0, Math.min(1, ((person.position[0] - position[0]) * dx + (person.position[1] - position[1]) * dy) / length2));
      return Math.hypot(person.position[0] - position[0] - dx * t, person.position[1] - position[1] - dy * t) > 0.8;
    });
  };
  const distance = validVisitor ? Math.hypot(visitor[0] - target[0], visitor[1] - target[1]) : Infinity;
  if (distance >= ENCOUNTER_NEAR && distance <= ENCOUNTER_FAR && comfortable(visitor)) return visitor;
  const preferred = validVisitor ? Math.atan2(visitor[1] - target[1], visitor[0] - target[0]) : -Math.PI / 2;
  const candidates = [];
  for (const radius of [2.5, 3.2, 1.9]) for (let i = 0; i < 24; i++) {
    const angle = preferred + Math.PI * 2 * i / 24;
    const position = [target[0] + Math.cos(angle) * radius, target[1] + Math.sin(angle) * radius, target[2]];
    if (comfortable(position)) candidates.push({ position, score: Math.abs(radius - 2.5) + (validVisitor ? Math.hypot(position[0] - visitor[0], position[1] - visitor[1]) : i) });
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.position ?? null;
}
