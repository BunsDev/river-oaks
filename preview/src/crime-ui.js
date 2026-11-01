import { throwSounds } from './throw-sounds.js';
import { customizedCharacterDefinition } from './character-customization.js';
import { riskAt, validateWorldPolicy } from './world-policy.js';
import { describeRisk } from './world-policy-ui.js';

// The first criminal action's HUD (#597). It shows only what the town said: a rival's health,
// the player's wanted stars, the risk where they stand, and a hit after the town confirms it.
// Nothing here predicts damage. Near a rival in an active danger zone it offers a shove (T or
// the button); elsewhere it says plainly that nobody can be harmed. Since #640 a strike is timed:
// the reply only admits a windup, and the outcome is read from the snapshot's actions. A rival's
// telegraphed counter is announced in text, with an evade (U or the button).

import { combatFocusFor, combatStateFor } from './combat-motion.js';

export const ATTACK_KEY = 'KeyT';
export const EVADE_KEY = 'KeyU';
export const MAX_STARS = 5;
const NEAR = 6, REACH = 1.6;
const node = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
const typing = el => Boolean(el?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]'));

export const starsText = stars => `${'★'.repeat(stars)}${'☆'.repeat(MAX_STARS - stars)}`;
export const starsLabel = stars => `Wanted level: ${stars} of ${MAX_STARS} stars`;
export const starsOf = (crime, userId) => crime?.wanted?.find(([id]) => id === userId)?.[1] ?? 0;

/** Rivals as figures for the remote-player renderer: a stagger when hit, winded while down. */
export const rivalFigures = crime => (crime?.targets ?? []).map(rival => ({
  id: rival.id, name: rival.incapacitated ? `${rival.name} · down` : rival.name, appearance: rival.appearance,
  position: rival.position, yaw: rival.yaw, altitude: 0, vehicle: null, sitting: null, movement: 'upright', performing: false,
  interaction: null, gesture: rival.incapacitated ? 'down' : rival.staggered ? 'stagger' : null,
}));

/** Existing human rig and authored midnight palette, never a new asset download. */
export const policeFigures = police => (police?.units ?? []).map(unit => ({
  id: unit.id, name: `Police · ${unit.state}`, appearance: 'sable-human',
  character: customizedCharacterDefinition(unit.id,'sable-human',{palette:'midnight',revision:1}),
  // The director stores body heading; peer rendering adds pi to camera-style yaw.
  position: unit.position, yaw: unit.yaw - Math.PI, altitude: 0, vehicle: null, sitting: null,
  movement: 'upright', performing: false, interaction: null, gesture: null,
}));
export function policeStatus(police, userId) {
  const assigned = police?.units?.filter(unit => unit.targetId === userId) ?? [];
  if (assigned.some(unit => unit.state === 'arrest')) return 'Arrest in progress. You will return safely to the arrival point.';
  if (police?.subdued?.includes(userId)) return 'An officer has hold of you. Arrest in progress.';
  if (assigned.some(unit => unit.state === 'grab')) return 'An officer is reaching to grab you. Evade with U, step away or surrender.';
  if (police?.surrendered?.includes(userId)) return 'You have surrendered. Stay still while an officer approaches.';
  if (assigned.some(unit => unit.state === 'pursue')) return 'Police are approaching. Surrender to return safely to the arrival point.';
  if (assigned.some(unit => unit.state === 'search')) return 'Police are searching your last seen location.';
  return '';
}

/** The nearest rival within a few metres of the town's record of this player, and whether it is in reach. */
export function nearestRival(self, crime) {
  if (!self || !Array.isArray(self.position)) return null;
  let best = null;
  for (const rival of crime?.targets ?? []) {
    const distance = Math.hypot(rival.position[0] - self.position[0], rival.position[1] - self.position[1]);
    if (distance <= NEAR && (!best || distance < best.distance)) best = { rival, distance, inReach: distance <= REACH };
  }
  return best;
}

/** One sentence for a confirmed hit, from the town's reply only. */
export function describeHit(hit, rivalName) {
  const outcome = hit.incapacitated ? `${rivalName} is down.` : `${rivalName} has ${hit.health} health left.`;
  return `Hit landed. ${outcome} Wanted level ${hit.stars} of ${MAX_STARS}.`;
}

const MISSES = { attack_out_of_reach: name => `Missed. ${name} was out of reach.`, attack_out_of_arc: name => `Missed. ${name} moved out of the swing.`,
  target_incapacitated: name => `Missed. ${name} is already down.`, staggered: () => 'Missed. You were knocked off balance.', attack_on_foot: () => 'Missed. Stand on the street to strike.' };
