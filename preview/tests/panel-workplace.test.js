// The workplace panel never claims work it cannot see: after a failed or skipped
// refresh, "working" gives way to a stale-connection label until a fresh state
// arrives. It also offers to forget a finished brief.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register(`data:text/javascript,${encodeURIComponent("export async function load(url, context, next) { return url.endsWith('.css') ? {format:'module',source:'',shortCircuit:true} : next(url,context); }")}`, import.meta.url);
const { createWorkplaceUI } = await import('../src/workplace-ui.js');

function dom() {
  class Element {
    constructor(tag) { this.tagName = tag;this.children = [];this.dataset = {};this.events = {};this.attributes = {};this.textContent = '';this.value = '';this.hidden = false; }
    append(...items) { for (const item of items) { item.parent = this;this.children.push(item); } }
    after(item) { this.parent?.append(item); }
    replaceChildren(...items) { this.children = [];this.append(...items); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, callback) { this.events[type] = callback; }
    async click() { return this.events.click?.({preventDefault() {}}); }
    contains(item) { return this.children.some(child => child === item || child.contains(item)); }
    querySelector() { return null; }
    remove() {}
    focus() { globalThis.document.activeElement = this; }
    reset() {}
    get text() { return [this.textContent, ...this.children.map(child => child.text)].join(' '); }
    find(predicate) { return predicate(this) ? this : this.children.map(child => child.find(predicate)).find(Boolean) ?? null; }
  }
  globalThis.document = {createElement: tag => new Element(tag), activeElement: null, visibilityState: 'visible'};
  globalThis.CSS = {escape: value => value};
  return new Element('aside');
}
const running = {protocol: 1, companion: {id: 'c1', name: 'Pip', connection: 'fixture', presence: {mode: 'stationed', stationId: 'station-1'}},
  grant: {id: 'g1', revision: 1, scope: 'event_plan', active: true, expiresAt: Date.now() + 86_400_000}, offer: {state: 'accepted'},
  tasks: [{id: 'task-000001', status: 'running', reason: null, brief: {purpose: 'Welcome Mina'}, checkpoints: [{step: 'reading_brief'}]}],
  artifacts: [], notices: [], limits: {artifacts: 3, retentionDays: 30}};

function setup() {
  const panel = dom(), calls = [];
  let online = true, failing = false, next = running;
  const ui = createWorkplaceUI({panel, connected: () => online, request: async (action, data) => {
    calls.push([action, data]);
    if (failing) throw new Error('offline');
    return {ok: true, state: next};
  }});
  const section = panel.children[0];
  return {ui, section, calls, set online(value) { online = value; }, set failing(value) { failing = value; }, set next(value) { next = value; }};
}

test('the panel stops showing work after a failed refresh and recovers with fresh state', async t => {
  const env = setup();t.after(() => env.ui.dispose());
  await env.ui.refresh();
  assert.match(env.section.text, /Working on your plan/);
  env.failing = true;await env.ui.refresh();
  assert.doesNotMatch(env.section.text, /Working on your plan/);
  assert.match(env.section.text, /Connection lost — progress unknown/);
  env.failing = false;await env.ui.refresh();
  assert.match(env.section.text, /Working on your plan/);
});

test('a disconnected or hidden page cannot keep claiming work', async t => {
  const env = setup();t.after(() => env.ui.dispose());
  await env.ui.refresh();
  env.online = false;await env.ui.refresh();
  assert.match(env.section.text, /Connection lost/);
  env.online = true;globalThis.document.visibilityState = 'hidden';await env.ui.refresh();
  assert.match(env.section.text, /Connection lost/, 'a hidden tab does not refresh, so it cannot vouch for progress');
  globalThis.document.visibilityState = 'visible';await env.ui.refresh();
  assert.match(env.section.text, /Working on your plan/);
});

test('a finished task can be forgotten from the panel', async t => {
  const env = setup();t.after(() => env.ui.dispose());
  env.next = {...running, tasks: [{...running.tasks[0], status: 'cancelled', reason: 'owner_cancelled'}]};
  await env.ui.refresh();
  const forget = env.section.find(node => node.tagName === 'button' && node.dataset.focusKey === 'forget');
  assert.ok(forget, 'a Forget control is offered for a finished task');
  env.next = {...running, tasks: []};
  await forget.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(env.calls.find(([action]) => action === 'forget'), ['forget', {taskId: 'task-000001'}]);
});
