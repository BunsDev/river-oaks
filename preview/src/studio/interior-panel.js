import { BUILDING_INTERIOR_GENERATOR_VERSION, BUILDING_INTERIOR_MATERIALS } from '../building-interiors-plan.js';
import { previewInteriorLevelRegeneration, withInteriorOverride } from './interior-plan.js';

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};

/** Author level counts through the same region field the server compiles. */
export function renderBuildingInteriorPanel(host, { doc, buildingId, disabled, apply, say, run,
  interiorView, onViewLevel, onLayer }) {
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
  const propose = (next, label, details = []) => run(() => {
    const plan = doc.previewBuildingInterior(buildingId, next);
    const revision = doc.revision;
    preview.replaceChildren(element('strong', label),
      element('p', `${plan.levels.length} level${plan.levels.length === 1 ? '' : 's'} inside the existing ${building.size[2].toFixed(1)} m roof. Entrance, floor IDs and source geometry stay anchored to ${building.id}.`),
      element('p', `Top floor: ${plan.levels.at(-1).floorElevation.toFixed(2)} m. Its shell, partitions, fixtures, finishes and override layers are separate.`),
      ...details.map(text => element('p', text)),
      element('p', 'Generated finishes may change when the published world ID is assigned. Authored finishes are retained.'));
    preview.append(button('Apply preview', () => run(() => {
      if (doc.revision !== revision) throw new Error('The building changed. Preview its levels again.');
      doc.setBuildingInterior(buildingId, next);
      apply(); host.querySelector(`[data-interior-level="${interiorView?.levelIndex ?? 0}"]`)?.focus();
      say('Generated interior updated. Save or export to keep your edits.');
    })), button('Cancel', () => { preview.hidden = true; }));
    preview.hidden = false;
    say('Review the proposed interior change, then apply it.');
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
    const view = button(`View level ${level.index}`, () => onViewLevel(level.index));
    view.dataset.interiorLevel = String(level.index);
    view.setAttribute('aria-pressed', String(interiorView?.levelIndex === level.index));
    item.append(layers, view); levels.append(item);
  }
  host.append(levels);
  if (interiorView?.buildingId === buildingId) {
    const controls = element('fieldset', '', 'studio-interior-layers');
    controls.append(element('legend', `Level ${interiorView.levelIndex} layers`));
    for (const name of ['shell', 'partitions', 'fixtures', 'finishes', 'authoredOverrides']) {
      const label = element('label', name === 'authoredOverrides' ? 'Authored overrides' : name);
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = interiorView.layers[name] !== false;
      input.disabled = disabled; input.addEventListener('change', () => onLayer(name, input.checked));
      label.prepend(input); controls.append(label);
    }
    host.append(controls, button('Show exterior', () => onViewLevel(null)));
    const level = plan.levels[interiorView.levelIndex], fixture = level.layers.fixtures[0], finish = level.layers.finishes[0];
    const edits = element('fieldset', '', 'studio-interior-edits');
    edits.append(element('legend', `Edit level ${level.index}`),
      element('p', 'Move the wall display in building-local metres. Keep the entrance and stair route clear.'));
    const field = (label, value, options) => {
      const wrapper = element('label', label), input = document.createElement(options ? 'select' : 'input');
      input.setAttribute('aria-label', label);
      if (options) for (const choice of options) { const option = element('option', choice); option.value = choice; input.append(option); }
      else { input.type = 'number'; input.step = '0.1'; input.min = '-100'; input.max = '100'; }
      input.value = value; input.disabled = disabled; wrapper.append(input); edits.append(wrapper); return input;
    };
    const center = fixture.localFootprint.reduce((sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4], [0, 0]);
    const u = field('Display local U (m)', Number(center[0].toFixed(4))), v = field('Display local V (m)', Number(center[1].toFixed(4)));
    const originalPosition = [u.value, v.value];
    const displayFinish = field('Display finish', fixture.material ?? 'generated', ['generated', ...BUILDING_INTERIOR_MATERIALS]);
    const floorFinish = field('Floor finish', finish.material, BUILDING_INTERIOR_MATERIALS);
    edits.append(button('Preview furnishing and finishes', () => run(() => {
      let next = interior;
      const moved = u.value !== originalPosition[0] || v.value !== originalPosition[1];
      if (moved && (!u.value.trim() || !v.value.trim())) throw new Error('Enter both furnishing coordinates.');
      if (moved || displayFinish.value !== (fixture.material ?? 'generated')) {
        if (displayFinish.value === 'generated' && fixture.material) throw new Error('Choose a display finish, or reset the level edits.');
        next = withInteriorOverride(next, { targetId: fixture.id,
          ...(moved ? { position: [Number(u.value), Number(v.value)] } : {}),
          ...(displayFinish.value !== 'generated' ? { material: displayFinish.value } : {}) });
      }
      if (floorFinish.value !== finish.material) next = withInteriorOverride(next, { targetId: finish.id, material: floorFinish.value });
      if (next === interior) throw new Error('Change a furnishing coordinate or finish before previewing.');
      propose(next, `Edit level ${level.index}`, ['Only the selected furnishing and finish slots change. Other levels keep their seeds and authored edits.']);
    })));
    if (level.layers.authoredOverrides.length) {
      edits.append(element('p', 'Authored level: regeneration is locked. Other untouched levels can still be regenerated.'),
        button('Preview reset level edits', () => propose({ ...interior, generation: { ...generation,
          overrides: (generation.overrides ?? []).filter(item => !item.targetId.startsWith(`${level.id}/`)) } },
        `Reset level ${level.index} edits`, ['Removes this level’s authored overrides and restores its generated furnishing and finish.'])));
    } else edits.append(button('Preview regenerate untouched level', () => run(() => {
      const result = previewInteriorLevelRegeneration(doc.value, buildingId, level.index);
      propose(result.interior, `Regenerate level ${level.index}`, [
        ...result.changes.map(change => `${change.id}: ${change.before} → ${change.after}`),
        `Unchanged levels: ${result.preservedLevelIds.join(', ') || 'none'}. Room geometry, furnishing IDs and stair connections stay fixed.`,
      ]);
    })));
    host.append(edits);
  }
  if (generation.levels < 8) host.append(button('Preview add level', () => propose({ ...interior,
    generation: { ...generation, levels: generation.levels + 1 } }, `Add level ${generation.levels}`)));
  host.append(preview);
}
