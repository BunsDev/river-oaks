// Playable forms: Baum's Oz travellers (public domain), the witch and Jevica.
// `avatar` indexes the shared resident rig each costume is built on.
export const VISITOR_FORMS = [
  { id: 'dorothy', label: 'Dorothy', role: 'The girl from Kansas', avatar: 0, reaction: 'enchanted', description: 'Blue-and-white gingham pinafore, braided hair, a wicker basket and silver shoes.' },
  { id: 'scarecrow', label: 'Scarecrow', role: 'The straw philosopher', avatar: 1, reaction: 'amazed', description: 'Patched burlap, straw at every cuff and a floppy pointed hat.' },
  { id: 'tinman', label: 'Tin Man', role: 'The tin woodman', avatar: 3, reaction: 'amazed', description: 'Riveted tin, jointed limbs, a funnel hat and an oil can within reach.' },
  { id: 'lion', label: 'Cowardly Lion', role: 'King of the forest, mostly', avatar: 5, reaction: 'startled', description: 'Tawny fur, a great mane tied with a red bow and a tufted tail.' },
  { id: 'witch', label: 'Wicked Witch', role: 'The midnight wanderer', avatar: 2, reaction: 'enchanted', description: 'A tall, angular silhouette in obsidian velvet, a sweeping cape and a crooked hat.' },
  { id: 'jevica', label: 'Jevica', role: 'The rose enchantress', avatar: 4, profile: 'jevica', reaction: 'amazed', description: 'Blonde hair, embroidered rose silk, sheer shoulder bows and a silver filigree crown.' },
];
export const formFor = id => VISITOR_FORMS.find(form => form.id === id) ?? null;
const LINES = {
  dorothy: ["Dorothy! Did the cyclone bring you all this way?", "Those silver shoes… you're a long way from Kansas.", "Is that little dog with you? Welcome, Dorothy!"],
  scarecrow: ["A scarecrow, walking and talking! Now I've seen everything.", "You had brains enough to find your way here, friend.", "Mind the pigeons, Scarecrow!"],
  tinman: ["Is that… tin? Do you need oil, friend?", "A Tin Man in River Oaks! Your heart must be in it.", "It looks like rain—shall I fetch the oil can?"],
  lion: ["A lion! Oh—oh, it's alright, he looks more frightened than me.", "Your Majesty of the forest, welcome to the district.", "That roar! …That was a roar, wasn't it?"],
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
