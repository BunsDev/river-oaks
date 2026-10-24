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
