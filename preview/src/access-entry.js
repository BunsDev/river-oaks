import { dismissOnOutsideClick } from './modal-dismiss.js';
import './access-gate.css';
import { installDiagnostics, registerDiagnosticSource } from './debug-report.js';
import { startArtRotation } from './access-art-rotation.js';
import { generatedUsername } from './generated-username.js';

// Problem reports start collecting with the sign-in page, so a failure before the
// game loads is still in the report.
installDiagnostics();

const $ = selector => document.querySelector(selector);
const gate = $('#access-gate'), message = $('#access-message'), providers = $('#access-providers');
const retry = $('#access-retry'), tools = $('#access-tools'), adminButton = $('#access-admin');
const gateSignout = $('#access-gate-signout');
const review = $('#access-review'), reviewList = $('#access-review-list'), reviewStatus = $('#access-review-status');
let session = null, entered = false, checking = false, gateState = '', isAdmin = false;
const inviteForm = $('#access-invite-form'), redeemButton = $('#access-invite-redeem');
// A waiting resident's username: the field is never overwritten while they edit it.
const usernameForm = $('#access-username-form'), usernameInput = $('#access-username'), usernameStatus = $('#access-username-status');
const usernameGitHub = $('#access-username-github');
let usernameEdited = false, githubName = null;
const USERNAME_ERRORS = { username_taken: 'Someone already has that name. Try another.', username_locked: 'Your name is already settled.',
  username_missing: 'Your request could not be found. Reload and try again.' };
const usernameError = error => USERNAME_ERRORS[error.message] ?? error.detail?.message ?? 'That name could not be saved. Try again.';
let reviewGeneration = 0, restoreReviewSettings = false;

// The art rotates only while the gate is showing; it re-checks when the gate opens or closes.
const artRotation = startArtRotation(document.querySelector('.access-scene'), { isOpen: () => !gate.hidden });
new MutationObserver(() => artRotation.sync()).observe(gate, { attributes: true, attributeFilter: ['hidden'] });

registerDiagnosticSource('access', () => ({ gate: gate.hidden ? 'entered' : gateState || 'checking', signedIn: Boolean(session?.authenticated), entered, admin: isAdmin }));
// Every "Report a problem" control dispatches one event; the dialog loads on first use.
const reportSession = () => ({ signedIn: Boolean(session?.authenticated), csrfToken: session?.csrfToken ?? null });
window.addEventListener('river-oaks:report-problem', () => { void import('./debug-report-ui.js').then(({ openReportDialog }) => openReportDialog({ getSession: reportSession })); });
const reportProblem = () => window.dispatchEvent(new CustomEvent('river-oaks:report-problem'));
for (const id of ['#access-report', '#access-gate-report']) $(id).addEventListener('click', reportProblem);
$('#access-reports').addEventListener('click', () => { void import('./debug-report-ui.js').then(({ openReportInbox }) => openReportInbox()); });

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error ?? 'Access is unavailable'), { detail: body });
  return body;
}

// A browser that entered last time opens on a quiet splash (public/assets/boot/first-paint.js).
// It ends when the district opens, or as soon as the gate itself is needed; a visit that
// ends (signed out, waitlisted) is forgotten so the next load shows the gate straight away.
const endSplash = ({ forget = false } = {}) => {
  delete document.documentElement.dataset.returning;
  if (forget) try { localStorage.removeItem('river-oaks-entered'); } catch { /* Storage may be disabled. */ }
};

