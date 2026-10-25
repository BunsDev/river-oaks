// #517 default-appearance trial (Val's #638 handoff). Switched on, the guest
// default (Sable, on Jevica's rig) keeps her authored face, eyes, hair style,
// outfit and palette and takes only the realism parts listed here, at the
// strength the viewer's quality tier sets. Cornea shells, iris recolor, the
// skin-wrap shader and sheen are never applied. The trial also left out pore
// normals (uniform pores pebble the lips and neck), card coverage (it more than
// doubles the brow and lash footprint) and strand recolor (it turns Sable's beige
// hair cream-green). Roughness passed the visual review, but it ships switched
// off: Jevica's ×8 crowd (timing-6) and then Sable's ×24 crowd (timing-7) went
// past the +10% CPU bar on the shared test host, so Jevica was stopped and then
// the whole trial. Setting `enabled` to true turns Sable's roughness on once a
// quiet host or device measures it within the bar. Measure with it set to true:
// the timing fixture follows this policy, and with the switch off it would time
// her whole preset at `high`. See
// docs/acceptance/default-appearance-517.md. Every other look keeps its imported
// materials.
export const DEFAULT_APPEARANCE_REALISM = Object.freeze({
  enabled: false,
  appearances: Object.freeze({
    'sable-human': Object.freeze(['roughness']),
  }),
});

// The realism components for one appearance, or null to keep imported materials.
export function defaultAppearanceRealism(appearanceId, policy = DEFAULT_APPEARANCE_REALISM) {
  if (!policy.enabled || !Object.hasOwn(policy.appearances, appearanceId ?? '')) return null;
  return [...policy.appearances[appearanceId]];
}
