// The suites-and-leases dialog (#510) says how an action went only after it has listed the
// directory again, so its answer never sits beside a row still offering the old state. The
// hosted office journey on candidate e9716e46 read "Asked for suite T1-201." while T1-201's
// row was still "Available" with its "Ask for this suite" button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
// Stylesheets load as nothing, and Vite's `import.meta.env` does not exist outside Vite.
register(`data:text/javascript,${encodeURIComponent(`export async function load(url, context, next) {
  if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
  const out = await next(url, context);
  if (!url.endsWith('/garden-campus-ui.js')) return out;
  const source = typeof out.source === 'string' ? out.source : new TextDecoder().decode(out.source);
  return { ...out, source: source.replaceAll('import.meta.env.DEV', 'false') };
}`)}`, import.meta.url);
const { createGardenCampusUI } = await import('../src/garden-campus-ui.js');
const { campusLeaseUnits } = await import('../../shared/garden-campus-lease-contract.js');

class Node {
  constructor(tag) { Object.assign(this, { tagName: tag.toUpperCase(), children: [], listeners: {}, attributes: {}, textContent: '', className: '', hidden: false, open: false, value: '' }); }
  append(...items) { for (const item of items) { item.parent = this;this.children.push(item); } }
  replaceChildren(...items) { this.children = [];this.append(...items); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  emit(type) { for (const listener of this.listeners[type] ?? []) listener({ type }); }
  showModal() { this.open = true; }
  close() { this.open = false;this.emit('close'); }
  focus() {}
  get all() { return [this, ...this.children.flatMap(child => child.all)]; }
}
const settle = () => new Promise(resolve => setImmediate(resolve));

function town({ failSecondList = false } = {}) {
  globalThis.document = { createElement: tag => new Node(tag), body: new Node('body') };
  globalThis.window = {};
  const now = Date.UTC(2026, 9, 18, 15), requests = [];let lists = 0, held = null;
  const units = campusLeaseUnits().map(unit => ({ ...unit, status: 'available' }));
  const client = {
    connected: true, identity: { id: 'resident' }, snapshot: { worldId: 'river-oaks', players: [] },
    async command(message) {
      if (message.action === 'request') {
        requests.push({ id: `request-${requests.length + 1}`, unitId: message.unitId, number: units.find(unit => unit.unitId === message.unitId).number, status: 'pending', startsAt: message.startsAt, endsAt: message.endsAt });
        return { ok: true };
      }
      if (message.action !== 'list') throw new Error(`unexpected ${message.action}`);
      if (++lists === 2) {
        await new Promise(resolve => { held = resolve; });
        if (failSecondList) return { ok: false, error: 'campus_unavailable', message: 'The campus directory is unavailable.' };
      }
      return { ok: true, serverTimeMs: now, campus: { leasing: 'owner-managed', operator: false, units, leases: [], requests: [...requests], access: [] } };
    },
  };
  const host = new Node('main'), panelHost = new Node('section');
  const ui = createGardenCampusUI({ host, panelHost, getWorld: () => ({ gardenCampus: true }), getMultiplayer: () => client });
  ui.setWorld({ gardenCampus: true });
  const nodes = () => [...panelHost.all, ...document.body.all];
  const row = number => nodes().find(node => node.tagName === 'LI' && node.children.some(child => child.tagName === 'STRONG' && child.textContent === number));
  return {
    ui,
    click: (label, within = null) => (within?.children ?? nodes()).find(node => node.tagName === 'BUTTON' && node.textContent === label).emit('click'),
    chip: number => row(number).children.find(child => child.className.includes('campus-chip')).textContent,
    row,
    status: () => nodes().find(node => node.className === 'campus-status').textContent,
    release: () => held(),
  };
}

test('a request is confirmed only once the directory shows the suite as asked', async () => {
  const t = town();
  t.click('Suites and leases');await settle();
  assert.equal(t.chip('T1-201'), 'Available');
  t.click('Ask for this suite', t.row('T1-201'));await settle();
  // The town has accepted the request; the directory is still listing.
  assert.deepEqual([t.status(), t.chip('T1-201')], ['Sending…', 'Available']);
  t.release();await settle();
  assert.deepEqual([t.status(), t.chip('T1-201')], ['Asked for suite T1-201.', 'You asked']);
  t.ui.dispose();
});

test('a directory that fails to list after an action keeps the action’s answer and says why', async () => {
  const t = town({ failSecondList: true });
  t.click('Suites and leases');await settle();
  t.click('Ask for this suite', t.row('T1-201'));await settle();
  t.release();await settle();
  assert.equal(t.status(), 'Asked for suite T1-201. The campus directory is unavailable.');
  t.ui.dispose();
});

// #510: every state the dialog can show, from answers shaped like the server's (#509).
const NOW = Date.UTC(2026, 9, 24, 15), DAY = 86_400_000, LABEL = 'No charge — owner-managed';
const UNITS = campusLeaseUnits();
const unit = number => UNITS.find(item => item.number === number);
const term = { startsAt: NOW - DAY, endsAt: NOW + 29 * DAY, mode: 'owner-managed', charge: 'none', label: LABEL };
const lease = (number, fields) => ({ id: `lease-${number}`, version: 1, unitId: unit(number).unitId, number, ...term, guests: [], ...fields });
const request = (number, fields) => ({ id: `request-${number}`, unitId: unit(number).unitId, number, ...term, createdAt: NOW - DAY, expiresAt: NOW + 13 * DAY, ...fields });
function answer({ leasing = 'owner-managed', leased = [], leases = [], requests = [], access = [], operator = false } = {}) {
  return { ok: true, serverTimeMs: NOW, campus: { contract: {}, mode: 'owner-managed', charge: 'none', label: LABEL, leasing, operator,
    units: UNITS.map(item => ({ ...item, status: leased.includes(item.number) ? 'leased' : 'available' })), leases, requests,
    access: access.map(([number, role]) => ({ unitId: unit(number).unitId, role })) } };
}
// A town whose list answers come from a queue (the last one repeats); actions answer ok.
function scripted(answers, { players = [], reply = () => ({ ok: true }), createDesk } = {}) {
  globalThis.document = { createElement: tag => new Node(tag), body: new Node('body') };
  globalThis.window = {};
  const sent = [];let next = 0;
  const client = {
    connected: true, identity: { id: 'resident' }, snapshot: { worldId: 'river-oaks', players },
    async command(message) { sent.push(message);if (message.action !== 'list') return reply(message);return structuredClone(answers[Math.min(next++, answers.length - 1)]); },
  };
  const host = new Node('main'), panelHost = new Node('section');
  const notices = [];
  const ui = createGardenCampusUI({ host, panelHost, getWorld: () => ({ gardenCampus: true }), getMultiplayer: () => client, notify: text => notices.push(text), ...(createDesk ? { createDesk } : {}) });
  ui.setWorld({ gardenCampus: true });
  const nodes = () => [...panelHost.all, ...document.body.all];
  const dialog = () => document.body.children.find(node => node.tagName === 'DIALOG');
  const text = node => node.all.map(item => item.textContent).filter(Boolean).join(' ');
  const row = number => nodes().find(node => node.tagName === 'LI' && node.children.some(child => child.tagName === 'STRONG' && child.textContent === number));
  return {
    ui, client, sent, dialog, text, notices,
    lists: () => sent.filter(message => message.action === 'list').length,
    open: async () => { nodes().find(node => node.tagName === 'BUTTON' && node.textContent === 'Suites and leases').emit('click');await settle(); },
    buttons: within => within.all.filter(node => node.tagName === 'BUTTON').map(node => node.textContent),
    chip: number => row(number).children.find(child => child.className.includes('campus-chip')).textContent,
    row,
    mineRow: number => dialog().all.find(node => node.className === 'campus-row' && node.children[0]?.textContent === `Suite ${number}`),
    endings: () => dialog().all.filter(node => node.tagName === 'LI' && node.className === 'campus-ending').map(node => node.textContent),
    say: () => panelHost.all.find(node => node.tagName === 'P' && node.attributes.role === 'status').textContent,
    status: () => dialog().all.find(node => node.className === 'campus-status').textContent,
  };
}
const noPrice = (t, why) => { const all = t.text(t.dialog());assert.match(all, /No charge/, why);assert.doesNotMatch(all, /\$|€|£|price|payment|deposit/i, why); };

test('each suite state reads truthfully, offers only its own actions and says no charge', async () => {
  const t = scripted([answer({
    leased: ['T1-202', 'T2-202', 'T3-201'],
    requests: [request('T1-203', { status: 'pending' })],
    leases: [lease('T2-201', { status: 'offered', role: 'tenant', offerExpiresAt: NOW + 6 * DAY }), lease('T2-202', { status: 'active', role: 'tenant' }),
      lease('T3-201', { status: 'active', role: 'guest', tenantName: 'Alice' })],
    access: [['T2-202', 'tenant'], ['T3-201', 'guest']],
  })]);
  await t.open();
  assert.deepEqual(['T1-201', 'T1-202', 'T1-203', 'T2-201', 'T2-202', 'T3-201'].map(t.chip), ['Available', 'Leased', 'You asked', 'Offered to you', 'Your suite', 'You are a guest']);
  assert.deepEqual(t.buttons(t.row('T1-201')), ['Ask for this suite']);
  for (const number of ['T1-202', 'T1-203', 'T2-201', 'T2-202', 'T3-201']) assert.deepEqual(t.buttons(t.row(number)), [], `${number} cannot be asked for`);
  assert.match(t.text(t.mineRow('T1-203')), /Asked · .* waiting for the operator/);assert.deepEqual(t.buttons(t.mineRow('T1-203')), ['Withdraw']);
  assert.match(t.text(t.mineRow('T2-201')), /Offered · .* No charge/);assert.deepEqual(t.buttons(t.mineRow('T2-201')), ['Accept', 'Decline']);
  assert.match(t.text(t.mineRow('T2-202')), /Active · .* No charge .* take the lift/);assert.deepEqual(t.buttons(t.mineRow('T2-202')), ['Give up this suite']);
  assert.match(t.text(t.mineRow('T3-201')), /Guest of Alice · .* No charge/);assert.deepEqual(t.buttons(t.mineRow('T3-201')), ['Leave as guest']);
  assert.deepEqual(t.endings(), []);
  noPrice(t, 'every live state');
  t.ui.dispose();
});

test('closed leasing offers no request and still says no charge', async () => {
  const t = scripted([answer({ leasing: 'closed' })]);
  await t.open();
  assert.match(t.text(t.dialog()), /Leasing is closed: nobody manages the campus right now/);
  assert.equal(t.dialog().all.filter(node => node.tagName === 'BUTTON' && node.textContent === 'Ask for this suite').length, 0);
  noPrice(t, 'closed leasing');
  t.ui.dispose();
});

const LEASE_ENDINGS = {
  expired: 'The lease ended on 2026-10-23: its term ran out.',
  revoked: 'The lease ended on 2026-10-23: the campus operator ended it.',
  released: 'The lease ended on 2026-10-23: you gave the suite up.',
  declined: 'You declined this offer on 2026-10-23.',
  withdrawn: 'The campus operator withdrew this offer on 2026-10-23.',
  superseded: 'This offer closed on 2026-10-23: another offer for the suite was accepted first.',
  offer_expired: 'This offer lapsed unanswered on 2026-10-23.',
  retired: 'This lease ended on 2026-10-23: the campus no longer offers this suite.',
};
for (const [reason, sentence] of Object.entries(LEASE_ENDINGS)) test(`a lease that ended as ${reason} says so under Ended recently, with no action`, async () => {
  const t = scripted([answer({ leases: [lease('T1-201', { status: 'ended', role: 'tenant', endedAt: NOW - DAY, endedReason: reason })] })]);
  await t.open();
  assert.deepEqual(t.endings(), [`Suite T1-201: ${sentence}`]);
  assert.equal(t.chip('T1-201'), 'Available');
  assert.equal(t.mineRow('T1-201'), undefined, 'an ended lease is not one of the account’s suites');
  noPrice(t, reason);
  t.ui.dispose();
});
const REQUEST_ENDINGS = {
  cancelled: 'You withdrew your request on 2026-10-23.',
  declined: 'The campus operator declined your request on 2026-10-23.',
  expired: 'Your request lapsed unanswered on 2026-10-23.',
  retired: 'Your request closed on 2026-10-23: the campus no longer offers this suite.',
};
for (const [reason, sentence] of Object.entries(REQUEST_ENDINGS)) test(`a request closed as ${reason} says so under Ended recently`, async () => {
  const t = scripted([answer({ requests: [request('T1-201', { status: reason, closedAt: NOW - DAY })] })]);
  await t.open();
  assert.deepEqual(t.endings(), [`Suite T1-201: ${sentence}`]);
  assert.equal(t.chip('T1-201'), 'Available');
  noPrice(t, reason);
  t.ui.dispose();
});

test('with the dialog closed, a tenant whose lease the operator ends is told why when the town changes', async () => {
  const active = lease('T1-201', { status: 'active', role: 'tenant' });
  const t = scripted([answer({ leased: ['T1-201'], leases: [active], access: [['T1-201', 'tenant']] }),
    answer({ leases: [{ ...active, status: 'ended', endedAt: NOW, endedReason: 'revoked', version: 2 }] })]);
  // The town's frames arrive before anyone opens the dialog.
  t.ui.onSnapshot({ campus: { leased: ['T1-F2-W-S'] }, players: [] });await settle();
  assert.equal(t.lists(), 0, 'no list before the page knows of any access');
  await t.open();t.dialog().close();
  const lists = t.lists();
  t.ui.onSnapshot({ campus: { leased: [] }, players: [] });await settle();
  assert.equal(t.lists(), lists + 1, 'one list when the leased suites change');
  assert.deepEqual(t.notices, ['Suite T1-201: The lease ended on 2026-10-24: the campus operator ended it.']);
  t.ui.onSnapshot({ campus: { leased: ['T2-F2-W-S'] }, players: [] });await settle();
  assert.equal(t.lists(), lists + 1, 'without suite access, other residents’ leases send no list');
  t.ui.dispose();
});

test('a guest whose access disappears is told in the panel and the dialog; leaving on purpose is not news', async () => {
  const guest = lease('T1-201', { status: 'active', role: 'guest', tenantName: 'Alice' }), other = lease('T1-202', { status: 'active', role: 'guest', tenantName: 'Bo' });
  const afterRemoval = answer({ leased: ['T1-201', 'T1-202'], leases: [other], access: [['T1-202', 'guest']] });
  const t = scripted([answer({ leased: ['T1-201', 'T1-202'], leases: [guest, other], access: [['T1-201', 'guest'], ['T1-202', 'guest']] }),
    afterRemoval, afterRemoval, answer({ leased: ['T1-201', 'T1-202'], leases: [], access: [] })]);
  t.ui.onSnapshot({ campus: { leased: ['T1-F2-W-S', 'T1-F2-W-N'] }, players: [] });await settle();
  await t.open();t.dialog().close();
  t.ui.onSnapshot({ campus: { leased: ['T1-F2-W-N'] }, players: [] });await settle();
  assert.deepEqual(t.notices, ['Suite T1-201: Your guest access ended: Alice removed you, or the lease ended.']);
  await t.open();
  assert.deepEqual(t.endings(), ['Suite T1-201: Your guest access ended: Alice removed you, or the lease ended.']);
  // Leaving T1-202 on purpose: the next list no longer has it, and that is the action's answer, not a loss.
  t.dialog().all.find(node => node.tagName === 'BUTTON' && node.textContent === 'Leave as guest').emit('click');await settle();
  assert.equal(t.status(), 'You left this suite.');
  assert.deepEqual(t.endings(), ['Suite T1-201: Your guest access ended: Alice removed you, or the lease ended.']);
  assert.equal(t.notices.length, 1, 'no notice for leaving on purpose');
  t.ui.dispose();
});

test('an account whose only records have ended sees them, not an empty heading', async () => {
  const t = scripted([answer({ leases: [lease('T1-201', { status: 'ended', role: 'tenant', endedAt: NOW - DAY, endedReason: 'expired' })] })]);
  await t.open();
  const section = t.dialog().all.find(node => node.tagName === 'SECTION' && node.children[0]?.textContent === 'Your suites');
  assert.ok(section, 'the section is there');
  assert.match(t.text(section), /Ended recently .*its term ran out/);
  t.ui.dispose();
});

test('a page that reaches the suite floors without listing lists once, then hears its lease end', async () => {
  const active = lease('T1-201', { status: 'active', role: 'tenant' });
  const t = scripted([answer({ leased: ['T1-201'], leases: [active], access: [['T1-201', 'tenant']] }),
    answer({ leases: [{ ...active, status: 'ended', endedAt: NOW, endedReason: 'expired', version: 2 }] })]);
  const frame = (levelId, leased = ['T1-F2-W-S']) => ({ campus: { leased }, players: [{ id: 'resident', levelId }] });
  t.ui.onSnapshot(frame(null));await settle();
  assert.equal(t.lists(), 0, 'the street and the ground-floor halls send no list');
  t.ui.onSnapshot(frame('garden-campus/l1'));await settle();
  t.ui.onSnapshot(frame('garden-campus/l1'));await settle();
  assert.equal(t.lists(), 1, 'one list on reaching the suite floors');
  assert.deepEqual(t.notices, []);
  t.ui.onSnapshot(frame('garden-campus/l1', []));await settle();
  assert.deepEqual(t.notices, ['Suite T1-201: The lease ended on 2026-10-24: its term ran out.']);
  t.ui.dispose();
});

test('a retried action whose record has changed since is not reported as plain success', async () => {
  const offered = lease('T1-201', { status: 'offered', role: 'tenant', offerExpiresAt: NOW + 6 * DAY });
  const revoked = { ...offered, status: 'ended', endedAt: NOW, endedReason: 'revoked', version: 3 };
  let lost = true;
  const t = scripted([answer({ leases: [offered] }), answer({ leases: [revoked] })], {
    // The first Accept gets no answer; by the time Try again replays it, the operator has ended the lease.
    reply: message => message.action !== 'accept' ? { ok: true } : lost ? (lost = false, { ok: false, message: 'The town did not answer. Try again.' })
      : { ok: true, replayed: true, lease: revoked, serverTimeMs: NOW },
  });
  await t.open();
  t.dialog().all.find(node => node.tagName === 'BUTTON' && node.textContent === 'Accept').emit('click');await settle();
  assert.match(t.status(), /Try again sends the same one/);
  t.dialog().all.find(node => node.tagName === 'BUTTON' && node.textContent === 'Try again').emit('click');await settle();
  assert.equal(t.status(), 'Lease accepted earlier, but since then: The lease ended on 2026-10-24: the campus operator ended it.');
  assert.deepEqual(t.endings(), ['Suite T1-201: The lease ended on 2026-10-24: the campus operator ended it.']);
  t.ui.dispose();
});

test('the workstation desk opens only while seated, steps away on standing and resets for another account', async () => {
  const calls = [];
  const desk = { active: false, open() { calls.push('open');this.active = true; }, suspend() { calls.push('suspend');this.active = false; }, reset() { calls.push('reset');this.active = false; }, dispose() { calls.push('dispose'); } };
  const t = scripted([answer()], { createDesk: () => desk });
  const frame = (id, campusWorkstation) => ({ campus: { leased: [] }, players: [{ id, campusWorkstation }] });
  assert.equal(t.ui.playProvider.interaction(), null, 'nothing to use before sitting');
  t.ui.onSnapshot(frame('resident', true));
  const action = t.ui.playProvider.interaction();
  assert.deepEqual([action.kind, action.label], ['campus-desk', 'Use this desk']);
  action.run();
  assert.equal(t.ui.playProvider.interaction(), null, 'an open desk offers no second desk');
  t.ui.onSnapshot(frame('resident', false));
  assert.deepEqual(calls, ['open', 'suspend'], 'standing up puts the desk away');
  t.ui.onSnapshot(frame('resident', true));t.ui.playProvider.interaction().run();
  // Another account signs in on this page: the former account's desk is cleared before anything else.
  t.client.identity = { id: 'visitor' };
  t.ui.onSnapshot(frame('visitor', false));
  assert.deepEqual(calls, ['open', 'suspend', 'open', 'suspend', 'reset']);
  t.ui.dispose();
  assert.equal(calls.at(-1), 'dispose');
});