async function checkAccess() {
  if (checking) return;
  checking = true;
  retry.hidden = true;
  try {
    session = await api('/auth/session');
    if (!session.authenticated) {
      if (entered) location.reload();
      endSplash({ forget: true });
      tools.hidden = true; gateSignout.hidden = true; providers.hidden = false; usernameForm.hidden = true;
      inviteForm.hidden = false; redeemButton.disabled = true;
      message.textContent = 'Sign in with email or GitHub.\nEntry is by invitation or waitlist approval.';
      if (gateState !== 'signed-out') $('#access-title').focus({ preventScroll: true });
      gateState = 'signed-out';
      return;
    }
    if (entered && session.user.id !== document.body.dataset.accountId) {
      location.reload();
      return;
    }
    tools.hidden = false; gateSignout.hidden = false;
    const access = await api('/api/waitlist/status');
    isAdmin = access.admin;
    adminButton.hidden = !access.admin;
    $('#access-reports').hidden = !access.admin;
    if (access.status !== 'approved') {
      if (entered) location.reload();
      endSplash({ forget: true });
      providers.hidden = true;
      inviteForm.hidden = access.status === 'rejected'; redeemButton.disabled = false;
      usernameForm.hidden = access.status !== 'pending';
      githubName = access.github ?? null;
      if (!usernameEdited && document.activeElement !== usernameInput) usernameInput.value = access.username ?? '';
      usernameGitHub.hidden = !githubName || usernameInput.value === githubName;
      message.textContent = access.status === 'rejected'
        ? 'Your request has not been approved. Contact the district team if you think this is a mistake.'
        : 'You’re on the waitlist. An admin can approve you, or you can redeem an invite below.';
      if (gateState !== access.status) $('#access-title').focus({ preventScroll: true });
      gateState = access.status;
      return;
    }
    usernameForm.hidden = true;
    if (!entered) {
      entered = true;
      document.body.dataset.accountId = session.user.id;
      // The game's stylesheets arrive with main.js. The page is laid out underneath, but the
      // gate stays over it until main.js starts, so the district never shows as unstyled HTML.
      message.textContent = 'Opening the district…';
      try { localStorage.setItem('river-oaks-entered', '1'); } catch { /* Storage may be disabled. */ }
      document.addEventListener('river-oaks:styled', () => { gate.hidden = true; endSplash(); }, { once: true });
      document.body.classList.add('access-granted');
      await import('./main.js');
      gate.hidden = true; endSplash();
    }
  } catch {
    if (entered) location.reload();
    endSplash();
    providers.hidden = true; retry.hidden = false;
    redeemButton.disabled = true;
    message.textContent = 'Access could not be checked. Try again shortly.';
  } finally { checking = false; }
}

const post = (path, data) => api(path, { method: 'POST', headers: {
  'Content-Type': 'application/json', ...(session?.csrfToken ? { 'X-CSRF-Token': session.csrfToken } : {}),
}, body: JSON.stringify(data) });

usernameInput.addEventListener('input', () => {
  usernameEdited = true; usernameStatus.textContent = '';
  usernameGitHub.hidden = !githubName || usernameInput.value === githubName;
});
usernameGitHub.addEventListener('click', () => { usernameInput.value = githubName; usernameEdited = true; usernameGitHub.hidden = true; usernameInput.focus(); });
$('#access-username-suggest').addEventListener('click', () => {
  usernameInput.value = generatedUsername(crypto.randomUUID()); usernameEdited = true;
  usernameGitHub.hidden = !githubName; usernameInput.focus();
});
usernameForm.addEventListener('submit', async event => {
  event.preventDefault();
  const save = $('#access-username-save'); save.disabled = true;
  try {
    const result = await post('/api/waitlist/username', { username: usernameInput.value.trim() });
    usernameInput.value = result.username; usernameEdited = false;
    usernameStatus.textContent = `Saved. You’ll be known as ${result.username}.`;
  } catch (error) { usernameStatus.textContent = usernameError(error); }
  finally { save.disabled = false; }
});

// Cloudflare Turnstile guards email sign-in when the build has a site key. The
// widget loads on first use of the email field, so GitHub sign-in never loads it.
const turnstileKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
let challengeToken = null, challengeWidget = null;
function showChallenge() {
  if (!turnstileKey || document.querySelector('script[data-turnstile]')) return;
  const container = $('#access-email-challenge'); container.hidden = false;
  const script = Object.assign(document.createElement('script'), { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true });
  script.dataset.turnstile = '';
  script.addEventListener('load', () => {
    challengeWidget = window.turnstile.render(container, { sitekey: turnstileKey, action: 'email_sign_in',
      callback: token => { challengeToken = token; }, 'expired-callback': () => { challengeToken = null; }, 'error-callback': () => { challengeToken = null; } });
  });
  document.head.append(script);
}
$('#access-email').addEventListener('focus', showChallenge, { once: true });

