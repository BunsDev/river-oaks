import test from 'node:test';
import assert from 'node:assert/strict';
import { DELETION_PHRASE, LEAVE_MS, clearAccountStorage, createAccountDeletionSettings } from '../src/account-deletion.js';
import { DELETION_PHRASE as SERVER_PHRASE } from '../../server/account-deletion.js';
import { REGION_DRAFT_STORAGE_KEY } from '../src/region-draft.js';
import { STORAGE_KEY as STUDIO_KEY } from '../src/studio/document.js';
import { createVoicePreferences } from '../src/voice-preferences.js';
import { createGraphicsReloadState } from '../src/graphics-reload-state.js';

class Element {
  constructor(tag) { this.tagName = tag.toUpperCase();this.children = [];this.attributes = {};this.events = {};this.textContent = '';this.hidden = false;this.disabled = false;this.value = ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, listener) { this.events[type] = listener; }
  append(...nodes) { this.children.push(...nodes); }
  focus() { focused = this; }
}
let focused = null;
function withDocument(t) {
  const prior = globalThis.document;t.after(() => { globalThis.document = prior; });
  globalThis.document = { createElement: tag => new Element(tag) };
}
function storage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return { map, get length() { return map.size; }, key: index => [...map.keys()][index] ?? null, getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
}
const reply = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
// A server that answers like /auth/session and /api/account/delete, and records each call.
function server({ status = { available: true, recent: true }, deletion = reply({ deleted: true, complete: true }), signedIn = () => true } = {}) {
  const calls = [];
  const fetcher = async (path, options = {}) => {
    calls.push([options.method ?? 'GET', path, options.headers?.['X-CSRF-Token'] ?? null, options.body ?? null]);
    if (path === '/auth/session') return reply(signedIn() ? { authenticated: true, user: { id: 'user/erin' }, csrfToken: 'token-1' } : { authenticated: false });
    return (options.method ?? 'GET') === 'GET' ? reply(typeof status === 'function' ? await status() : status) : typeof deletion === 'function' ? deletion() : deletion;
  };
  return { fetcher, calls };
}
const parts = root => {
  const [heading, help, signInAgain, open, form, status, done] = root.children, [label, input, submit, cancel] = form.children;
  return { heading, help, signInAgain, open, form, status, done, label, input, submit, cancel };
};
const type = (input, text) => { input.value = text;input.events.input(); };

test('the phrase is the one the server asks for', () => assert.equal(DELETION_PHRASE, SERVER_PHRASE));

test('the control stays hidden until the server offers deletion, and asks for a recent sign-in', async t => {
  withDocument(t);
  let answer = { available: false }, signedIn = false;
  const { fetcher, calls } = server({ status: () => answer, signedIn: () => signedIn });
  const root = createAccountDeletionSettings({ fetcher }), view = parts(root);
  assert.equal(root.hidden, true, 'hidden before the server is asked');
  answer = { available: true, recent: true };await root.refresh();
  assert.equal(root.hidden, true, 'signed out');assert.deepEqual(calls.map(call => call[1]), ['/auth/session'], 'nothing else is asked');
  // The session is asked first, which refreshes an expired access token before the status.
  signedIn = true;answer = { available: false };calls.length = 0;await root.refresh();
  assert.deepEqual(calls.map(call => call[1]), ['/auth/session', '/api/account/delete']);
  assert.equal(root.hidden, true, 'off');
  answer = { available: true, recent: false };await root.refresh();
  assert.deepEqual([root.hidden, view.signInAgain.hidden, view.open.hidden], [false, false, true]);
  answer = { available: true, recent: true };await root.refresh();
  assert.deepEqual([view.signInAgain.hidden, view.open.hidden, view.form.hidden], [true, false, true]);
  // A slower answer from an earlier refresh does not replace a later one.
  let release;answer = new Promise(resolve => { release = resolve; });
  const earlier = root.refresh();answer = { available: true, recent: true };await root.refresh();
  release({ available: false });await earlier;
  assert.equal(root.hidden, false);
  // A server that fails hides the control.
  answer = Promise.reject(new Error('offline'));await root.refresh();assert.equal(root.hidden, true);
});

