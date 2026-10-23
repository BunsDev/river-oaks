import { MAX_CLOCK_RATE, clockMinute, dangerZoneIds, riskAt, validateWorldPolicy, zonesFor } from './world-policy.js';

// World rules in the town panel (#596). Everyone sees the shared world time, the risk where
// they stand and why the rules changed. Jevica's accounts also get the controls; the town
// refuses anyone else, whatever this page shows. The local sun slider is never read here.

const element = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
const pad = value => String(value).padStart(2, '0');
export const formatMinute = minute => `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
export const parseTime = value => {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? '');
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
};
const RATES = [[0, 'Paused'], [1, 'Real time'], [10, '10× faster'], [60, '60× faster']].filter(([rate]) => rate <= MAX_CLOCK_RATE);
const zoneNames = (worldId, ids) => ids.map(id => zonesFor(worldId).find(zone => zone.id === id)?.name ?? id);
const list = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** One sentence for the current rules, as players read them. */
export function describePolicy(policy, worldId) {
  const { mode, schedule, zones, pvp } = policy.violence;
  if (mode === 'off' || !zones.length) return 'The town is peaceful everywhere.';
  const where = list(zoneNames(worldId, zones));
  const when = mode === 'forced' ? 'at all hours' : `from ${formatMinute(schedule.start)} to ${formatMinute(schedule.end)}`;
  return `Danger is on in ${where} ${when}${pvp ? ', including between players' : ''}. Everywhere else stays safe.`;
}

/** Why the rules just changed, announced once per revision. */
export function describeChange(policy, worldId) {
  if (policy.lastChange.kind === 'emergency_off') return 'Jevica turned danger off everywhere. The town is peaceful.';
  return `Jevica changed the world rules. ${describePolicy(policy, worldId)}`;
}

/** What the player is told about where they stand. */
export function describeRisk(risk, policy) {
  const { schedule } = policy.violence;
  if (risk.level === 'safe') return `Safe here${risk.zone.name ? ` (${risk.zone.name})` : ''}.`;
  if (risk.level === 'danger') return `Danger zone: ${risk.zone.name}${policy.violence.mode === 'scheduled' ? ` until ${formatMinute(schedule.end)}` : ''}. Head to a safe place to stay out of trouble.`;
  if (risk.level === 'danger_later') return `${risk.zone.name} becomes dangerous at ${formatMinute(schedule.start)}.`;
  return 'Peaceful here.';
}

const publicRules = value => {
  if (!value || typeof value !== 'object') return null;
  const { minute, active, ...rules } = value;
  return rules;
};

export function createWorldPolicyUI({ panel, getTown, getEnvironment = () => null, command }) {
  const section = element('section', null, 'multiplayer-world-rules');
  section.setAttribute('aria-labelledby', 'world-rules-title');
  const heading = element('h3', 'World rules'); heading.id = 'world-rules-title';
  const clock = element('p', null, 'world-rules-clock');
  const risk = element('p', null, 'world-rules-risk'); risk.setAttribute('role', 'status');
  const summary = element('p', null, 'world-rules-summary');
  // Changes are announced once, politely; the risk line updates quietly as players walk.
  const change = element('p', null, 'world-rules-change'); change.setAttribute('role', 'status'); change.setAttribute('aria-live', 'polite');
  risk.setAttribute('aria-live', 'off');
  section.append(heading, clock, risk, summary, change);

  // Owner controls. Built once, shown only to an account the town says may use them.
  const owner = element('form', null, 'world-rules-owner'); owner.hidden = true; owner.noValidate = true;
  const off = element('button', 'Emergency off: stop all danger now', 'world-rules-emergency'); off.type = 'button';
  off.setAttribute('aria-describedby', 'world-rules-emergency-help');
  const offHelp = element('p', 'Takes effect at once, before any further attack. Zones and hours stay saved for later.'); offHelp.id = 'world-rules-emergency-help';
  const modeSet = element('fieldset'); modeSet.append(element('legend', 'Danger'));
  const modes = [['off', 'Off (peaceful)'], ['scheduled', 'On a schedule'], ['forced', 'At all hours']].map(([value, text]) => {
    const label = element('label'), input = element('input'); input.type = 'radio'; input.name = 'world-rules-mode'; input.value = value;
    label.append(input, ` ${text}`); modeSet.append(label); return input;
  });
  const timeField = (text, id) => { const label = element('label', text), input = element('input'); input.type = 'time'; input.step = 60; input.id = id; input.required = true; label.htmlFor = id; return [label, input]; };
  const [startLabel, start] = timeField('Starts', 'world-rules-start'), [endLabel, end] = timeField('Ends', 'world-rules-end');
  const hours = element('fieldset'); hours.append(element('legend', 'Danger hours (may cross midnight)'), startLabel, start, endLabel, end);
  const zoneSet = element('fieldset'); zoneSet.append(element('legend', 'Danger zones'));
  let zoneInputs = [];
  const pvpLabel = element('label'), pvp = element('input'); pvp.type = 'checkbox'; pvpLabel.append(pvp, ' Players may harm other players');
  const [clockLabel, clockTime] = timeField('World time', 'world-rules-time');
  const rateLabel = element('label', 'Clock speed'), rate = element('select'); rate.id = 'world-rules-rate'; rateLabel.htmlFor = rate.id;
  for (const [value, text] of RATES) { const option = element('option', text); option.value = String(value); rate.append(option); }
  const clockSet = element('fieldset'); clockSet.append(element('legend', 'Shared clock'), clockLabel, clockTime, rateLabel, rate);
  const apply = element('button', 'Apply rules'); apply.type = 'submit';
  const result = element('p', null, 'world-rules-result'); result.setAttribute('role', 'status');
  owner.append(off, offHelp, modeSet, hours, zoneSet, pvpLabel, clockSet, apply, result);
  section.append(owner);
  const gestures = panel.querySelector('.multiplayer-gestures');
  if (gestures) gestures.after(section); else panel.append(section);

  let shown = null, worldId = null, editedFrom = null, dirty = false, busy = false;
  const fill = (rules, id) => {
    if (worldId !== id) {
      worldId = id;
      zoneSet.querySelectorAll('label').forEach(label => label.remove());
      zoneInputs = dangerZoneIds(id).map(zoneId => {
        const label = element('label'), input = element('input'); input.type = 'checkbox'; input.value = zoneId;
        label.append(input, ` ${zoneNames(id, [zoneId])[0]}`); zoneSet.append(label); return input;
      });
      if (!zoneInputs.length) zoneSet.append(element('label', 'This world has no danger zones.'));
    }
    for (const input of modes) input.checked = input.value === rules.violence.mode;
    start.value = formatMinute(rules.violence.schedule.start); end.value = formatMinute(rules.violence.schedule.end);
    for (const input of zoneInputs) input.checked = rules.violence.zones.includes(input.value);
    pvp.checked = rules.violence.pvp;
    clockTime.value = formatMinute(clockMinute(rules.clock));
    rate.value = String(rules.clock.rate);
    if (![...rate.options].some(option => option.value === rate.value)) { const option = element('option', `${rules.clock.rate}× faster`); option.value = String(rules.clock.rate); rate.append(option); rate.value = option.value; }
    editedFrom = rules.revision; dirty = false;
  };
  owner.addEventListener('input', () => { dirty = true; });
  const send = async (message, done) => {
    if (busy) return;
    busy = true; apply.disabled = off.disabled = true; result.textContent = 'Saving…';
    try {
      const reply = await command(message);
      if (reply.ok) { dirty = false; result.textContent = done; }
      else if (reply.error === 'world_policy_conflict') { dirty = false; editedFrom = null; result.textContent = `${reply.message} The form now shows the current rules.`; }
      else result.textContent = reply.message ?? 'The world rules could not be changed.';
    } catch (error) { result.textContent = error.message; }
    finally { busy = false; apply.disabled = off.disabled = false; }
  };
  off.addEventListener('click', () => send({ type: 'worldPolicy', action: 'emergencyOff' }, 'Danger is off everywhere.'));
  owner.addEventListener('submit', event => {
    event.preventDefault();
    const startMinute = parseTime(start.value), endMinute = parseTime(end.value), minute = parseTime(clockTime.value);
    const mode = modes.find(input => input.checked)?.value;
    if (startMinute === null || endMinute === null || minute === null || !mode) { result.textContent = 'Enter each time as hours and minutes.'; return; }
    if (mode === 'scheduled' && startMinute === endMinute) { result.textContent = 'Danger hours need different start and end times.'; return; }
    const changes = { violence: { mode, schedule: { start: startMinute, end: endMinute }, zones: zoneInputs.filter(input => input.checked).map(input => input.value), pvp: pvp.checked } };
    // The clock is sent only when changed, so applying other rules never rewinds shared time.
    const current = shown && clockMinute(shown.clock);
    if (minute !== current || Number(rate.value) !== shown?.clock.rate) changes.clock = { minute, rate: Number(rate.value) };
    send({ type: 'worldPolicy', action: 'update', expectedRevision: editedFrom, changes }, 'World rules saved.');
  });

  return {
    sync(snapshot) {
      const town = getTown();
      const rules = validateWorldPolicy(publicRules(snapshot?.worldPolicy), snapshot?.worldId ?? 'river-oaks');
      section.hidden = !rules;
      if (!rules) { shown = null; return; }
      const id = snapshot.worldId ?? 'river-oaks';
      const self = snapshot.players.find(player => player.id === town.selfId);
      clock.textContent = `World time ${formatMinute(clockMinute(rules.clock))}`;
      // The town's record of where this player stands, never the local light or a guess.
      if (self) {
        const [east, north] = self.position;
        const room = self.levelId === null ? getEnvironment()?.roomAt?.(east, -north) : null;
        risk.textContent = describeRisk(riskAt(id, rules, { position: self.position, levelId: self.levelId ?? null, indoors: Boolean(room || self.office) }), rules);
      }
      summary.textContent = describePolicy(rules, id);
      if (shown && rules.revision !== shown.revision) change.textContent = describeChange(rules, id);
      shown = rules;
      owner.hidden = !self?.canSetWorldPolicy;
      if (!owner.hidden && !busy && (!dirty || editedFrom === null)) fill(rules, id);
    },
    dispose() { section.remove(); },
  };
}