$('#access-email-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  if (turnstileKey && !challengeToken) {
    showChallenge(); button.disabled = false;
    $('#access-email-status').textContent = 'Complete the check under the email field, then send the code.';
    return;
  }
  try {
    const result = await post('/auth/email/start', { email: $('#access-email').value.trim(), ...(turnstileKey ? { turnstileToken: challengeToken } : {}) });
    if (!result.sent) {
      $('#access-email-status').textContent = 'A code was requested recently. Use it in the browser where you requested it, or wait a minute and request another here.';
      return;
    }
    $('#access-email-verify').hidden = false;
    $('#access-email-status').textContent = 'Check your inbox for a six-digit code. It expires in 10 minutes. Wait a minute before requesting another.';
    $('#access-email-code').focus();
  } catch (error) {
    $('#access-email-status').textContent = error.message === 'email_paused'
      ? 'Email sign-in has reached today’s limit. Sign in with GitHub, or try email again tomorrow.'
      : error.message === 'challenge_failed' ? 'The check didn’t go through. Complete it again, then send the code.'
      : error.message === 'email_limited' ? 'This connection has requested several codes today. Sign in with GitHub, or try again tomorrow.'
      : 'We couldn’t send a code. Check your email address and try again shortly.';
  }
  finally {
    button.disabled = false;
    // Turnstile tokens are single-use: get a fresh one for any later attempt.
    if (challengeWidget !== null) { window.turnstile.reset(challengeWidget); challengeToken = null; }
  }
});
$('#access-email-verify').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try {
    await post('/auth/email/verify', { code: $('#access-email-code').value.trim() });
    $('#access-email-code').value = '';
    await checkAccess();
  } catch { $('#access-email-status').textContent = 'That code couldn’t be verified. Check it or request a new code.'; }
  finally { button.disabled = false; }
});
inviteForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!session?.authenticated) return;
  redeemButton.disabled = true;
  try {
    await post('/api/waitlist/invite-redeem', { code: $('#access-invite-code').value.trim() });
    $('#access-invite-code').value = '';
    $('#access-invite-status').textContent = 'Invite accepted. Welcome to TypeSafe Place.';
    await checkAccess();
  } catch { $('#access-invite-status').textContent = 'This invite can’t be used. It may have expired, been used, or belong to another person.'; }
  finally { redeemButton.disabled = false; }
});