test('deleting needs the exact phrase, sends the security token, clears this device and leaves', async t => {
  withDocument(t);
  const local = storage({ 'river-oaks-theme': 'dark', [`river-oaks-character-favorites-v2:${encodeURIComponent('user/erin')}`]: '[]',
    'river-oaks-character-favorites-v2:someone-else': '[]', [REGION_DRAFT_STORAGE_KEY]: '{}', [`${REGION_DRAFT_STORAGE_KEY}:moon-garden`]: '{}',
    [STUDIO_KEY]: '{}', 'river-oaks-studio-designer-v1': '{}' });
  const session = storage();
  createVoicePreferences({ storage: local }).setMuted('pat', true);
  assert.equal(createGraphicsReloadState({ storage: session, scope: 'river-oaks' }).save({ tab: 'chat', draft: 'unsent words' }), true);
  assert.ok(local.map.has('river-oaks-voice') && session.length === 1, 'the real modules wrote their keys');
  const { fetcher, calls } = server(), timers = [];let left = false;
  const root = createAccountDeletionSettings({ fetcher, local, session, leave: () => { left = true; }, setTimer: (fn, ms) => timers.push([fn, ms]) });
  const view = parts(root);await root.refresh();
  view.open.events.click();
  assert.deepEqual([view.form.hidden, view.open.hidden, view.open.getAttribute('aria-expanded'), focused], [false, true, 'true', view.input]);
  assert.equal(view.label.getAttribute('for'), view.input.id);
  type(view.input, 'Delete my account');assert.equal(view.submit.disabled, true, 'the phrase is exact');
  await view.form.events.submit({ preventDefault() {} });
  assert.equal(calls.filter(([method]) => method === 'POST').length, 0, 'nothing is sent without the phrase');
  type(view.input, ` ${DELETION_PHRASE} `);assert.equal(view.submit.disabled, false);
  await view.form.events.submit({ preventDefault() {} });
  assert.deepEqual(calls.slice(-2), [['GET', '/auth/session', null, null], ['POST', '/api/account/delete', 'token-1', JSON.stringify({ confirm: DELETION_PHRASE })]]);
  assert.equal(view.status.textContent, 'Your account is deleted.');
  assert.deepEqual([...local.map.keys()].sort(), ['river-oaks-character-favorites-v2:someone-else', 'river-oaks-theme'], 'only display preferences and other accounts stay');
  assert.equal(session.length, 0);
  assert.deepEqual([view.form.hidden, view.done.hidden, focused], [true, false, view.done], 'Continue takes focus');
  assert.equal(view.submit.disabled, true, 'nothing can be sent twice');
  view.done.events.click();assert.equal(left, true);
  left = false;assert.equal(timers[0][1], LEAVE_MS);timers[0][0]();assert.equal(left, true, 'or the page leaves on its own');
});

test('a refusal is said aloud, and a stale sign-in shows how to continue', async t => {
  withDocument(t);
  let answer = reply({ error: 'We couldn’t delete your account right now. Try again later.' }, 502);
  const { fetcher } = server({ deletion: () => answer });
  const root = createAccountDeletionSettings({ fetcher, local: storage(), session: storage(), leave: () => assert.fail('stayed signed in') });
  const view = parts(root);await root.refresh();
  view.open.events.click();type(view.input, DELETION_PHRASE);
  await view.form.events.submit({ preventDefault() {} });
  assert.match(view.status.textContent, /couldn’t delete your account right now/);
  assert.deepEqual([view.submit.disabled, view.input.disabled, view.form.hidden, focused], [false, false, false, view.input], 'they can try again');
  answer = reply({ error: 'Sign in again, then delete your account within ten minutes.', reason: 'sign_in_again' }, 403);
  await view.form.events.submit({ preventDefault() {} });
  assert.deepEqual([view.form.hidden, view.signInAgain.hidden, view.open.hidden, focused], [true, false, true, view.signInAgain]);
  assert.equal(view.status.textContent, 'Sign in again, then delete your account within ten minutes.');
  // Cancel closes the form and returns focus to the button that opened it.
  await root.refresh();view.open.events.click();type(view.input, 'delete');view.cancel.events.click();
  assert.deepEqual([view.form.hidden, view.input.value, focused], [true, '', view.open]);
});

test('when the answer is lost, an ended session counts as deleted and a live one as a failure', async t => {
  withDocument(t);
  let signedIn = true;const local = storage({ 'river-oaks-voice': '{}' }), timers = [];
  const { fetcher } = server({ signedIn: () => signedIn, deletion: () => { signedIn = after;throw new TypeError('Failed to fetch'); } });
  let after = true;
  const root = createAccountDeletionSettings({ fetcher, local, session: storage(), leave() {}, setTimer: (fn, ms) => timers.push(ms) });
  const view = parts(root);await root.refresh();
  view.open.events.click();type(view.input, DELETION_PHRASE);
  await view.form.events.submit({ preventDefault() {} });
  assert.equal(view.status.textContent, 'Your account couldn’t be deleted. Try again.', 'still signed in: nothing is claimed');
  assert.deepEqual([local.length, timers.length, view.submit.disabled], [1, 0, false]);
  after = false;signedIn = true;
  await view.form.events.submit({ preventDefault() {} });
  assert.match(view.status.textContent, /most likely deleted/);
  assert.deepEqual([local.length, timers, view.done.hidden], [0, [LEAVE_MS], false]);
});

test('clearing tolerates storage that is missing or throws', () => {
  const broken = { get length() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  assert.doesNotThrow(() => clearAccountStorage({ userId: 'erin', local: broken, session: null }));
  assert.doesNotThrow(() => clearAccountStorage({}));
});
