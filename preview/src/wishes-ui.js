import { WISHES, wishFor } from './wishes.js';
import './wishes.css';

const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const write = (element, value) => { if (element.textContent !== value) element.textContent = value; };
export function createWishPanel({ onGrant, onUndo, onSelect }) {
  let busy = false, latest = null, actionMessage = '', pendingFocus = null;
  const card = node('section', null, 'community-dialogue-card wish-card');
  card.setAttribute('aria-labelledby', 'wish-heading');
  const heading = node('h3', 'A wish from Jevica', 'community-card-heading'); heading.id = 'wish-heading';
  const intro = node('p', 'Give this neighbor a little magic. Every gift has a catch.');
  const label = node('label', 'Choose a wish'); label.htmlFor = 'wish-choice';
  const choice = node('select', null, 'community-select'); choice.id = 'wish-choice';
  for (const wish of WISHES) { const option = node('option', wish.title); option.value = wish.id; choice.append(option); }
  const grant = node('button', 'Grant wish', 'community-primary'); grant.id = 'wish-grant'; grant.type = 'button';
  const status = node('p', null, 'wish-status'); status.id = 'wish-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const undo = node('button', 'Undo wish'); undo.id = 'wish-undo'; undo.type = 'button';
  const actions = node('div', null, 'wish-actions'); actions.append(grant, undo);
  card.append(heading, intro, label, choice, status, actions);
  const run = async (action, target) => {
    if (busy || !latest?.local) return;
    const id = latest.local.id;
    busy = true; actionMessage = ''; pendingFocus = null; render();
    try {
      const result = await action();
      if (latest?.local?.id === id) {
        if (result?.ok) pendingFocus = { id, target };
        else actionMessage = result?.message || 'The wish could not be confirmed. Please try again.';
      }
    } catch (error) {
      if (latest?.local?.id === id) actionMessage = error.message || 'The wish could not be confirmed. Please try again.';
    } finally { busy = false; render(); }
  };
  grant.addEventListener('click', () => run(() => onGrant(choice.value), undo));
  undo.addEventListener('click', () => run(onUndo, choice));

  const journal = node('section', null, 'wish-journal'); journal.setAttribute('aria-labelledby', 'wish-journal-heading');
  const title = node('h3', 'Wishes & consequences'); title.id = 'wish-journal-heading';
  const summary = node('p'); summary.id = 'wish-town-status'; summary.setAttribute('role', 'status');
  const list = node('div', null, 'wish-incidents');
  const empty = node('p', 'Meet a neighbor to grant your first wish.', 'quiet-note');
  journal.append(title, summary, empty, list);
  const rows = new Map();
  const render = () => {
      if (!latest) return;
      const {state,local,caster} = latest;
      const wish = local?.wish, definition = wish && wishFor(wish.kind);
      card.hidden = !local;
      card.setAttribute('aria-busy', String(busy));
      choice.disabled = grant.disabled = busy || Boolean(wish) || caster !== 'jevica' || Boolean(local?.abducted) || Boolean(local?.force);
      undo.hidden = !wish; undo.disabled = busy || caster !== 'jevica';
      write(status, busy ? 'Waiting for the wish to be confirmed…' : actionMessage || (local?.force?'Lower this person before granting a wish.':wish ? `${definition.title} · ${wish.phase === 'gift' ? 'Granted' : wish.phase === 'trouble' ? 'The catch' : 'Please undo it'}\n“${wish.message}”` : 'One wish at a time. You can undo it whenever you like.'));
      card.dataset.phase = wish?.phase ?? 'ready'; card.dataset.kind = wish?.kind ?? '';
      const active = state.locals.filter(person => person.wish);
      journal.dataset.trouble = String(state.wishes.trouble);
      write(summary, `${active.length} active wishes · ${state.wishes.trouble} town problems · ${state.wishes.affected} neighbors disrupted · ${state.wishes.resolved} undone`);
      empty.hidden = active.length > 0;
      for (const [id, row] of rows) if (!active.some(person => person.id === id)) { row.remove(); rows.delete(id); }
      for (const person of active) {
        let row = rows.get(person.id);
        if (!row) {
          row = node('button'); row.type = 'button'; row.dataset.localId = person.id;
          row.addEventListener('click', async () => {
            row.disabled = true;
            try { await onSelect(person.id); }
            catch(error) {write(summary, error.message || 'This neighbor could not be reached.');}
            finally {row.disabled = Boolean(person.abducted);}
          });
          rows.set(person.id, row); list.append(row);
        }
        const definition = wishFor(person.wish.kind);
        write(row, `${person.name} · ${person.wish.phase === 'gift' ? definition.title : definition.issue}${person.wish.phase === 'pleading' ? ' · Asking for help' : ''}`);
        row.disabled = Boolean(person.abducted);
      }
      if (!busy && pendingFocus && pendingFocus.id === local?.id && !pendingFocus.target.disabled && !pendingFocus.target.hidden && !card.closest('[hidden]')) {
        pendingFocus.target.focus({preventScroll:true}); pendingFocus = null;
      }
  };
  return {
    card, journal,
    update(state, local, caster) {
      if (latest?.local?.id !== local?.id) {actionMessage = '';pendingFocus = null;}
      latest = {state,local,caster};
      render();
    },
  };
}