const invitesDialog = $('#access-invites'), invitesStatus = $('#access-invites-status');
let inviteGeneration = 0;
function userOptions(select, requests, { anyone = false, selected = '' } = {}) {
  select.replaceChildren();
  if (anyone) select.add(new Option('Anyone with the code', ''));
  for (const request of requests) select.add(new Option(`${request.name}${request.email ? ` · ${request.email}` : ''} (${request.userId})`, request.userId));
  select.value = selected;
}
async function loadInvites() {
  const generation = ++inviteGeneration;
  if (!invitesDialog.open) invitesDialog.showModal();
  invitesStatus.textContent = 'Loading invitations…';
  $('#access-invites-list').replaceChildren();
  try {
    const [{ invites }, { requests }] = await Promise.all([api('/api/waitlist/invites'), isAdmin ? api('/api/waitlist/requests') : Promise.resolve({ requests: [] })]);
    if (generation !== inviteGeneration || !invitesDialog.open) return;
    $('#access-invites-title').textContent = isAdmin ? 'Manage invitations' : 'Your invitations';
    $('#access-invite-issue').hidden = !isAdmin;
    if (isAdmin) {
      const owners = requests.filter(r => r.status === 'approved');
      if (!owners.some(r => r.userId === session.user.id)) owners.unshift({ userId: session.user.id, name: session.user.name });
      userOptions($('#access-invite-owner'), owners, { selected: session.user.id });
      userOptions($('#access-invite-assignee'), requests.filter(r => r.status === 'pending'), { anyone: true });
    }
    invitesStatus.textContent = invites.length ? `${invites.filter(i => i.status === 'active').length} active · ${invites.length} total` : 'No invitations available.';
    for (const invite of invites) {
      const row = document.createElement('article');
      const details = document.createElement('p');
      details.textContent = `${invite.status} · Expires ${new Date(invite.expiresAt).toLocaleString()}${invite.assignedUserId ? ' · Assigned to a specific user' : ''}`;
      row.append(details);
      if (isAdmin) {
        const owner = document.createElement('p'); owner.textContent = `Owner: ${requests.find(r => r.userId === invite.ownerId)?.email || invite.ownerId}`; row.append(owner);
      }
      if (invite.status === 'active') {
        const code = document.createElement('code'); code.textContent = invite.code; row.append(code);
        const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy invite';
        copy.addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(invite.code); invitesStatus.textContent = 'Invite copied. Share it privately with one person.'; }
          catch { invitesStatus.textContent = 'Select the code to copy it manually.'; }
        }); row.append(copy);
        if (isAdmin) {
          const form = document.createElement('form'); form.className = 'access-form';
          const label = document.createElement('label'); label.textContent = 'Assign this invite to';
          const select = document.createElement('select'); select.id = `assign-${invite.id}`; label.htmlFor = select.id;
          userOptions(select, requests, { anyone: true, selected: invite.assignedUserId ?? '' });
          const assign = document.createElement('button'); assign.type = 'submit'; assign.textContent = 'Save assignment';
          form.append(label, select, assign);
          form.addEventListener('submit', async event => {
            event.preventDefault(); assign.disabled = true;
            try { await post('/api/waitlist/invite-update', { id: invite.id, assignedUserId: select.value || null }); await loadInvites(); }
            catch { invitesStatus.textContent = 'Couldn’t assign this invite. Refresh and try again.'; assign.disabled = false; }
          }); row.append(form);
          const expire = document.createElement('button'); expire.type = 'button'; expire.textContent = 'Expire now';
          expire.addEventListener('click', async () => {
            expire.disabled = true;
            try { await post('/api/waitlist/invite-update', { id: invite.id, expire: true }); await loadInvites(); }
            catch { invitesStatus.textContent = 'Couldn’t expire this invite. Refresh and try again.'; expire.disabled = false; }
          }); row.append(expire);
        }
      }
      $('#access-invites-list').append(row);
    }
  } catch { invitesStatus.textContent = 'Invitations are unavailable. Please try again.'; }
}
$('#access-invite-issue').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try { await post('/api/waitlist/invite-issue', { ownerId: $('#access-invite-owner').value, assignedUserId: $('#access-invite-assignee').value || null }); await loadInvites(); }
  catch { invitesStatus.textContent = 'Couldn’t create an invite. Refresh and try again.'; }
  finally { button.disabled = false; }
});
$('#access-invites-open').addEventListener('click', loadInvites);
dismissOnOutsideClick(invitesDialog, () => invitesDialog.close());
$('#access-invites-close').addEventListener('click', () => invitesDialog.close());
invitesDialog.addEventListener('close', () => { inviteGeneration++; });

