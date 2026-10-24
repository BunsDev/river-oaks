// #517 default-appearance trial (Val's #638 handoff). The owner default (Jevica)
// and the guest default (Sable, on Jevica's rig) keep their authored face, eyes,
// hair style, outfit and palette. They take only the realism parts listed here,
// at the strength the viewer's quality tier sets. Cornea shells, iris recolor,
// the skin-wrap shader and sheen are never applied to them. The trial also left
// out pore normals (uniform pores pebble the lips and neck), card coverage (it
// more than doubles the brow and lash footprint) and strand recolor (it turns
// Sable's beige hair cream-green); see docs/acceptance/default-appearance-517.md.
// Every other look keeps its imported materials. Set `enabled` to false to roll
// the trial back.
export const DEFAULT_APPEARANCE_REALISM = Object.freeze({
  enabled: true,
  appearances: Object.freeze({
    jevica: Object.freeze(['roughness']),
    'sable-human': Object.freeze(['roughness']),
  }),
});

// The realism components for one appearance, or null to keep imported materials.
export function defaultAppearanceRealism(appearanceId, policy = DEFAULT_APPEARANCE_REALISM) {
  if (!policy.enabled || !Object.hasOwn(policy.appearances, appearanceId ?? '')) return null;
  return [...policy.appearances[appearanceId]];
}
