import './access-gate.css';

const $ = selector => document.querySelector(selector);
const gate = $('#access-gate'), message = $('#access-message'), providers = $('#access-providers');
const retry = $('#access-retry'), tools = $('#access-tools'), adminButton = $('#access-admin');
const gateSignout = $('#access-gate-signout');
const review = $('#access-review'), reviewList = $('#access-review-list'), reviewStatus = $('#access-review-status');
let session = null, entered = false, checking = false, gateState = '', isAdmin = false;
const inviteForm = $('#access-invite-form'), redeemButton = $('#access-invite-redeem');
let reviewGeneration = 0;

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Access is unavailable');
  return body;
}

async function checkAccess() {
  if (checking) return;
  checking = true;
  retry.hidden = true;
  try {
    session = await api('/auth/session');
    if (!session.authenticated) {
      if (entered) location.reload();
      tools.hidden = true; gateSignout.hidden = true; providers.hidden = false;
      inviteForm.hidden = false; redeemButton.disabled = true;
      message.textContent = 'Join with your email or GitHub. Access is waitlist only unless you have an invite.';
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
    if (access.status !== 'approved') {
      if (entered) location.reload();
      providers.hidden = true;
      inviteForm.hidden = access.status === 'rejected'; redeemButton.disabled = false;
      message.textContent = access.status === 'rejected'
        ? 'Your request has not been approved. Contact the district team if you think this is a mistake.'
        : 'You’re on the waitlist. An admin can approve you, or you can redeem an invite below.';
      if (gateState !== access.status) $('#access-title').focus({ preventScroll: true });
      gateState = access.status;
      return;
    }
    if (!entered) {
      entered = true;
      document.body.dataset.accountId = session.user.id;
      document.body.classList.add('access-granted');
      gate.hidden = true;
      await import('./main.js');
    }
  } catch {
    if (entered) location.reload();
    providers.hidden = true; retry.hidden = false;
    redeemButton.disabled = true;
    message.textContent = 'Access could not be checked. Try again shortly.';
  } finally { checking = false; }
}

const post = (path, data) => api(path, { method: 'POST', headers: {
  'Content-Type': 'application/json', ...(session?.csrfToken ? { 'X-CSRF-Token': session.csrfToken } : {}),
}, body: JSON.stringify(data) });

$('#access-email-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button'); button.disabled = true;
  try {
    const result = await post('/auth/email/start', { email: $('#access-email').value.trim() });
    if (!result.sent) {
      $('#access-email-status').textContent = 'A code was requested recently. Use it in the browser where you requested it, or wait a minute and request another here.';
      return;
    }
    $('#access-email-verify').hidden = false;
    $('#access-email-status').textContent = 'Check your inbox for a six-digit code. It expires in 10 minutes. Wait a minute before requesting another.';
    $('#access-email-code').focus();
  } catch { $('#access-email-status').textContent = 'We couldn’t send a code. Check your email address and try again shortly.'; }
  finally { button.disabled = false; }
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
$('#access-invites-close').addEventListener('click', () => invitesDialog.close());
invitesDialog.addEventListener('close', () => { inviteGeneration++; });

async function loadRequests() {
  const generation = ++reviewGeneration;
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
            await api('/api/waitlist/decision', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ userId: request.userId, approved }) });
            if (!review.hidden) await loadRequests();
          } catch { reviewStatus.textContent = 'Could not save that decision. Try again.'; button.disabled = false; }
        });
        row.append(button);
      }
      reviewList.append(row);
    }
  } catch { reviewStatus.textContent = 'Requests are unavailable. Try again shortly.'; }
}

retry.addEventListener('click', checkAccess);
adminButton.addEventListener('click', loadRequests);
function closeReview() { reviewGeneration++; review.hidden = true; $('.app-shell').inert = false; adminButton.focus(); }
$('#access-review-close').addEventListener('click', closeReview);
review.addEventListener('keydown', event => { if (event.key === 'Escape') closeReview(); });
async function signout() {
  try {
    const { url } = await api('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': session.csrfToken } });
    location.assign(url ?? '/');
  } catch { message.textContent = 'Sign-out failed. Try again.'; gate.hidden = false; }
}
$('#access-signout').addEventListener('click', signout);
gateSignout.addEventListener('click', signout);

await checkAccess();
setInterval(checkAccess, 15_000);
