// One deterministic shared-town cast for simulation, rendering, and room text.
// Keep every outdoor resident for community scenarios. Each shop keeps its
// first staff member and every second guest; static mannequins are also halved.
export function includeSharedStorePerson(room, spot, index) {
  const ordinal = room.people.slice(0, index).filter(person => person.role === spot.role).length;
  if (spot.role === 'staff') return ordinal === 0;
  if (spot.role === 'guest') return ordinal % 2 === 1;
  if (spot.role === 'mannequin') return ordinal % 2 === 0;
  return true;
}

export function sharedRoomSummary(room) {
  const counts = { staff: 0, guests: 0, mannequins: 0 };
  room.people.forEach((spot, index) => {
    if (!includeSharedStorePerson(room, spot, index)) return;
    if (spot.role === 'staff') counts.staff++;
    if (spot.role === 'guest') counts.guests++;
    if (spot.role === 'mannequin') counts.mannequins++;
  });
  return { ...room.summary, ...counts };
}
