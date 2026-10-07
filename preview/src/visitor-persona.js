// Jevica is the spell persona; account appearances choose the visual character.
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
