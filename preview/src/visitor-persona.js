// Jevica remains the spell persona; solo and shared play choose visual characters separately.
export const VISITOR_FORMS = [
  { id:'jevica', label:'Jevica', role:'The rose enchantress', avatar:4, profile:'jevica', reaction:'acknowledge', description:'Rose-pink silk, gold floral embroidery, a luminous star wand and a flying bubble.' },
];
export const formFor = id => VISITOR_FORMS.find(form => form.id === id) ?? null;
const LINES = {
  jevica: ["Wait… Jevica?! You're really here!", "Jevica! That gown is magical!", "I can't believe I'm meeting Jevica!"],
};
export function visitorGreeting(local, form) {
  const lines = LINES[form];
  if (!lines) return null;
  const seed = [...local.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return `${lines[seed % lines.length]} ${local.indoor ? `Welcome to ${local.anchorName}.` : 'Welcome to the neighborhood.'}`;
}

// A passing nod never owns a resident's route, body heading or work routine.
// A familiar face must leave the area before they can acknowledge us again.
export function createVisitorReactions() {
  let previousForm = null, activeId = null, activeUntil = 0, lastStarted = -Infinity;
  const seen = new Map();
  const reset = () => { seen.clear();previousForm = activeId = null;activeUntil = 0;lastStarted = -Infinity; };
  return {
    update(locals, pose, form, now, canSee = () => true) {
      if (form !== previousForm) { reset();previousForm = form; }
      const nearby = [];
      for (const local of locals) {
        delete local.visitorReaction;
        if (!pose || !formFor(form)) continue;
        const distance = Math.hypot(local.position[0] - pose.position[0], -local.position[1] - pose.position[2]);
        const sameRoom = (local.storeId ?? null) === pose.roomId, timing = seen.get(local.id);
        if (timing && (!sameRoom || distance > 10)) timing.left = true;
        if (!sameRoom || local.indoor || local.abducted || local.life?.visitId || local.life?.status === 'chatting' || local.life?.action === 'seek_shelter') continue;
        if (distance > 4 || Math.abs(local.position[2] - pose.ground - (pose.altitude ?? 0)) > 2 || !canSee(local.position)) continue;
        nearby.push({ local, distance });
      }
      let local = now < activeUntil ? nearby.find(entry => entry.local.id === activeId)?.local : null;
      if (!local) {
        activeId = null;
        if (now - lastStarted < 12000) return [];
        local = nearby.sort((a, b) => a.distance - b.distance).find(({ local }) => {
          const timing = seen.get(local.id);
          return !timing || timing.left && now - timing.started >= 90000;
        })?.local;
        if (!local) return [];
        seen.set(local.id, { started: now, left: false });
        activeId = local.id;activeUntil = now + 900;lastStarted = now;
      }
      local.visitorReaction = { form, action: 'acknowledge', passive: true };
      return [local];
    },
    reset,
  };
}