const STOPPED = { violence_off: 'The town is peaceful right now.', policy_changed: 'The world rules changed.', safe_zone: 'This is a safe place. Nobody can be harmed here.',
  not_danger_zone: 'You left the danger zone.', zone_disabled: 'This zone is peaceful right now.', outside_hours: 'Trouble here has stopped for now.', zone_boundary: 'You are in different places now.' };
/** One sentence for a timed action that involves this player, from the town's snapshot only. */
export function describeAction(action, rivalName, selfId) {
  if (action.kind === 'strike' && action.actorId === selfId) {
    if (action.outcome === null) return 'Winding up…';
    if (action.outcome === 'hit') return describeHit(action.effect, rivalName);
    if (action.outcome === 'miss') return MISSES[action.reason]?.(rivalName) ?? 'Missed.';
    return action.outcome === 'cancelled' && STOPPED[action.reason] ? `Stopped. ${STOPPED[action.reason]}` : action.outcome === 'cancelled' ? '' : 'Missed.';
  }
  if (action.kind === 'counter' && action.targetId === selfId) {
    if (action.outcome === null) return `${rivalName} is winding up to strike back. Evade with U.`;
    if (action.outcome === 'evaded') return `You evaded ${rivalName}.`;
    if (action.outcome === 'miss') return `${rivalName} missed you.`;
    if (action.outcome === 'hit') return action.effect.down ? `${rivalName} knocked you down. You will get back up shortly.` : `${rivalName} hit you. ${action.effect.health} health left.`;
    if (action.outcome === 'cancelled') return `${rivalName} backed off.`;
  }
  return '';
}
const actionNumber = action => Number(String(action.id).split(':')[1]) || 0;

const attackId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);

