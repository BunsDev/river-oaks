import region0 from '../../public/data/starter-districts/market-street.json' with { type: 'json' };
import region1 from '../../public/data/starter-districts/garden-neighborhood.json' with { type: 'json' };
import region2 from '../../public/data/starter-districts/arts-courtyard.json' with { type: 'json' };
import region3 from '../../public/data/starter-districts/civic-square.json' with { type: 'json' };
import region4 from '../../public/data/starter-districts/innovation-campus.json' with { type: 'json' };

// Original synthetic blockouts. See docs/starter-districts.md for design intent.
const regions = [region0,region1,region2,region3,region4];
export const districtTemplates = [
  {
    "id": "market-street",
    "name": "Market Street",
    "description": "A pedestrian shopping spine ending at a market hall. Small storefronts keep the route lively and easy to read.",
    "firstEdit": "Resize one shop; keep the central promenade and hall forecourt clear."
  },
  {
    "id": "garden-neighborhood",
    "name": "Garden Neighborhood",
    "description": "Six low homes around a shared garden loop, with a direct central walk home.",
    "firstEdit": "Move a home along the outside of the loop; preserve the shared green."
  },
  {
    "id": "arts-courtyard",
    "name": "Arts Courtyard",
    "description": "A sheltered sculpture court framed by studios and a taller gallery. The open south edge welcomes visitors.",
    "firstEdit": "Shape the gallery silhouette or rename the four exhibition stops."
  },
  {
    "id": "civic-square",
    "name": "Civic Square",
    "description": "A broad crossing and open civic forecourt, anchored by a tall public hall and four corner pavilions.",
    "firstEdit": "Give the hall a distinct height; keep the cross-axis visible from arrival."
  },
  {
    "id": "innovation-campus",
    "name": "Innovation Campus",
    "description": "Two linked garden courts give workspaces a shared heart, with a central arrival and clear east\u2013west connection.",
    "firstEdit": "Vary one workspace height; leave both courtyard loops connected."
  }
];
export function createDistrict(id) {
  const index = districtTemplates.findIndex(template => template.id === id);
  if (index < 0) throw new Error('Choose a known district template.');
  return structuredClone(regions[index]);
}
