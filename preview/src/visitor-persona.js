<<<<<<< Updated upstream
// The three authorized player forms. Jevica is the default.
export const VISITOR_FORMS = [
  { id:'alien', label:'Alien', role:'The visitor from the stars', avatar:1, reaction:'startled', description:'Grey skin, a sculpted bald cranium, dark eyes, a fitted black suit and a personal UFO.' },
  { id:'witch', label:'Witch', role:'The midnight wanderer', avatar:2, reaction:'enchanted', description:'Obsidian velvet, a fitted crooked hat and a magic flying broom.' },
=======
// Jevica is the only playable character.
export const VISITOR_FORMS = [
>>>>>>> Stashed changes
  { id:'jevica', label:'Jevica', role:'The rose enchantress', avatar:4, profile:'jevica', reaction:'amazed', description:'Blonde hair, embroidered rose silk, a filigree crown and a flying bubble.' },
];
export const formFor = id => VISITOR_FORMS.find(form => form.id === id) ?? null;
const LINES = {
<<<<<<< Updated upstream
  alien:["A visitor from the stars! Welcome!", "Your ship is incredible. Where did you travel from?", "Those eyes… what an entrance!"],
  witch: ["A witch! That hat is unmistakable.", "Did the district just get a little more magical?", "You gave me a fright—what an entrance!"],
=======
>>>>>>> Stashed changes
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
      const active = [], action = formFor(form)?.reaction ?? 'amazed';
      for (const local of locals) {
        delete local.visitorReaction;
        if (!pose || !LINES[form] || (local.storeId ?? null) !== pose.roomId) continue;
        const distance = Math.hypot(local.position[0] - pose.position[0], -local.position[1] - pose.position[2]);
        if (distance > 12 || Math.abs(local.position[2] - pose.ground - (pose.altitude ?? 0)) > 6 || !canSee(local.position)) continue;
        let timing = seen.get(local.id);
        if (!timing || now - timing.started > 28000) { timing = { started: now }; seen.set(local.id, timing); }
        if (now - timing.started > 5500) continue;
        local.visitorReaction = { form, action, text: visitorGreeting(local, form) };
        active.push(local);
      }
      return active.sort((a, b) => Math.hypot(a.position[0] - pose.position[0], -a.position[1] - pose.position[2]) - Math.hypot(b.position[0] - pose.position[0], -b.position[1] - pose.position[2]));
    },
    reset() { seen.clear(); previousForm = null; },
  };
}
