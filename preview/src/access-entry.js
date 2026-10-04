import './access-gate.css';

const $ = selector => document.querySelector(selector);
const gate = $('#access-gate'), message = $('#access-message'), providers = $('#access-providers');
const retry = $('#access-retry'), tools = $('#access-tools'), adminButton = $('#access-admin');
const gateSignout = $('#access-gate-signout');
const review = $('#access-review'), reviewList = $('#access-review-list'), reviewStatus = $('#access-review-status');
let session = null, entered = false, checking = false, gateState = '';
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
      message.textContent = 'Sign in with GitHub to request a place.';
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
    adminButton.hidden = !access.admin;
    if (access.status !== 'approved') {
      if (entered) location.reload();
      providers.hidden = true;
      message.textContent = access.status === 'rejected'
        ? 'Your request has not been approved. Contact the district team if you think this is a mistake.'
        : 'Your waitlist request is in. An approver will review it before you can play.';
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
    message.textContent = 'Access could not be checked. Try again shortly.';
  } finally { checking = false; }
}

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