async function loadRequests() {
  const generation = ++reviewGeneration;
  if (review.hidden) {
    const settings = $('#settings-dialog[open]');
    restoreReviewSettings = Boolean(settings);
    settings?.close();
  }
  review.hidden = false;
  $('.app-shell').inert = true;
  $('#access-review-title').focus({ preventScroll: true });
  reviewStatus.textContent = 'Loading requests…';
  reviewList.replaceChildren();
  try {
    const { requests } = await api('/api/waitlist/requests');
    if (generation !== reviewGeneration || review.hidden) return;
    const pending = requests.filter(request => request.status === 'pending').length;
    reviewStatus.textContent = requests.length ? `${pending} awaiting approval · ${requests.length} total` : 'No requests yet.';
    for (const request of [...requests].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending'))) {
      const row = document.createElement('div'); row.className = 'access-request';
      const person = document.createElement('span'); person.textContent = `${request.name}${request.email ? ` · ${request.email}` : ''} · ${request.status}`;
      row.append(person);
      // The name this resident will be known by: editable until they are approved.
      const username = document.createElement('input');
      username.className = 'access-request-username'; username.value = request.username ?? ''; username.maxLength = 39;
      username.autocapitalize = 'off'; username.spellcheck = false; username.readOnly = request.status === 'approved';
      username.setAttribute('aria-label', `Username for ${request.name}`);
      row.append(username);
      const editedName = () => { const value = username.value.trim(); return value && value !== (request.username ?? '') ? value : undefined; };
      if (request.status !== 'approved') {
        const saveName = document.createElement('button'); saveName.type = 'button'; saveName.textContent = 'Save name';
        saveName.setAttribute('aria-label', `Save username for ${request.name}`);
        saveName.addEventListener('click', async () => {
          saveName.disabled = true;
          try {
            const result = await post('/api/waitlist/username', { userId: request.userId, username: username.value.trim() });
            request.username = result.username; username.value = result.username;
            reviewStatus.textContent = `${request.name} will be known as ${result.username}.`;
          } catch (error) { reviewStatus.textContent = usernameError(error); }
          finally { saveName.disabled = false; }
        });
        row.append(saveName);
      }
      const identifier = document.createElement('code');
      identifier.className = 'access-request-id';
      identifier.textContent = 'User ID hidden';
      row.append(identifier);
      const reveal = document.createElement('button'); reveal.type = 'button'; reveal.textContent = 'Reveal ID';
      reveal.setAttribute('aria-label', `Reveal user ID for ${request.name}`);
      reveal.setAttribute('aria-pressed', 'false');
      reveal.addEventListener('click', () => {
        const visible = reveal.getAttribute('aria-pressed') !== 'true';
        identifier.textContent = visible ? request.userId : 'User ID hidden';
        reveal.textContent = visible ? 'Hide ID' : 'Reveal ID';
        reveal.setAttribute('aria-label', `${visible ? 'Hide' : 'Reveal'} user ID for ${request.name}`);
        reveal.setAttribute('aria-pressed', String(visible));
      });
      row.append(reveal);
      const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy ID';
      copy.setAttribute('aria-label', `Copy user ID for ${request.name}`);
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(request.userId);
          reviewStatus.textContent = `User ID copied for ${request.name}.`;
        } catch { reviewStatus.textContent = 'Could not copy the user ID. Reveal it to copy manually.'; }
      });
      row.append(copy);
      const actions = request.status === 'pending' ? [['Approve', true], ['Decline', false]]
        : request.status === 'approved' ? [['Revoke', false]] : [['Approve', true]];
      for (const [label, approved] of actions) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            // A name edited in the row goes with the decision; a refused name refuses it.
            const named = approved && editedName();
            await api('/api/waitlist/decision', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ userId: request.userId, approved, ...(named ? { username: named } : {}) }) });
            if (!review.hidden) await loadRequests();
          } catch (error) {
            reviewStatus.textContent = error.message?.startsWith('username_') ? usernameError(error) : 'Could not save that decision. Try again.';
            button.disabled = false;
          }
        });
        row.append(button);
      }
      reviewList.append(row);
    }
  } catch { reviewStatus.textContent = 'Requests are unavailable. Try again shortly.'; }
}

retry.addEventListener('click', checkAccess);
adminButton.addEventListener('click', loadRequests);
function closeReview() {
  reviewGeneration++; review.hidden = true; $('.app-shell').inert = false;
  if (restoreReviewSettings) $('#settings-toggle')?.click();
  restoreReviewSettings = false;
  adminButton.focus();
}
dismissOnOutsideClick(review, closeReview, review.querySelector('.access-review-card'));
$('#access-review-close').addEventListener('click', closeReview);
review.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeReview(); }
});
async function signout() {
  try {
    const { url } = await api('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session.csrfToken } });
    endSplash({ forget: true });
    location.assign(url ?? '/');
  } catch { message.textContent = 'Sign-out failed. Try again.'; gate.hidden = false; }
}
$('#access-signout').addEventListener('click', signout);
gateSignout.addEventListener('click', signout);

await checkAccess();
setInterval(checkAccess, 15_000);
