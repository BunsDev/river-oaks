// The child side of the embed contract, written independently of Place's validator. Like
// Computer must, it trusts only its own configured parent origin and window.parent, accepts
// one instance per frame, and gates documents on its own sign-in and a visible Continue/Switch.
const PROTOCOL = 'typesafe-place-embed', VERSION = 1;
const parentOrigin = window.__PARENT_ORIGIN;
const embedded = window.parent !== window && new URLSearchParams(location.search).get('embed') === 'place';
const $ = id => document.getElementById(id);
const state = { instanceId: null, phase: 'loading', sync: 'none', account: null, dirty: false, saving: null, local: false, received: [] };
const show = id => { for (const section of ['loading', 'signin', 'gate', 'desktop', 'standalone']) $(section).hidden = section !== id; };
// Test hooks: what the parent sent, and a way to forge child messages. Not part of the contract.
window.__fixture = { state, received: state.received, send: raw => window.parent.postMessage(raw, parentOrigin) };

function post(type, extra = {}) { if (state.instanceId) window.parent.postMessage({ protocol: PROTOCOL, version: VERSION, type, instanceId: state.instanceId, ...extra }, parentOrigin); }
function status(phase = state.phase, sync = state.sync) {
  state.phase = phase; state.sync = sync; document.body.dataset.phase = phase; document.body.dataset.sync = sync;
  $('sync').textContent = { none: 'Up to date', pending: 'Saving…', saved: 'Saved to your account', offline: 'Kept in this browser', failed: 'Not saved' }[sync];
  post('status', { state: phase, sync });
}
const api = (path, options = {}) => fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });

async function start() {
  status('loading', 'none');
  const me = await api('/api/me');
  if (me.status === 401) { show('signin'); status('signin-required', 'none'); return; }
  const { account, name } = await me.json(); state.account = account;
  // Every fresh instance shows the account before any document, even with a cached session.
  $('gate-name').textContent = name; show('gate'); status('account-confirmation', 'none'); $('continue').focus();
}
async function openDesktop() {
  const { note } = await (await api('/api/state')).json();
  // A local copy kept after a failed save comes back as unsynced, never as saved.
  const local = localStorage.getItem(`note:${state.account}`);
  state.local = state.dirty = local !== null; $('note').value = local ?? note; $('account-name').textContent = $('gate-name').textContent;
  show('desktop'); status('usable', state.local ? 'offline' : 'none'); $('note').focus();
}
async function save() {
  const note = $('note').value; status('usable', 'pending');
  const request = api('/api/state', { method: 'PUT', body: JSON.stringify({ note }) }).then(r => r.ok).catch(() => false);
  state.saving = request; const ok = await request; if (state.saving === request) state.saving = null;
  if (ok && $('note').value === note) { state.dirty = false; state.local = false; localStorage.removeItem(`note:${state.account}`); }
  status('usable', ok ? (state.dirty ? 'pending' : 'saved') : 'failed'); return ok;
}
let debounce = null;
$('note').addEventListener('input', () => { state.dirty = true; status('usable', 'pending'); clearTimeout(debounce); debounce = setTimeout(() => void save(), 300); });

async function prepareClose(requestId) {
  const reply = (result, persistence) => post('close-result', { requestId, result, ...(result === 'ready' ? { persistence } : {}) });
  const mode = await (await api('/api/fixture')).json();
  if (mode.close === 'hang') return;
  if (mode.close === 'attention') return reply('attention');
  if (mode.close === 'cancel') return reply('cancelled');
  if (state.phase !== 'usable') return reply('ready', 'none');
  clearTimeout(debounce); if (state.dirty && !state.saving) void save();
  if (state.saving) await state.saving;
  if (state.dirty || state.sync === 'failed') {
    if (state.local) return reply('ready', 'local');
    // A decision is needed: say so now, and let the person decide here before leaving again.
    $('save-dialog').hidden = false; $('keep-editing').focus(); return reply('attention');
  }
  reply('ready', state.sync === 'saved' ? 'saved' : 'none');
}

$('continue').addEventListener('click', () => void openDesktop());
$('switch').addEventListener('click', async () => {
  $('accounts').replaceChildren(...['ada', 'ben', 'cy'].map(id => {
    const b = document.createElement('button'); b.type = 'button'; b.id = `account-${id}`; b.textContent = id[0].toUpperCase() + id.slice(1);
    b.addEventListener('click', async () => { const r = await api('/api/account', { method: 'POST', body: JSON.stringify({ account: id }) }); if (!r.ok) return; const { account, name } = await r.json(); state.account = account; $('gate-name').textContent = name; $('accounts').hidden = true; $('continue').focus(); });
    return b;
  }));
  $('accounts').hidden = false;
});
$('menu-button').addEventListener('click', () => { $('menu').hidden = !$('menu').hidden; $('menu-button').setAttribute('aria-expanded', String(!$('menu').hidden)); });
$('keep-editing').addEventListener('click', () => { $('save-dialog').hidden = true; $('note').focus(); });
$('keep-local').addEventListener('click', () => { localStorage.setItem(`note:${state.account}`, $('note').value); state.local = true; $('save-dialog').hidden = true; status('usable', 'offline'); });
$('save-retry').addEventListener('click', async () => { if (await save()) $('save-dialog').hidden = true; });
// Escape closes the innermost open thing first; only the top level asks Place to close.
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  if (!$('menu').hidden) { $('menu').hidden = true; $('menu-button').setAttribute('aria-expanded', 'false'); $('menu-button').focus(); return; }
  if (!$('save-dialog').hidden) { $('save-dialog').hidden = true; return; }
  if (['usable', 'account-confirmation'].includes(state.phase)) post('request-close');
});

window.addEventListener('message', event => {
  if (!embedded || event.source !== window.parent || event.origin !== parentOrigin) return;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.protocol !== PROTOCOL || data.version !== VERSION) return;
  const keys = Object.keys(data).sort().join();
  if (data.type === 'init' && keys === 'instanceId,protocol,type,version' && typeof data.instanceId === 'string') {
    state.received.push(structuredClone(data));
    if (state.instanceId && data.instanceId !== state.instanceId) return;
    if (state.instanceId) { status(); return; }
    state.instanceId = data.instanceId; void start(); return;
  }
  if (data.type === 'prepare-close' && keys === 'instanceId,protocol,requestId,type,version' && data.instanceId === state.instanceId) {
    state.received.push(structuredClone(data)); void prepareClose(data.requestId);
  }
});

if (!embedded) api('/api/me').then(async r => { show('standalone'); $('standalone-account').textContent = r.ok ? `Signed in as ${(await r.json()).name}` : 'Not signed in'; });
