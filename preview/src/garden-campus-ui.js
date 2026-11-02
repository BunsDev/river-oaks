// The Gardens on the page (#510): a Play section to reach the campus, a suites-and-leases
// dialog over the server's owner-managed lease authority (#509), and "Use this desk" at a
// campus workstation, which opens the sitter's own private desk (the office desk dialog).
//
// Nothing here decides access: every list and action is a world command the server checks,
// and the desk opens only while the server says this player sits at a workstation. Leases
// never charge; the dialog shows the server's label and offers no payment step.
//
// Endings: the dialog lists the account's own recently ended leases and closed requests with
// the server's reason. The server keeps no record of a former guest, so the page reports
// guest access that vanished between two of its own lists. While the page holds suite access,
// a change in the town's leased suites lists again once, so someone walked out of a suite by
// an expiry or revocation is told why. A guest the tenant removes leaves the leased suites
// unchanged, so that page learns it at its next list. Everything here belongs to one account
// in one world: another sign-in on the page starts from nothing.
import { createOfficeDeskUI } from './office-desk-ui.js';
import { CAMPUS_OUTCOMES_SHOWN, campusDefaultTerm, campusDirectory, campusLostGuestAccess, campusReplayChange, createCampusCommands } from './garden-campus-model.js';
import './garden-campus.css';
import { isCampusLevelId, setCampusSuiteGate } from './garden-campus-levels.js';

const DAY = 86_400_000;
const el = (tag, text, className) => { const n = document.createElement(tag);if (text) n.textContent = text;if (className) n.className = className;return n; };
const STATES = { available: 'Available', leased: 'Leased', requested: 'You asked', offered: 'Offered to you', yours: 'Your suite', guest: 'You are a guest' };

