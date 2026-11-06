// The town connection reads the session on every connect. When it finds another account
// than the one this page entered as (signed in elsewhere in this browser), it says so, and
// access-entry rechecks at once instead of at its next 15 s check. The page then reloads
// into that account rather than running on under the old one's entry state.
// Game-side only: access-entry listens for the same name from access-recheck.js.
export const ACCOUNT_CHANGED = 'river-oaks:account-changed';

export function noticeSessionAccount(userId, { body = globalThis.document?.body, target = globalThis } = {}) {
  const entered = body?.dataset?.accountId;
  if (!entered || !userId || userId === entered) return false;
  target.dispatchEvent(new Event(ACCOUNT_CHANGED));
  return true;
}
