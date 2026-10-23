import { riskAt, validateWorldPolicy } from './world-policy.js';
import { describeRisk } from './world-policy-ui.js';

// The first criminal action's HUD (#597). It shows only what the town said: a rival's health,
// the player's wanted stars, the risk where they stand, and a hit after the town confirms it.
// Nothing here predicts damage. Near a rival in an active danger zone it offers a shove (T or
// the button); elsewhere it says plainly that nobody can be harmed.

export const ATTACK_KEY = 'KeyT';
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

const attackId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);

export function createCrimeUI({ host, getTown, getEnvironment = () => null, request, keys = globalThis.window }) {
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
  hud.append(wanted, card, result);
  host?.append(hud);
  let busy = false, target = null, disposed = false, lastPaint = -Infinity;

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
      setText(result, reply.ok ? describeHit(reply.hit, name) : reply.message ?? 'That did not land.');
    } catch (error) { if (!disposed) setText(result, error.message); }
    finally { busy = false; if (!disposed) paint(); }
  }
  shove.addEventListener('click', () => void attack());
  const onKey = event => {
    if (event.code !== ATTACK_KEY || event.repeat || event.metaKey || event.ctrlKey || event.altKey || disposed) return;
    if (typing(event.target) || hud.hidden || shove.hidden || shove.disabled) return;
    event.preventDefault(); event.stopImmediatePropagation(); void attack();
  };
  keys?.addEventListener('keydown', onKey, true);

  function paint() {
    const town = getTown(), snapshot = town.snapshot, crime = snapshot?.crime;
    const self = snapshot?.players?.find(player => player.id === town.selfId);
    const stars = starsOf(crime, town.selfId), near = nearestRival(self, crime);
    hud.hidden = !self || (!stars && !near && !result.textContent);
    wanted.hidden = !stars;
    setText(wanted, starsText(stars)); wanted.setAttribute('aria-label', starsLabel(stars));
    card.hidden = !near;
    target = near?.rival ?? null;
    if (!near) return;
    const rival = near.rival, worldId = snapshot.worldId ?? 'river-oaks';
    setText(name, rival.name);
    meter.setAttribute('aria-label', `${rival.name} health`); meter.setAttribute('aria-valuemax', String(rival.maxHealth));
    meter.setAttribute('aria-valuenow', String(rival.health)); meter.setAttribute('aria-valuetext', `${rival.health} of ${rival.maxHealth}`);
    fill.style.width = `${Math.round(rival.health / rival.maxHealth * 100)}%`;
    setText(state, rival.incapacitated ? 'Down and winded. They will get back up soon.' : `${rival.health} of ${rival.maxHealth} health`);
    const policy = snapshot.worldPolicy ? (({ minute, active, ...rules }) => validateWorldPolicy(rules, worldId))(snapshot.worldPolicy) : null;
    const place = { position: self.position, levelId: self.levelId ?? null, indoors: Boolean(self.levelId === null && getEnvironment()?.roomAt?.(self.position[0], -self.position[1])) };
    const level = policy ? riskAt(worldId, policy, place).level : 'peaceful';
    // Only offer a shove where it could land; otherwise say why not.
    setText(risk, level === 'danger' ? (near.inReach ? 'Danger zone. You are within reach.' : 'Danger zone. Step closer to reach them.')
      : policy ? describeRisk(riskAt(worldId, policy, place), policy).replace('Peaceful here.', 'Peaceful here. Nobody can be harmed.') : 'Peaceful here. Nobody can be harmed.');
    shove.hidden = level !== 'danger' || rival.incapacitated;
    shove.disabled = busy || !near.inReach;
    setText(shoveLabel, `Shove ${rival.name}`);
  }
  return {
    update(now) { if (disposed || now - lastPaint < 150) return; lastPaint = now; paint(); },
    sync() { if (!disposed) paint(); },
    dispose() { disposed = true; keys?.removeEventListener('keydown', onKey, true); hud.remove(); },
  };
}