export function createGardenCampusUI({ host, panelHost, getWorld, getMultiplayer, notify = () => {}, createDesk = createOfficeDeskUI }) {
  const lifetime = new AbortController(), signal = lifetime.signal, mp = () => getMultiplayer();
  const button = (text, fn, className) => { const b = el('button', text, className);b.type = 'button';b.addEventListener('click', fn, { signal });return b; };
  // Every suite row repeats the same actions, so each control's accessible name says which suite
  // it acts on; a screen reader's list of buttons then reads "Accept, Suite T2-201", not "Accept" ×3.
  const forSuite = (node, number, text = node.textContent) => { node.setAttribute('aria-label', /suite$/i.test(text) ? `${text} ${number}` : `${text}, Suite ${number}`);return node; };
  // Play section.
  const panel = el('section', null, 'office-panel campus-panel');panel.hidden = true;panel.id = 'campus-panel';
  const say = el('p');say.setAttribute('role', 'status');
  const lobby = button('Go to the Grove Offices hall', async () => {
    const result = await mp()?.travel({ storeId: 'campus:T1-F1-hall', mode: 'arrive' });
    say.textContent = result?.ok ? 'Grove Offices hall. Walk in through the east doors; the lift is at the back.' : result?.message ?? 'Join the town first.';
  });
  const open = button('Suites and leases', () => void openDialog());
  panel.append(el('h3', 'The Gardens offices'), el('p', 'Three towers with public skywalks at Floor 4, shared work halls and suites by owner-managed lease. No charge.'), lobby, open, say);
  panelHost.append(panel);
  // Dialog.
  const dialog = el('dialog', null, 'campus-dialog');dialog.id = 'campus-dialog';dialog.setAttribute('aria-labelledby', 'campus-title');
  const heading = el('h2', 'The Gardens · suites and leases');heading.id = 'campus-title';
  const label = el('p', null, 'campus-label'), status = el('p', null, 'campus-status');status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');
  const retry = button('Try again', () => void retryLast(), 'campus-secondary');retry.hidden = true;
  const body = el('div', null, 'campus-body'), close = button('Close', () => dialog.close(), 'campus-secondary');
  dialog.append(heading, label, status, retry, body, close);document.body.append(dialog);
  dialog.addEventListener('close', () => host.focus({ preventScroll: true }), { signal });

  let commands = null, worldId = null, last = null, serverNow = Date.now(), listedAt = Date.now(), busy = false, lastAnswer = null, sent = [];
  // Suites this page may enter, guest leases it left on purpose, endings only it knows, and
  // a fence so an older list never renders over a newer one.
  let entitled = new Set(), notices = [], listSeq = 0, listing = null, learned = false, owed = false, account = null;
  const left = new Set();
  const whoami = () => `${mp()?.identity?.id ?? ''}@${mp()?.snapshot?.worldId ?? 'river-oaks'}`;
  const forget = () => { lastAnswer = null;entitled = new Set();notices = [];left.clear();learned = false;owed = false;last = null;retry.hidden = true;setCampusSuiteGate(null);
    body.replaceChildren();status.textContent = '';if (dialog.open) dialog.close(); };
  // The server's clock now, from its last answer: dates the dialog proposes stay valid however long it stays open.
  const serverClock = () => serverNow + (Date.now() - listedAt);
  const ensureCommands = () => {
    const id = mp()?.snapshot?.worldId ?? 'river-oaks';
    if (!commands || worldId !== id) { worldId = id;commands = createCampusCommands({ worldId: id, send: message => { if (import.meta.env.DEV) sent.push(message);return mp().command(message); } }); }
    return commands;
  };
  const residents = () => (mp()?.snapshot?.players ?? []).filter(player => player.id !== mp()?.identity?.id).map(player => ({ id: player.id, name: player.name }));
  async function refresh({ announce = false } = {}) {
    const seq = ++listSeq, asked = whoami();if (announce) owed = true;
    const answer = await ensureCommands().list().catch(error => ({ ok: false, message: error.message }));
    // A newer list answers for this one, and owes its announcement; an answer for an account
    // that has since signed out is nobody's.
    if (seq !== listSeq || asked !== whoami()) return true;
    if (!answer?.ok) { status.textContent = answer?.message ?? 'The campus directory is unavailable.';return false; }
    if (account !== asked) { if (account !== null) forget();account = asked; }
    const announcing = owed;owed = false;
    const before = lastAnswer, had = entitled;
    serverNow = answer.serverTimeMs ?? Date.now();listedAt = Date.now();lastAnswer = answer.campus;
    const lost = campusLostGuestAccess(before, answer.campus, { left, at: serverNow });
    for (const id of left) if (!answer.campus.leases?.some(lease => lease.id === id)) left.delete(id);
    notices = [...lost, ...notices.filter(item => !lost.some(fresh => fresh.id === item.id))].slice(0, CAMPUS_OUTCOMES_SHOWN);
    const view = campusDirectory(answer.campus, { now: serverNow, notices });render(view);
    // The page predicts suite doors from this resident's own access; the server still decides every step (#508).
    entitled = new Set((answer.campus.access ?? []).map(entry => entry.unitId));setCampusSuiteGate(unitId => entitled.has(unitId));
    if (announcing) {
      // Access this page held and lost since its last list: the guest notice, or the lease's own ending.
      const gone = [...had].filter(unitId => !entitled.has(unitId) && !lost.some(item => item.unitId === unitId));
      const lines = [...lost, ...gone.map(unitId => view.outcomes.find(item => item.unitId === unitId && item.kind === 'lease')
        ?? { number: answer.campus.units?.find(unit => unit.unitId === unitId)?.number ?? unitId, text: 'Your access to this suite ended.' })].map(item => `Suite ${item.number}: ${item.text}`);
      if (lines.length) {
        const text = lines.join(' ');
        if (dialog.open) status.textContent = text;else { say.textContent = text;notify(text); }
      }
    }
    return true;
  }
  // One background list at a time, announcing what changed.
  const relist = () => { if (!listing && !busy) listing = refresh({ announce: true }).finally(() => { listing = null; }); };
  const holdsAccess = () => entitled.size > 0 || (lastAnswer?.leases ?? []).some(lease => lease.status === 'active');
  async function act(fn, done, action = null) {
    if (busy) return;busy = true;retry.hidden = true;status.textContent = 'Sending…';
    try {
      const result = await fn();
      if (result.retry) { last = { fn, done, action };retry.hidden = false;status.textContent = `${result.message} Your request is kept; Try again sends the same one.`; }
      else {
        // List again before saying how it went, so the answer never sits beside a row that
        // still offers the old state; a directory that fails to list says so after it. A
        // replayed retry whose record has changed since says what changed, not plain success.
        const changed = result.ok ? campusReplayChange(action, result) : null;
        last = null;const said = !result.ok ? result.message : changed ? `${done} earlier, but since then: ${changed}` : result.replayed ? `${done} (already done).` : `${done}.`;
        status.textContent = await refresh() ? said : `${said} ${status.textContent}`;
      }
    } finally { busy = false; }
  }
  const retryLast = () => last && act(last.fn, last.done, last.action);
  async function openDialog() {
    if (!mp()?.connected) { say.textContent = 'Join the town to see the suites.';return; }
    dialog.showModal();status.textContent = 'Opening the directory…';await refresh();heading.focus?.();
  }
  const termPicker = (start = serverClock(), number = null) => {
    const wrap = el('span', null, 'campus-term'), from = el('input'), days = el('select');
    from.type = 'date';from.value = new Date(start).toISOString().slice(0, 10);from.setAttribute('aria-label', 'Start date');
    for (const n of [7, 30, 90]) { const option = el('option', `${n} days`);option.value = String(n);days.append(option); }
    days.value = '30';days.setAttribute('aria-label', 'Length');if (number) { forSuite(from, number, 'Start date');forSuite(days, number, 'Length'); }wrap.append(from, days);
    const read = () => {
      // Today means now (a lease may start up to five minutes back); a later day starts at its morning.
      const now = serverClock(), picked = Date.parse(`${from.value}T00:00:00Z`), startsAt = picked <= now ? now : picked;
      return { startsAt, endsAt: startsAt + Number(days.value) * DAY };
    };
    return { wrap, read };
  };
  const residentPicker = labelText => {
    const select = el('select');select.setAttribute('aria-label', labelText);
    const people = residents();
    for (const person of people) { const option = el('option', person.name);option.value = person.id;select.append(option); }
    return { select, empty: !people.length };
  };
  function render(view) {
    label.textContent = view.leasing === 'closed' ? `${view.label}. Leasing is closed: nobody manages the campus right now.` : `${view.label}. Leases are offered by the campus operator; nothing is ever charged.`;
    if (status.textContent === 'Opening the directory…' || status.textContent === 'Sending…') status.textContent = '';
    body.replaceChildren();
    const live = view.leases.filter(item => item.status !== 'ended'), waiting = view.requests.filter(item => item.status === 'pending');
    if (live.length || waiting.length || view.outcomes.length) {
      const mine = el('section', null, 'campus-section');mine.append(el('h3', 'Your suites'));
      for (const lease of live) {
        const row = el('div', null, 'campus-row');
        row.append(el('strong', `Suite ${lease.number}`), el('span', `${lease.status === 'offered' ? 'Offered' : lease.role === 'guest' ? `Guest of ${lease.tenantName}` : 'Active'} · ${lease.term} · ${lease.label}`));
        if (lease.actions.includes('accept')) row.append(forSuite(button('Accept', () => act(() => commands.accept(lease), 'Lease accepted', 'accept')), lease.number), forSuite(button('Decline', () => act(() => commands.release(lease), 'Offer declined'), 'campus-secondary'), lease.number));
        if (lease.actions.includes('release')) row.append(forSuite(button('Give up this suite', () => act(() => commands.release(lease), 'Lease released'), 'campus-secondary'), lease.number));
        if (lease.actions.includes('leave')) row.append(forSuite(button('Leave as guest', () => act(async () => {
          // Leaving on purpose is this action's answer, not lost access to report later.
          const result = await commands.leave(lease, mp()?.identity?.id);if (result.ok) left.add(lease.id);return result;
        }, 'You left this suite'), 'campus-secondary'), lease.number));
        if (lease.actions.includes('grant')) {
          const { select, empty } = residentPicker('Resident to invite');
          if (!empty) row.append(forSuite(select, lease.number, 'Resident to invite'), forSuite(button('Invite as guest', () => act(() => commands.grant(lease, select.value), 'Guest invited', 'grant')), lease.number));
          for (const guest of lease.guests ?? []) row.append(forSuite(button(`Remove ${guest.name}`, () => act(() => commands.ungrant(lease, guest.userId), 'Guest removed'), 'campus-secondary'), lease.number));
        }
        const directions = view.towers.flatMap(tower => tower.floors.flatMap(floor => floor.units)).find(unit => unit.unitId === lease.unitId)?.directions;
        if (lease.status === 'active' && directions) row.append(el('p', directions, 'campus-hint'));
        mine.append(row);
      }
      for (const request of waiting) {
        const row = el('div', null, 'campus-row');row.append(el('strong', `Suite ${request.number}`), el('span', `Asked · ${request.term} · waiting for the operator`));
        row.append(forSuite(button('Withdraw', () => act(() => commands.cancel(request), 'Request withdrawn'), 'campus-secondary'), request.number));mine.append(row);
      }
      if (view.outcomes.length) {
        const endings = el('ul', null, 'campus-endings');endings.setAttribute('aria-label', 'Ended recently');
        for (const item of view.outcomes) endings.append(el('li', `Suite ${item.number}: ${item.text}`, 'campus-ending'));
        mine.append(el('h4', 'Ended recently'), endings);
      }
      body.append(mine);
    }
    if (view.manage) {
      const manage = el('section', null, 'campus-section');manage.append(el('h3', 'Manage the campus'));
      for (const request of view.manage.requests) {
        const row = el('div', null, 'campus-row');row.append(el('strong', `Suite ${request.number}`), el('span', `${request.name} asked · ${request.term}`));
        row.append(forSuite(button('Offer these dates', () => act(() => commands.issue({ unitId: request.unitId, tenantId: request.userId, startsAt: Math.max(request.startsAt, serverClock()), endsAt: request.endsAt, requestId: request.id }), 'Offer sent', 'issue')), request.number),
          forSuite(button('Decline', () => act(() => commands.decline(request), 'Request declined'), 'campus-secondary'), request.number));
        manage.append(row);
      }
      for (const lease of view.manage.leases) {
        const row = el('div', null, 'campus-row');row.append(el('strong', `Suite ${lease.number}`), el('span', `${lease.tenantName} · ${lease.status} · ${lease.term}`));
        if (lease.actions.includes('renew')) row.append(forSuite(button('Extend 30 days', () => act(() => commands.renew(lease, lease.endsAt + 30 * DAY), 'Lease extended', 'renew')), lease.number));
        row.append(forSuite(button(lease.status === 'offered' ? 'Withdraw offer' : 'End this lease', () => act(() => commands.revoke(lease), lease.status === 'offered' ? 'Offer withdrawn' : 'Lease ended'), 'campus-secondary'), lease.number));
        manage.append(row);
      }
      // Offer an available suite to a resident in town.
      const available = view.towers.flatMap(tower => tower.floors.flatMap(floor => floor.units)).filter(unit => unit.status === 'available');
      const { select: tenant, empty } = residentPicker('Resident');
      if (available.length && !empty) {
        const unit = el('select');unit.setAttribute('aria-label', 'Suite');
        for (const item of available) { const option = el('option', `${item.number} · ${item.netArea} m²`);option.value = item.unitId;unit.append(option); }
        const term = termPicker(), row = el('div', null, 'campus-row');
        row.append(el('strong', 'Offer a suite'), unit, tenant, term.wrap, button('Send offer', () => act(() => commands.issue({ unitId: unit.value, tenantId: tenant.value, ...term.read() }), 'Offer sent', 'issue')));
        manage.append(row);
      }
      body.append(manage);
    }
    const directory = el('section', null, 'campus-section');directory.append(el('h3', 'Suites'));
    for (const tower of view.towers) {
      const group = el('details');group.open = tower === view.towers[0];group.append(el('summary', `${tower.name} (${tower.id})`));
      for (const floor of tower.floors) {
        const list = el('ul', null, 'campus-units');list.setAttribute('aria-label', `${tower.name} floor ${floor.floor}`);
        for (const unit of floor.units) {
          const item = el('li'), chip = el('span', STATES[unit.state], `campus-chip campus-${unit.state}`);
          item.append(el('strong', unit.number), el('span', `Floor ${floor.floor} · ${unit.netArea} m²`), chip);
          if (unit.canRequest) {
            const term = termPicker(serverClock(), unit.number);item.append(term.wrap, forSuite(button('Ask for this suite', () => act(() => commands.request(unit.unitId, term.read()), `Asked for suite ${unit.number}`, 'request')), unit.number));
          }
          list.append(item);
        }
        group.append(list);
      }
      directory.append(group);
    }
    body.append(directory);
  }

  // The desk at a campus workstation: only while the server reports this player there.
  let desk = null, deskAccount = null, seated = false, lastLeased = null;
  const openDesk = () => {
    if (!seated) return;
    desk ??= createDesk({ getMultiplayer: mp, onClose: () => host.focus({ preventScroll: true }) });
    deskAccount = mp()?.identity?.id;void desk.open();
  };
  // Browser journeys read what the dialog last listed and sent (development only).
  if (import.meta.env.DEV) window.__riverCampus = () => ({ campus: lastAnswer, sent: sent.map(message => ({ ...message })) });
  const playProvider = { interaction: () => seated && !desk?.active ? { kind: 'campus-desk', label: 'Use this desk', run: openDesk } : null };
  return {
    playProvider,
    setWorld(world) { panel.hidden = !world?.gardenCampus;if (!world?.gardenCampus && dialog.open) dialog.close(); },
    onSnapshot(snapshot) {
      // Another account or world on this page: drop the former one's suites before anything else.
      const who = whoami();
      if (account !== null && who !== account) { forget();listSeq++;account = who; }
      // Another resident's lease changes what is available: an open directory lists again.
      // So does any change while this page holds suite access: an expiry or revocation shows here.
      const leased = JSON.stringify(snapshot?.campus?.leased ?? null);
      if (leased !== lastLeased) { const first = lastLeased === null;lastLeased = leased;if (dialog.open || (!first && holdsAccess())) relist(); }
      const self = snapshot?.players?.find(player => player.id === mp()?.identity?.id);
      // A page that reaches the suite floors without having listed (a reload upstairs) lists
      // once to learn its own access; nothing is announced until that access changes.
      if (!lastAnswer && !learned && isCampusLevelId(self?.levelId) && self.levelId !== 'garden-campus/l0' && mp()?.connected) { learned = true;relist(); }
      const was = seated;seated = self?.campusWorkstation === true;
      // Standing up, or losing the seat, puts the desk away; the draft stays in this page.
      if (was && !seated && desk?.active) desk.suspend();
      if (desk && deskAccount && deskAccount !== mp()?.identity?.id) { desk.reset();deskAccount = mp()?.identity?.id; }
    },
    get seated() { return seated; },
    dispose() { lifetime.abort();desk?.dispose();dialog.remove();panel.remove(); },
  };
}
