import { personElevation, personEyeHeight } from './person-position.js';
import { ENCOUNTER_FAR } from './encounter.js';

/** Rank encounters in local east/north/up meters without changing simulation order. */
export function nearbyPeople(locals, visitor, radius = 40, limit = 3, canMeet = () => true) {
  if (!visitor?.slice(0, 3).every(Number.isFinite) || limit <= 0) return [];
  const ranked = locals.filter(local => !local.abducted && local.position?.slice(0, 3).every(Number.isFinite))
    .map(local => ({ local, distance: Math.hypot(local.position[0] - visitor[0], local.position[1] - visitor[1]) }))
    .filter(item => item.distance <= radius && Math.abs(personElevation(item.local) + personEyeHeight(item.local) - visitor[2]) <= ENCOUNTER_FAR)
    .sort((a, b) => a.distance - b.distance || a.local.id.localeCompare(b.local.id));
  const nearby=[];
  for (const item of ranked) {
    if (!canMeet(item.local)) continue;
    nearby.push(item);
    if (nearby.length >= limit) break;
  }
  return nearby;
}
