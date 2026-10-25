import { timingSafeEqual } from 'node:crypto';

// In-app account deletion (#292, App Review guideline 5.1.1(v)), behind
// RIVER_OAKS_ACCOUNT_DELETION=1. A signed-in resident confirms with the exact phrase,
// within ten minutes of signing in. The sign-in provider deletes the account first,
// so nobody can sign in to it again; then every store forgets it, twice, the second
// time for a write that was already in flight. If erasure fails after the provider
// deleted the account, the provider's user.deleted webhook runs it again, with
// retries. Approval and bans are not checked: anyone who can sign in can leave.
export const DELETION_PHRASE = 'delete my account';
export const RECENT_SIGN_IN_MS = 10 * 60_000;
const PATH = '/api/account/delete';
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// The flag turns deletion on only where a failed erasure is retried: with WorkOS, the
// signed user.deleted webhook must be configured. The loopback fixture sign-in has no
// provider account to delete, so the flag alone is enough there.
export function accountDeletionEnabled(env, { development = false } = {}) {
  if (env.RIVER_OAKS_ACCOUNT_DELETION !== '1') return false;
  if (development || env.WORKOS_WEBHOOK_SECRET) return true;
  console.warn(JSON.stringify({ event: 'account_deletion_off', reason: 'webhook_secret_missing' }));
  return false;
}

export function createAccountDeletionRoute({ enabled = false, auth, security, origin, eraseAccount, now = Date.now }) {
  if (enabled && (typeof auth?.deleteProviderUser !== 'function' || typeof auth.clearSession !== 'function' || typeof eraseAccount !== 'function'))
    throw new TypeError('Invalid account deletion');
  const recent = user => Number.isFinite(user.signedInAt) && now() - user.signedInAt >= 0 && now() - user.signedInAt <= RECENT_SIGN_IN_MS;
  return async function accountDeletionRequest(req, res) {
    if (new URL(req.url, origin).pathname !== PATH) return false;
    // The client asks before it shows the control; with the flag off it stays hidden.
    if (req.method === 'GET') {
      const user = enabled ? await auth.authenticate(req) : null;
      json(res, 200, user ? { available: true, recent: recent(user) } : { available: false });
      return true;
    }
    if (!enabled) return false;
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); json(res, 405, { error: 'Use POST.' }); return true; }
    const user = await auth.authenticate(req);
    if (!user) { json(res, 401, { error: 'Sign in to delete your account.' }); return true; }
    if (req.headers.origin !== origin || !equal(req.headers['x-csrf-token'], user.csrfToken)) {
      json(res, 403, { error: 'Deleting an account needs this page’s security token. Reload and try again.' }); return true;
    }
    if (!await security.allow('account_deletion', user.userId, 3, 3_600_000)) { json(res, 429, { error: 'Please wait before trying again.' }); return true; }
    let body;
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 256) throw new Error('Too large'); chunks.push(chunk); }
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch { body = null; }
    if (body?.confirm !== DELETION_PHRASE) { json(res, 400, { error: `Type “${DELETION_PHRASE}” to confirm.` }); return true; }
    if (!recent(user)) { json(res, 403, { error: 'Sign in again, then delete your account within ten minutes.', reason: 'sign_in_again' }); return true; }
    try { await auth.deleteProviderUser(user.userId); }
    catch {
      // Nothing is erased while the account may still sign in. If WorkOS deleted the user
      // but the answer was lost, its user.deleted webhook erases the account.
      console.warn(JSON.stringify({ event: 'account_deletion_unavailable' }));
      json(res, 502, { error: 'We couldn’t delete your account right now. Try again later.' }); return true;
    }
    auth.clearSession(res);
    try { await eraseAccount(user.userId); await eraseAccount(user.userId); }
    catch {
      json(res, 503, { deleted: true, complete: false, error: 'Your account is deleted. Some of its data is still being removed, and that finishes on its own.' }); return true;
    }
    json(res, 200, { deleted: true, complete: true });
    return true;
  };
}
