const rectangle = (a0, a1, d0, d1) => ({ a: (a0 + a1) / 2, d: (d0 + d1) / 2,
  width: a1 - a0, depth: d1 - d0 });

/** Derive visual shaft bounds solely from an approved level, in room-local metres. */
export function generatedVerticalRoute(room) {
  const level = room?.generatedPlan;
  const polygon = level?.layers?.shell?.[0]?.stairOpening;
  const portals = level?.portals?.filter(portal => portal.kind === 'stairs') ?? [];
  if (!polygon?.length || !portals.length) return null;
  if (polygon.length !== 4) throw new Error('Invalid approved vertical shaft');
  const points = polygon.map(point => room.toLocal(...point));
  if (points.some(point => point.length !== 2 || !point.every(Number.isFinite)))
    throw new Error('Invalid approved vertical shaft');
  const a0 = Math.min(...points.map(point => point[0])), a1 = Math.max(...points.map(point => point[0]));
  const d0 = Math.min(...points.map(point => point[1])), d1 = Math.max(...points.map(point => point[1]));
  const margin = 0.25;
  if (a1 - a0 < 1.4 || d1 - d0 < 2.2 || a0 <= room.aMin + margin || a1 >= room.aMax - margin
    || d0 <= room.frontInset + margin || d1 >= room.depth - margin)
    throw new Error('Approved vertical shaft does not fit the room');
  for (const portal of portals) {
    const [a, d] = room.toLocal(...portal.position);
    if (a < a0 + 0.35 || a > a1 - 0.35 || d < d0 + 0.35 || d > d1 - 0.35)
      throw new Error('Approved vertical landing is outside the shaft');
  }
  const above = portals.some(portal => portal.toLevelId === `${room.buildingId}/l${level.index + 1}`);
  const ceilingPanels = above ? [
    rectangle(room.aMin, a0, room.frontInset, room.depth),
    rectangle(a1, room.aMax, room.frontInset, room.depth),
    rectangle(a0, a1, room.frontInset, d0),
    rectangle(a0, a1, d1, room.depth),
  ] : [rectangle(room.aMin, room.aMax, room.frontInset, room.depth)];
  return { a0, a1, d0, d1, above, ceilingPanels,
    platform: rectangle(a0 + 0.05, a1 - 0.05, d0 + 0.05, d1 - 0.05) };
}
