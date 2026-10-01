// Authored fairy-tale rules, independent of the optional reaction service and
// community support clock. Times are seconds spent in the visible game.
export const WISHES = Object.freeze([
  { id: 'dragon', title: 'An extraordinary pet', gift: 'A warm, golden egg! I promise to take good care of it.', twist: 'It hatched into a dragon! It is scorching the pavement and stopping everyone on this street.', plea: 'Jevica, please take my dragon back before it roasts another shopping bag!', issue: 'Dragon loose · neighbors shelter from its sparks', twistAfter: 12, pleaAfter: 28, radius: 9 },
  { id: 'flight', title: 'The ability to fly', gift: 'I can fly! The whole town is beneath my feet!', twist: 'Up is wonderful. How do I go down? Everyone has stopped to try to catch me!', plea: 'Jevica! I cannot land. Please remove this power and bring me down!', issue: 'Landing rescue · neighbors gather below', twistAfter: 9, pleaAfter: 23, radius: 7 },
  { id: 'invisibility', title: 'Become invisible', gift: 'Nobody can see me now. At last, a little privacy!', twist: 'My clothes are still visible! A walking outfit is frightening the shoppers.', plea: 'Jevica, please make me visible again. These floating clothes are causing a scene!', issue: 'Floating clothes · startled shoppers stop', twistAfter: 8, pleaAfter: 22, radius: 6 },
  { id: 'mind-reading', title: 'Read minds', gift: 'I can hear what everyone is thinking. No more guessing!', twist: 'Every thought I hear is unkind. Nobody seems to like me. I cannot face the neighbors.', plea: 'Jevica, please take this away. I am so sad. I would rather talk to people than hear their thoughts.', issue: 'Hurt feelings · neighbors stop to comfort them', twistAfter: 10, pleaAfter: 20, radius: 5 },
  { id: 'dog', title: 'Turn into a dog', gift: 'Four paws! A wagging tail! This is the best day of my life!', twist: 'Achoo! I forgot I am allergic to dogs. Now I am allergic to myself! My sneezing has stopped the whole sidewalk.', plea: 'Jevica, please turn me back. I cannot stop sneezing!', issue: 'Sneezing dog · foot traffic interrupted', twistAfter: 8, pleaAfter: 21, radius: 5 },
].map(Object.freeze));
// Shared by the rendered body and pedestrian-space checks.
export const wishLift = wish => wish?.kind === 'flight' ? Math.min(3, Math.max(0, wish.age * 0.9)) : 0;
export const wishFor = id => WISHES.find(wish => wish.id === id);
export const createWishState = () => ({ granted: 0, resolved: 0, trouble: 0, affected: 0, events: [] });
function record(state, local, message) {
  state.wishes.events.push({ localId: local.id, message: `${local.name}: ${message}` });
  state.wishes.events = state.wishes.events.slice(-12);
}
function refreshTrouble(state) {
  for (const local of state.locals) delete local.wishDisruption;
  const incidents = state.locals.filter(local => local.wish && local.wish.phase !== 'gift' && !local.abducted);
  for (const owner of incidents) {
    const definition = wishFor(owner.wish.kind);
    for (const local of state.locals) {
      if (local.abducted || (local.storeId ?? null) !== (owner.storeId ?? null)) continue;
      if (Math.hypot(local.position[0] - owner.position[0], local.position[1] - owner.position[1]) <= definition.radius) local.wishDisruption = definition.issue;
    }
  }
  state.wishes.trouble = incidents.length;
  state.wishes.affected = state.locals.filter(local => local.wishDisruption).length;
}
export const crewWishMessage = local => `${local.name} travels with Jevica. Wishes are for district residents.`;
export function grantWish(state, localId, kind, caster, casterName='Jevica') {
  const local = state?.locals.find(person => person.id === localId), definition = wishFor(kind);
  // The carriage crew travel with Jevica and have no wish visuals; wishes are for district residents.
  if (local?.vehicleRole) return { ok: false, message: crewWishMessage(local) };
  if (!state?.wishes || caster !== 'jevica' || !local || local.abducted || !definition || local.wish || local.force) return { ok: false, message: 'Choose a resident without an active wish or Force hold.' };
  local.wish = { kind, age: 0, phase: 'gift', message: definition.gift, ownerName:casterName };
  state.wishes.granted++;
  record(state, local, definition.gift);
  return { ok: true, message: definition.gift };
}
export function undoWish(state, localId, caster) {
  const local = state?.locals.find(person => person.id === localId);
  if (!state?.wishes || caster !== 'jevica' || !local?.wish) return { ok: false, message: 'There is no wish to undo.' };
  const ownerName=local.wish.ownerName??'Jevica';
  delete local.wish;
  state.wishes.resolved++;
  refreshTrouble(state);
  const message = `Thank you, ${ownerName}. I am myself again. Some wishes are better left as wishes.`;
  record(state, local, message);
  return { ok: true, message };
}
export function stepWishes(state, delta) {
  if (!state?.wishes || !Number.isFinite(delta) || delta <= 0) return;
  for (const local of state.locals) {
    const wish = local.wish;
    if (!wish || local.abducted) continue;
    const definition = wishFor(wish.kind);
    wish.age += delta;
    const phase = wish.age >= definition.pleaAfter ? 'pleading' : wish.age >= definition.twistAfter ? 'trouble' : 'gift';
    if (wish.phase !== phase) {
      wish.phase = phase;
      wish.message = phase === 'pleading' ? definition.plea.replace('Jevica',wish.ownerName??'Jevica') : definition.twist;
      record(state, local, wish.message);
    }
  }
  refreshTrouble(state);
}
