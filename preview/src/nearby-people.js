/** Rank encounters in local east/north/up meters without changing simulation order. */
export function nearbyPeople(locals, visitor, radius = 40, limit = 3) {
  if (!visitor?.slice(0, 3).every(Number.isFinite)) return [];
  return locals.filter(local => !local.abducted && local.position?.slice(0, 3).every(Number.isFinite))
    .map(local => ({ local, distance: Math.hypot(local.position[0] - visitor[0], local.position[1] - visitor[1]) }))
    .filter(item => item.distance <= radius && Math.abs(item.local.position[2] - visitor[2]) <= 4)
    .sort((a, b) => a.distance - b.distance || a.local.id.localeCompare(b.local.id))
    .slice(0, limit);
}
