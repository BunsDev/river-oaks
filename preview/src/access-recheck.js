// The district rechecks access every 15 s while a resident plays. Any answer from the
// server (signed out, another account, not approved, or an error) sends the page back
// through the gate. A check that got no answer at all says nothing about access: the
// network dropped, and reloading then would trade the district for the browser's
// offline page. The next check, or the one when the network returns, decides.
export async function answeredFetch(fetcher, ...args) {
  try { return await fetcher(...args); }
  catch (error) { throw Object.assign(error, { unanswered: true }); }
}

export const reloadAfterFailedCheck = (entered, error) => entered && !error?.unanswered;

// The town connection reads the session on every connect. When it finds another account
// than the one this page entered as (signed in elsewhere in this browser), it says so, and
// the gate rechecks at once instead of at its next 15 s check. The page then reloads into
// that account before anything else runs on it under the old one.
export const ACCOUNT_CHANGED = 'river-oaks:account-changed';

export function noticeSessionAccount(userId, { body = globalThis.document?.body, target = globalThis } = {}) {
  const entered = body?.dataset?.accountId;
  if (!entered || !userId || userId === entered) return false;
  target.dispatchEvent(new Event(ACCOUNT_CHANGED));
  return true;
}
