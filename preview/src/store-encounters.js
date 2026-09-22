import { createPersona } from './personas.js';

const OCCUPATIONS = {
  fashion: ['Style adviser', 'Tailor'], leather: ['Leather goods specialist', 'Client adviser'],
  jewelry: ['Jewelry adviser', 'Watch specialist'], perfumery: ['Fragrance consultant', 'Perfumer'],
  optician: ['Eyewear stylist', 'Optical associate'], gallery: ['Gallery guide', 'Art adviser'],
  dining: ['Host', 'Server', 'Bartender'], gelato: ['Gelato maker', 'Counter attendant'],
  cinema: ['Cinema host', 'Projection technician', 'Concession attendant'], salon: ['Hair stylist', 'Colorist', 'Salon host'],
  wellness: ['Fitness trainer', 'Studio host'],
};
const GUEST_ROLES = { dining:'Dining guest', gelato:'Café guest', salon:'Salon client', wellness:'Studio member', cinema:'Cinema guest', gallery:'Gallery visitor', optician:'Eyewear client' };
const NAMES = ['Alex', 'Jordan', 'Morgan', 'Casey', 'Taylor', 'Drew', 'Robin', 'Avery', 'Quinn', 'Sasha', 'Jamie', 'Reese'];
export const storePersonId = (room, index) => `store-${room.storeId}-person-${index}`;

// The same stable identity is used by the rendered mesh, keyboard encounters,
// the directory and dialogue. Display mannequins are deliberately not people.
export function createStoreEncounters(rooms) {
  return rooms.flatMap(room => room.people.flatMap((spot, index) => {
    if (spot.role === 'mannequin') return [];
    const name = NAMES[(room.index * 3 + index) % NAMES.length];
    const staffIndex = room.people.slice(0,index).filter(person=>person.role==='staff').length;
    const occupations=OCCUPATIONS[room.theme] ?? ['Client adviser'];
    const role = spot.role === 'staff' ? occupations[staffIndex % occupations.length] : GUEST_ROLES[room.theme] ?? 'Visiting shopper';
    const persona = createPersona(24 + room.index * 10 + index, name, room.name);
    Object.assign(persona, {
      role, homeContext: `Fictional ${role.toLowerCase()} at ${room.name}`,
      about: `I’m ${name}, ${spot.role === 'staff' ? 'a ' + role.toLowerCase() + ' here at' : 'visiting'} ${room.name}. ${spot.role === 'staff' ? 'I can tell you about my work and help you explore the space.' : 'I’m taking some time to enjoy the district.'}`,
      routine: spot.role === 'staff' ? `welcoming visitors and working as a ${role.toLowerCase()}` : 'visiting the shops and meeting friends',
      interest: room.summary?.label ?? room.theme,
    });
    return [{ id: storePersonId(room, index), name, role, persona, fictional: true,
      indoor: true, storeId: room.storeId, anchorId: room.storeId, anchorName: room.name,
      eyeHeight:spot.pose==='seated'?(spot.seat??0.46)+0.69:1.55,
      position: [...room.toWorld(spot.a, spot.d), room.floor],
    }];
  }));
}
