// The Gardens on the page (#510): a Play section to reach the campus, a suites-and-leases
// dialog over the server's owner-managed lease authority (#509), and "Use this desk" at a
// campus workstation, which opens the sitter's own private desk (the office desk dialog).
//
// Nothing here decides access: every list and action is a world command the server checks,
// and the desk opens only while the server says this player sits at a workstation. Leases
// never charge; the dialog shows the server's label and offers no payment step.
import { createOfficeDeskUI } from './office-desk-ui.js';
import { campusDefaultTerm, campusDirectory, createCampusCommands } from './garden-campus-model.js';
import './garden-campus.css';

const DAY = 86_400_000;
const el = (tag, text, className) => { const n = document.createElement(tag);if (text) n.textContent = text;if (className) n.className = className;return n; };
const STATES = { available: 'Available', leased: 'Leased', requested: 'You asked', offered: 'Offered to you', yours: 'Your suite', guest: 'You are a guest' };

export function createGardenCampusUI({ host, panelHost, getWorld, getMultiplayer }) {
  const lifetime = new AbortController(), signal = lifetime.signal, mp = () => getMultiplayer();
  const button = (text, fn, className) => { const b = el('button', text, className);b.type = 'button';b.addEventListener('click', fn, { signal });return b; };
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

  let commands = null, worldId = null, last = null, serverNow = Date.now(), busy = false;
  const ensureCommands = () => {
    const id = mp()?.snapshot?.worldId ?? 'river-oaks';
    if (!commands || worldId !== id) { worldId = id;commands = createCampusCommands({ worldId: id, send: message => mp().command(message) }); }
    return commands;
  };
  const residents = () => (mp()?.snapshot?.players ?? []).filter(player => player.id !== mp()?.identity?.id).map(player => ({ id: player.id, name: player.name }));
  async function refresh() {
    const answer = await ensureCommands().list().catch(error => ({ ok: false, message: error.message }));
    if (!answer?.ok) { status.textContent = answer?.message ?? 'The campus directory is unavailable.';return; }
    serverNow = answer.serverTimeMs ?? Date.now();render(campusDirectory(answer.campus, { now: serverNow }));
  }
  async function act(fn, done) {
    if (busy) return;busy = true;retry.hidden = true;status.textContent = 'Sending…';
    try {
      const result = await fn();
      if (result.retry) { last = { fn, done };retry.hidden = false;status.textContent = `${result.message} Your request is kept; Try again sends the same one.`; }
      else { last = null;status.textContent = result.ok ? (result.replayed ? `${done} (already done).` : `${done}.`) : result.message;await refresh(); }
    } finally { busy = false; }
  }
  const retryLast = () => last && act(last.fn, last.done);
  async function openDialog() {
    if (!mp()?.connected) { say.textContent = 'Join the town to see the suites.';return; }
    dialog.showModal();status.textContent = 'Opening the directory…';await refresh();heading.focus?.();
  }
  const termPicker = (start = serverNow) => {
    const wrap = el('span', null, 'campus-term'), from = el('input'), days = el('select');
    from.type = 'date';from.value = new Date(start).toISOString().slice(0, 10);from.setAttribute('aria-label', 'Start date');
    for (const n of [7, 30, 90]) { const option = el('option', `${n} days`);option.value = String(n);days.append(option); }
    days.value = '30';days.setAttribute('aria-label', 'Length');wrap.append(from, days);
    const read = () => {
      // Today means now (a lease may start up to five minutes back); a later day starts at its morning.
      const picked = Date.parse(`${from.value}T00:00:00Z`), startsAt = picked <= serverNow ? serverNow : picked;
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
    if (view.leases.length || view.requests.some(item => item.status === 'pending')) {
      const mine = el('section', null, 'campus-section');mine.append(el('h3', 'Your suites'));
      for (const lease of view.leases.filter(item => item.status !== 'ended')) {
        const row = el('div', null, 'campus-row');
        row.append(el('strong', `Suite ${lease.number}`), el('span', `${lease.status === 'offered' ? 'Offered' : lease.role === 'guest' ? `Guest of ${lease.tenantName}` : 'Active'} · ${lease.term} · ${lease.label}`));
        if (lease.actions.includes('accept')) row.append(button('Accept', () => act(() => commands.accept(lease), 'Lease accepted')), button('Decline', () => act(() => commands.release(lease), 'Offer declined'), 'campus-secondary'));
        if (lease.actions.includes('release')) row.append(button('Give up this suite', () => act(() => commands.release(lease), 'Lease released'), 'campus-secondary'));
        if (lease.actions.includes('leave')) row.append(button('Leave as guest', () => act(() => commands.leave(lease, mp()?.identity?.id), 'You left this suite'), 'campus-secondary'));
        if (lease.actions.includes('grant')) {
          const { select, empty } = residentPicker('Resident to invite');
          if (!empty) row.append(select, button('Invite as guest', () => act(() => commands.grant(lease, select.value), 'Guest invited')));
          for (const guest of lease.guests ?? []) row.append(button(`Remove ${guest.name}`, () => act(() => commands.ungrant(lease, guest.userId), 'Guest removed'), 'campus-secondary'));
        }
        const directions = view.towers.flatMap(tower => tower.floors.flatMap(floor => floor.units)).find(unit => unit.unitId === lease.unitId)?.directions;
        if (lease.status === 'active' && directions) row.append(el('p', directions, 'campus-hint'));
        mine.append(row);
      }
      for (const request of view.requests.filter(item => item.status === 'pending')) {
        const row = el('div', null, 'campus-row');row.append(el('strong', `Suite ${request.number}`), el('span', `Asked · ${request.term} · waiting for the operator`));
        row.append(button('Withdraw', () => act(() => commands.cancel(request), 'Request withdrawn'), 'campus-secondary'));mine.append(row);
      }
      body.append(mine);
    }
    if (view.manage) {
      const manage = el('section', null, 'campus-section');manage.append(el('h3', 'Manage the campus'));
      for (const request of view.manage.requests) {
        const row = el('div', null, 'campus-row');row.append(el('strong', `Suite ${request.number}`), el('span', `${request.name} asked · ${request.term}`));
        row.append(button('Offer these dates', () => act(() => commands.issue({ unitId: request.unitId, tenantId: request.userId, startsAt: Math.max(request.startsAt, serverNow), endsAt: request.endsAt, requestId: request.id }), 'Offer sent')),
          button('Decline', () => act(() => commands.decline(request), 'Request declined'), 'campus-secondary'));
        manage.append(row);
      }
      for (const lease of view.manage.leases) {
        const row = el('div', null, 'campus-row');row.append(el('strong', `Suite ${lease.number}`), el('span', `${lease.tenantName} · ${lease.status} · ${lease.term}`));
        if (lease.actions.includes('renew')) row.append(button('Extend 30 days', () => act(() => commands.renew(lease, lease.endsAt + 30 * DAY), 'Lease extended')));
        row.append(button(lease.status === 'offered' ? 'Withdraw offer' : 'End this lease', () => act(() => commands.revoke(lease), lease.status === 'offered' ? 'Offer withdrawn' : 'Lease ended'), 'campus-secondary'));
        manage.append(row);
      }
      // Offer an available suite to a resident in town.
      const available = view.towers.flatMap(tower => tower.floors.flatMap(floor => floor.units)).filter(unit => unit.status === 'available');
      const { select: tenant, empty } = residentPicker('Resident');
      if (available.length && !empty) {
        const unit = el('select');unit.setAttribute('aria-label', 'Suite');
        for (const item of available) { const option = el('option', `${item.number} · ${item.netArea} m²`);option.value = item.unitId;unit.append(option); }
        const term = termPicker(), row = el('div', null, 'campus-row');
        row.append(el('strong', 'Offer a suite'), unit, tenant, term.wrap, button('Send offer', () => act(() => commands.issue({ unitId: unit.value, tenantId: tenant.value, ...term.read() }), 'Offer sent')));
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
            const term = termPicker();item.append(term.wrap, button('Ask for this suite', () => act(() => commands.request(unit.unitId, term.read()), `Asked for suite ${unit.number}`)));
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
  let desk = null, deskAccount = null, seated = false;
  const openDesk = () => {
    if (!seated) return;
    desk ??= createOfficeDeskUI({ getMultiplayer: mp, onClose: () => host.focus({ preventScroll: true }) });
    deskAccount = mp()?.identity?.id;void desk.open();
  };
  const playProvider = { interaction: () => seated && !desk?.active ? { kind: 'campus-desk', label: 'Use this desk', run: openDesk } : null };
  return {
    playProvider,
    setWorld(world) { panel.hidden = !world?.gardenCampus;if (!world?.gardenCampus && dialog.open) dialog.close(); },
    onSnapshot(snapshot) {
      const self = snapshot?.players?.find(player => player.id === mp()?.identity?.id);
      const was = seated;seated = self?.campusWorkstation === true;
      // Standing up, or losing the seat, puts the desk away; the draft stays in this page.
      if (was && !seated && desk?.active) desk.suspend();
      if (desk && deskAccount && deskAccount !== mp()?.identity?.id) { desk.reset();deskAccount = mp()?.identity?.id; }
    },
    get seated() { return seated; },
    dispose() { lifetime.abort();desk?.dispose();dialog.remove();panel.remove(); },
  };
}
