import { BUILDING_INTERIOR_GENERATOR_VERSION } from '../building-interiors-plan.js';

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};

/** Author level counts through the same region field the server compiles. */
export function renderBuildingInteriorPanel(host, { doc, buildingId, disabled, apply, say, run }) {
  host.replaceChildren();
  const building = doc.value.buildings?.find(item => item.id === buildingId);
  host.hidden = !building;
  if (!building) return;
  host.append(element('h3', 'Generated interior'));
  if (building.kind === 'parking') {
    host.append(element('p', 'Parking structures cannot contain walk-in interiors.'));
    return;
  }
  const interior = building.interior;
  const preview = element('div', '', 'studio-interior-preview');
  preview.hidden = true;
  const button = (label, action) => {
    const control = element('button', label);
    control.type = 'button'; control.disabled = disabled;
    control.addEventListener('click', action);
    return control;
  };
  const propose = (next, label) => run(() => {
    const plan = doc.previewBuildingInterior(buildingId, next);
    const revision = doc.revision;
    preview.replaceChildren(element('strong', label),
      element('p', `${plan.levels.length} level${plan.levels.length === 1 ? '' : 's'} inside the existing ${building.size[2].toFixed(1)} m roof. Entrance, floor IDs and source geometry stay anchored to ${building.id}.`),
      element('p', `New top floor: ${plan.levels.at(-1).floorElevation.toFixed(2)} m. Its shell, partitions, fixtures, finishes and override layers are separate.`),
      element('p', 'Finish choices in this preview may change when the published world ID is assigned.'));
    preview.append(button('Apply preview', () => run(() => {
      if (doc.revision !== revision) throw new Error('The building changed. Preview its levels again.');
      doc.setBuildingInterior(buildingId, next);
      apply(); say('Generated interior updated. Save or export to keep the levels.');
    })), button('Cancel', () => { preview.hidden = true; }));
    preview.hidden = false;
    say('Review the proposed level change, then apply it.');
  });
  if (!interior?.generation) {
    const next = { ...(interior ?? { name: building.id.replaceAll('-', ' '),
      category: building.kind === 'residential' ? 'home' : 'art', entrance: 'south' }),
      generation: { version: BUILDING_INTERIOR_GENERATOR_VERSION, levels: 1 } };
    host.append(element('p', 'Start with one floor fitted to this building primitive.'),
      button('Preview level 0', () => propose(next, 'Add generated ground floor')),
      preview);
    return;
  }
  const generation = interior.generation;
  host.append(element('p', `Seed: ${generation.seed ?? building.id} · generator v${generation.version} · anchor: ${building.id}`));
  const plan = doc.previewBuildingInterior(buildingId, interior);
  const levels = element('ol', '', 'studio-interior-levels');
  for (const level of plan.levels) {
    const item = element('li', `Level ${level.index} · ${level.floorElevation.toFixed(2)} m`);
    const layers = element('small', Object.entries(level.layers).map(([name, values]) =>
      `${name} ${values.length}`).join(' · '));
    item.append(layers); levels.append(item);
  }
  host.append(levels);
  if (generation.levels < 8) host.append(button('Preview add level', () => propose({ ...interior,
    generation: { ...generation, levels: generation.levels + 1 } }, `Add level ${generation.levels}`)));
  host.append(preview);
}
