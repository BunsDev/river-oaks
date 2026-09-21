export const VISITOR_FORMS = [
  { id: 'alien', label: 'Scary alien', description: 'An otherworldly visitor with luminous skin and enormous dark eyes.' },
  { id: 'witch', label: 'Scary witch', description: 'A pointed hat, midnight robes and a little district magic.' },
  { id: 'jevica', label: 'Jevica', description: 'Glinda-inspired magic: pink gown, blonde curls and a crystal crown.' },
];
const LINES = {
  alien: ["Whoa… a visitor from another planet!", "Those eyes! Is this a close encounter?", "Okay, that is wonderfully terrifying."],
  witch: ["A witch! That hat is unmistakable.", "Did the district just get a little more magical?", "You gave me a fright—what an entrance!"],
  jevica: ["Wait… Jevica?! You're really here!", "Jevica! That gown is magical!", "I can't believe I'm meeting Jevica!"],
};
export function visitorGreeting(local, form) {
  const lines = LINES[form];
  if (!lines) return null;
  const seed = [...local.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return `${lines[seed % lines.length]} ${local.indoor ? `Welcome to ${local.anchorName}.` : 'Welcome to the neighborhood.'}`;
}

// Transient authored reactions: no changes to needs, jobs, identities or routes.
// Visitors in neighboring rooms cannot see or startle each other through walls.
export function createVisitorReactions() {
  let previousForm = null;
  const seen = new Map();
  return {
    update(locals, pose, form, now, canSee = () => true) {
      if (form !== previousForm) { seen.clear(); previousForm = form; }
      const active = [];
      for (const local of locals) {
        delete local.visitorReaction;
        if (!pose || !LINES[form] || (local.storeId ?? null) !== pose.roomId) continue;
        const distance = Math.hypot(local.position[0] - pose.position[0], -local.position[1] - pose.position[2]);
        if (distance > 12 || Math.abs(local.position[2] - pose.ground - (pose.altitude ?? 0)) > 6 || !canSee(local.position)) continue;
        let timing = seen.get(local.id);
        if (!timing || now - timing.started > 28000) { timing = { started: now }; seen.set(local.id, timing); }
        if (now - timing.started > 5500) continue;
        local.visitorReaction = { form, action: form === 'jevica' ? 'amazed' : form === 'alien' ? 'startled' : 'enchanted', text: visitorGreeting(local, form) };
        active.push(local);
      }
      return active.sort((a, b) => Math.hypot(a.position[0] - pose.position[0], -a.position[1] - pose.position[2]) - Math.hypot(b.position[0] - pose.position[0], -b.position[1] - pose.position[2]));
    },
    reset() { seen.clear(); previousForm = null; },
  };
}
