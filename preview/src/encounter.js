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

export function encounterPosition(environment, local, visitor, locals = []) {
  const target = local.position;
  if (!target?.slice(0, 3).every(Number.isFinite)) return null;
  const others = locals.filter(person => person.id !== local.id && person.position?.slice(0, 3).every(Number.isFinite));
  const comfortable = position => {
    if (!clearEncounterLine(environment, position, target)) return false;
    const dx = target[0] - position[0], dy = target[1] - position[1], length2 = dx * dx + dy * dy;
    return others.every(person => {
      if (Math.abs(person.position[2] - target[2]) > 3) return true;
      const t = Math.max(0, Math.min(1, ((person.position[0] - position[0]) * dx + (person.position[1] - position[1]) * dy) / length2));
      return Math.hypot(person.position[0] - position[0] - dx * t, person.position[1] - position[1] - dy * t) > 0.8;
    });
  };
  const validVisitor = visitor?.slice(0, 3).every(Number.isFinite);
  const distance = validVisitor ? Math.hypot(visitor[0] - target[0], visitor[1] - target[1]) : Infinity;
  if (distance >= 1.8 && distance <= 3.5 && comfortable(visitor)) return visitor;
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