export function createCrimeUI({ host, getTown, getEnvironment = () => null, request, getSounds = throwSounds, keys = globalThis.window }) {
  const hud = node('section', null, 'crime-hud'); hud.setAttribute('aria-label', 'Danger and wanted level'); hud.hidden = true;
  const wanted = node('p', null, 'crime-wanted'); wanted.setAttribute('role', 'img');
  const card = node('div', null, 'crime-rival');
  const name = node('strong'), meter = node('div', null, 'crime-health'), fill = node('span');
  meter.setAttribute('role', 'progressbar'); meter.setAttribute('aria-valuemin', '0'); meter.append(fill);
  const state = node('p', null, 'crime-state');
  const risk = node('p', null, 'crime-risk');
  const shove = node('button', null, 'crime-attack'); shove.type = 'button';
  const shoveLabel = node('span'), shoveKey = node('kbd', 'T'); shove.append(shoveLabel, shoveKey);
  const result = node('p', null, 'crime-result'); result.setAttribute('role', 'status'); result.setAttribute('aria-live', 'polite');
  card.append(name, meter, state, risk, shove);
  const policeState = node('p', null, 'crime-police-state'); policeState.setAttribute('role','status');
  const surrender = node('button', 'Surrender', 'crime-surrender'); surrender.type = 'button';
  // Styled as the shove (multiplayer.css .crime-attack); crime-evade names it.
  const evadeButton = node('button', null, 'crime-attack crime-evade'); evadeButton.type = 'button';
  evadeButton.append(node('span', 'Evade'), node('kbd', 'U')); evadeButton.hidden = true;
  hud.append(wanted, policeState, surrender, evadeButton, card, result);
  host?.append(hud);
  let busy = false, target = null, disposed = false, lastPaint = -Infinity, wasHeld = false, surrenderCue = null, evading = false, syncedAt = -Infinity, myEvade = null;
  // Announce each action event once. When several change at once, say the one that matters most
  // to this player: a counter that lands, then a counter coming, then their own strike.
  const heard = new Set();
  const weight = action => action.kind === 'counter' ? (action.outcome === 'hit' ? 4 : action.outcome === null ? 3 : 2) : 1;
  const announce = (actions, nameOf) => {
    const fresh = actions.filter(action => !heard.has(`${action.id}:${action.outcome ?? 'pending'}`));
    for (const action of fresh) heard.add(`${action.id}:${action.outcome ?? 'pending'}`);
    if (heard.size > 64) for (const key of [...heard].slice(0, heard.size - 64)) heard.delete(key);
    const pick = fresh.sort((a, b) => weight(b) - weight(a) || actionNumber(b) - actionNumber(a))[0];
    const line = pick && describeAction(pick, nameOf(pick), getTown().selfId);
    if (line) setText(result, line);
  };

  async function attack() {
    if (busy || !target || shove.hidden || disposed) return;
    busy = true; paint(); setText(result, '');
    const message = { type: 'attack', targetId: target.id, attackKind: 'melee', attackId: attackId() };
    const name = target.name;
    try {
      let reply;
      // A lost reply is retried once with the same ID: the town lands it at most once.
      try { reply = await request(message); } catch { reply = await request(message); }
      if (disposed) return;
      // The reply admits a windup; the hit, if any, comes from the snapshot at contact.
      if (reply.ok && reply.action) announce([reply.action], () => name);
      else setText(result, reply.ok ? describeHit(reply.hit, name) : reply.message ?? 'That did not land.');
    } catch (error) { if (!disposed) setText(result, error.message); }
    finally { busy = false; if (!disposed) paint(); }
  }
  shove.addEventListener('click', () => void attack());
  async function evade() {
    if (evading || evadeButton.hidden || evadeButton.disabled || disposed) return;
    evading = true; paint();
    const message = { type: 'evade', evadeId: attackId() };
    try {
      let reply;
      try { reply = await request(message); } catch { reply = await request(message); }
      // The town admitted the evade: the figure leans away for the window it granted (#640 increment 4).
      if (!disposed && reply.ok && reply.evade) myEvade = { id: message.evadeId, at: performance.now(), remainingMs: reply.evade.remainingMs ?? 0, direction: reply.evade.direction ?? 'back' };
      if (!disposed && !reply.ok) setText(result, reply.message ?? 'Could not evade.');
    } catch (error) { if (!disposed) setText(result, error.message); }
    finally { evading = false; if (!disposed) paint(); }
  }
  evadeButton.addEventListener('click', () => void evade());
  surrender.addEventListener('click', async () => {
    if (busy || disposed) return;
    const town = getTown(), offered = town.snapshot?.police?.surrendered?.includes(town.selfId);
    const userId = town.selfId, revision = town.snapshot?.revision;
    const sounds = getSounds(); sounds.unlock();
    busy = true; paint();
    try {
      const reply = await request({ type:'surrender', action:offered?'resume':'offer' });
      const current = getTown(), police = current.snapshot?.police;
      if(disposed || current.selfId!==userId || current.connected===false)return;
      const held = Boolean(police?.surrendered?.includes(userId) || police?.subdued?.includes(userId) || police?.units?.some(unit=>unit.targetId===userId && unit.state==='arrest'));
      if(reply.ok && Number.isFinite(revision) && current.snapshot?.revision>revision && held!==reply.surrendered)return;
      if (reply.ok) { surrenderCue?.stop(); surrenderCue = sounds.play('tap'); }
      if (!disposed) setText(result, reply.ok ? (reply.surrendered ? 'Surrender accepted. Stay still.' : 'You may move again.') : reply.message ?? 'Surrender unavailable.');
    } catch (error) { if (!disposed) setText(result,error.message); }
    finally { busy = false; if (!disposed) paint(); }
  });
  const onKey = event => {
    if (![ATTACK_KEY, EVADE_KEY].includes(event.code) || event.repeat || event.metaKey || event.ctrlKey || event.altKey || disposed) return;
    const button = event.code === ATTACK_KEY ? shove : evadeButton;
    if (typing(event.target) || hud.hidden || button.hidden || button.disabled) return;
    event.preventDefault(); event.stopImmediatePropagation(); void (event.code === ATTACK_KEY ? attack() : evade());
  };
  keys?.addEventListener('keydown', onKey, true);

  // #640 increment 4: the local figure (player-avatar.js) reads these and poses itself; nothing here
  // moves a bone. The state is the town's, played forward by the snapshot's age; a telegraph names
  // what is coming so the evade can be cued.
  function publishCombat(town, snapshot, self, crime, police) {
    const now = performance.now(), ageMs = Number.isFinite(syncedAt) ? Math.max(0, now - syncedAt) : 0;
    const left = myEvade ? myEvade.remainingMs - (now - myEvade.at) : 0;
    const evade = left > 0 ? { id: myEvade.id, direction: myEvade.direction, remainingMs: left } : undefined;
    const state = self && town.connected !== false ? combatStateFor(town.selfId, { crime, police, players: snapshot?.players, evade, ageMs }) : null;
    const focus = state ? combatFocusFor(town.selfId, { crime, police }) : null;
    const telegraph = !state ? null : (crime?.actions ?? []).some(action => action.kind === 'counter' && action.targetId === town.selfId && action.outcome === null && action.phase === 'windup') ? 'counter'
      : police?.units?.some(unit => unit.targetId === town.selfId && unit.state === 'grab') ? 'grab' : null;
    const data = hud.dataset;
    if (!data) return;
    if (state?.kind) data.combatState = JSON.stringify(state); else delete data.combatState;
    if (focus) data.combatFocus = JSON.stringify(focus); else delete data.combatFocus;
    if (telegraph) data.telegraph = telegraph; else delete data.telegraph;
  }
  function paint() {
    const town = getTown(), snapshot = town.snapshot, crime = snapshot?.crime;
    const self = snapshot?.players?.find(player => player.id === town.selfId);
    const stars = starsOf(crime, town.selfId), near = nearestRival(self, crime);
    const police = snapshot?.police, offered = police?.surrendered?.includes(town.selfId);
    // Held by police: an arrest under way, or a grab that landed (#640).
    const arresting = police?.units?.some(unit => unit.targetId === town.selfId && unit.state === 'arrest') || Boolean(police?.subdued?.includes(town.selfId));
    if(wasHeld && !offered && !arresting)setText(result,stars?'Surrender ended. You may move again.':'You are no longer wanted. You may move again.');
    wasHeld = Boolean(offered || arresting);
    setText(policeState,policeStatus(police,town.selfId)); policeState.hidden = !policeState.textContent;
    surrender.hidden = !self || town.connected===false || !stars || (!offered && !police?.eligible?.includes(town.selfId));
    surrender.disabled = busy || arresting;
    setText(surrender,offered?'Resume moving':'Surrender');
    if(document.activeElement===surrender && (surrender.hidden || arresting)){result.tabIndex=-1;result.focus({preventScroll:true});}
    const worldId = snapshot?.worldId ?? 'river-oaks';
    const policy = snapshot?.worldPolicy ? (({ minute, active, ...rules }) => validateWorldPolicy(rules, worldId))(snapshot.worldPolicy) : null;
    const place = self ? { position: self.position, levelId: self.levelId ?? null, indoors: Boolean(self.levelId === null && getEnvironment()?.roomAt?.(self.position[0], -self.position[1])) } : null;
    const level = policy && place ? riskAt(worldId, policy, place).level : 'peaceful';
    // The newest timed action involving this player (#640): its outcome comes from the town.
    const involved = (crime?.actions ?? []).filter(action => action.actorId === town.selfId || action.targetId === town.selfId);
    const mine = involved.reduce((newest, action) => !newest || actionNumber(action) > actionNumber(newest) ? action : newest, null);
    if (involved.length) announce(involved, action => crime.targets?.find(item => item.id === (action.kind === 'strike' ? action.targetId : action.actorId))?.name ?? 'The rival');
    evadeButton.hidden = !self || town.connected === false || level !== 'danger' || !stars && !mine;
    evadeButton.disabled = evading || offered || arresting;
    publishCombat(town, snapshot, self, crime, police);
    hud.hidden = !self || (!stars && !near && !result.textContent);
    wanted.hidden = !stars;
    setText(wanted, starsText(stars)); wanted.setAttribute('aria-label', starsLabel(stars));
    card.hidden = !near;
    target = near?.rival ?? null;
    if (!near) return;
    const rival = near.rival;
    setText(name, rival.name);
    meter.setAttribute('aria-label', `${rival.name} health`); meter.setAttribute('aria-valuemax', String(rival.maxHealth));
    meter.setAttribute('aria-valuenow', String(rival.health)); meter.setAttribute('aria-valuetext', `${rival.health} of ${rival.maxHealth}`);
    fill.style.width = `${Math.round(rival.health / rival.maxHealth * 100)}%`;
    setText(state, rival.incapacitated ? 'Down and winded. They will get back up soon.' : `${rival.health} of ${rival.maxHealth} health`);
    // Only offer a shove where it could land; otherwise say why not.
    setText(risk, level === 'danger' ? (near.inReach ? 'Danger zone. You are within reach.' : 'Danger zone. Step closer to reach them.')
      : policy ? describeRisk(riskAt(worldId, policy, place), policy).replace('Peaceful here.', 'Peaceful here. Nobody can be harmed.') : 'Peaceful here. Nobody can be harmed.');
    shove.hidden = level !== 'danger' || rival.incapacitated;
    shove.disabled = busy || !near.inReach || offered || arresting;
    setText(shoveLabel, `Shove ${rival.name}`);
  }
  return {
    update(now) { if (disposed || now - lastPaint < 150) return; lastPaint = now; paint(); },
    sync() { if (disposed) return; syncedAt = performance.now(); paint(); },
    dispose() { disposed = true; surrenderCue?.stop(); keys?.removeEventListener('keydown', onKey, true); hud.remove(); },
  };
}
