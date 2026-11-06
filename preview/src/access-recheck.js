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

// The town client (session-account-notice.js) dispatches this when its connection reads
// another account than the one this page entered as; the gate then rechecks at once.
// The game side defines the name separately: the access entry must not share a module with
// game code (scripts/check-access-entry.mjs), and a test keeps the two names equal.
export const ACCOUNT_CHANGED = 'river-oaks:account-changed';
