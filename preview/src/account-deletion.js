// In-app account deletion (#292, App Review guideline 5.1.1(v)). The server decides
// everything: whether deletion is on, whether the sign-in is recent enough, and what is
// erased. This control appears only when the server says deletion is available, asks
// for the exact phrase, and afterwards clears what this device keeps for the account.
import { REGION_DRAFT_STORAGE_KEY } from './region-draft.js';

export const DELETION_PHRASE = 'delete my account';
const STATUS_PATH = '/api/account/delete';
// docs/privacy-data-inventory.md, "Client and desktop storage": the keys that hold the
// account's own data or other residents' ids. Theme, graphics and other display
// preferences belong to the device and stay.
const LOCAL_KEYS = ['river-oaks-voice', 'river-oaks-world-studio-v1', 'river-oaks-studio-designer-v1'];
const SESSION_KEYS = ['river-oaks-graphics-reload'];
const safeStorage = name => { try { return globalThis[name] ?? null; } catch { return null; } };

// Also for sign-out, once its owners call it (docs/account-deletion.md).
export function clearAccountStorage({ userId, local = safeStorage('localStorage'), session = safeStorage('sessionStorage') } = {}) {
  const forget = (storage, key) => { try { storage?.removeItem(key); } catch {} };
  const keys = [...LOCAL_KEYS, REGION_DRAFT_STORAGE_KEY];
  if (typeof userId === 'string' && userId) keys.push(`river-oaks-character-favorites-v2:${encodeURIComponent(userId)}`);
  try { for (let index = 0; index < (local?.length ?? 0); index++) { const key = local.key(index); if (key?.startsWith(`${REGION_DRAFT_STORAGE_KEY}:`)) keys.push(key); } } catch {}
  for (const key of keys) forget(local, key);
  for (const key of SESSION_KEYS) forget(session, key);
}

// Settings → Account → Delete account. Hidden until refresh() hears that deletion is
// available for the signed-in resident; refresh() runs whenever the Account pane opens.
// After a deletion the page waits for Continue, or leaves on its own after LEAVE_MS.
export const LEAVE_MS = 10_000;
export function createAccountDeletionSettings({ fetcher = (...args) => fetch(...args), local, session, leave = () => globalThis.location.assign('/'), setTimer = setTimeout } = {}) {
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
  const root = make('div', 'settings-group account-deletion'); root.hidden = true;
  const heading = make('h4', null, 'Delete account');
  const help = make('p', 'account-deletion-help', 'Deleting your account removes your resident and what River Oaks keeps for it: your look, profile, contacts and messages, groups, events, blocks and landmarks. Reports and moderation decisions about the account are kept. This can’t be undone.');
  const signInAgain = make('p', 'account-deletion-sign-in', 'To delete your account, sign out and sign in again, then come back here within ten minutes.'); signInAgain.tabIndex = -1;
  const open = make('button', 'account-deletion-open', 'Delete account…'); open.type = 'button';
  const form = make('form', 'account-deletion-form'); form.hidden = true; form.id = 'account-deletion-form';
  open.setAttribute('aria-controls', form.id); open.setAttribute('aria-expanded', 'false');
  const label = make('label', null, `Type “${DELETION_PHRASE}” to confirm`);
  const input = make('input'); input.type = 'text'; input.id = 'account-deletion-phrase'; input.autocomplete = 'off'; input.spellcheck = false;
  label.setAttribute('for', input.id);
  const submit = make('button', 'account-deletion-submit', 'Delete account permanently'); submit.type = 'submit'; submit.disabled = true;
  const cancel = make('button', 'account-deletion-cancel', 'Cancel'); cancel.type = 'button';
  const status = make('p', 'account-deletion-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.tabIndex = -1;
  const done = make('button', 'account-deletion-continue', 'Continue'); done.type = 'button'; done.hidden = true;
  form.append(label, input, submit, cancel);
  root.append(heading, help, signInAgain, open, form, status, done);
  // Asking for the session first refreshes an expired access token, as the rest of the client does.
  const signedIn = async () => { const value = await (await fetcher('/auth/session', { credentials: 'same-origin', cache: 'no-store' })).json(); return value?.authenticated ? value : null; };

  let available = false, recent = false, busy = false, asked = 0;
  const render = () => {
    root.hidden = !available;
    signInAgain.hidden = recent;
    open.hidden = !recent || !form.hidden;
    open.setAttribute('aria-expanded', String(!form.hidden));
    submit.disabled = busy || input.value.trim() !== DELETION_PHRASE;
    input.disabled = cancel.disabled = busy;
  };
  const close = () => { form.hidden = true; input.value = ''; render(); open.focus?.(); };
  open.addEventListener('click', () => { form.hidden = false; status.textContent = ''; render(); input.focus?.(); });
  cancel.addEventListener('click', close);
  input.addEventListener('input', render);
  form.addEventListener('submit', async event => {
    event?.preventDefault?.();
    if (busy || input.value.trim() !== DELETION_PHRASE) return;
    // Focus stays in the section while its controls are disabled.
    busy = true; status.textContent = 'Deleting your account…'; render(); status.focus?.();
    let current = null;
    const finish = text => {
      clearAccountStorage({ userId: current.user?.id, local, session });
      status.textContent = text; form.hidden = true; done.hidden = false; done.focus?.();
      setTimer(leave, LEAVE_MS);
    };
    try {
      current = await signedIn();
      if (!current) throw new Error('Sign in to delete your account.');
      let response = null, value = {};
      try {
        response = await fetcher(STATUS_PATH, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': current.csrfToken }, body: JSON.stringify({ confirm: DELETION_PHRASE }) });
        value = await response.json().catch(() => ({}));
      } catch {}
      if (value?.deleted === true) return finish(value.complete ? 'Your account is deleted.' : value.error);
      // No answer, or a signed-out one: the session ending means the account most likely went.
      if (!response || response.status === 401 || !value?.error) {
        if (!await signedIn().catch(() => current)) return finish('Your session ended while your account was being deleted, so it was most likely deleted. If you can still sign in to it, try again.');
      }
      if (value?.reason === 'sign_in_again') { recent = false; form.hidden = true; input.value = ''; }
      throw new Error(value?.error || 'Your account couldn’t be deleted. Try again.');
    } catch (error) {
      busy = false; status.textContent = error.message; render();
      (recent ? input : signInAgain).focus?.();
    }
  });
  done.addEventListener('click', () => leave());
  render();
  return Object.assign(root, {
    async refresh() {
      const mine = ++asked;
      let value = null;
      try {
        if (await signedIn()) { const response = await fetcher(STATUS_PATH, { credentials: 'same-origin', cache: 'no-store' }); value = response.ok ? await response.json() : null; }
      } catch { value = null; }
      if (mine !== asked || busy) return;
      available = value?.available === true; recent = available && value.recent === true;
      if (!recent) { form.hidden = true; input.value = ''; }
      render();
    },
  });
}
