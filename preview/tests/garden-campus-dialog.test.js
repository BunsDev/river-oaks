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
