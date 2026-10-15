// The play links' label. A signed-in resident who already has access is invited straight in;
// the check is the one the game makes on load (/api/waitlist/status, same origin). Signed out,
// waiting, or any failure keeps the waitlist invitation, so the page never claims unconfirmed access.
export const PLAY_LABELS = Object.freeze({ approved: 'Enter River Oaks', waitlist: 'Join the waitlist' });

export const playLabel = status => (status && typeof status === 'object' && status.status === 'approved' ? PLAY_LABELS.approved : PLAY_LABELS.waitlist);

export async function accessLabel(request = (...args) => fetch(...args)) {
  try {
    const response = await request('/api/waitlist/status', { credentials: 'same-origin', cache: 'no-store' });
    return playLabel(response.ok ? await response.json() : null);
  } catch { return PLAY_LABELS.waitlist; }
}

// The hero link, and the same link inside every detail panel's template (cloned when opened).
export function applyPlayLabel(doc, label) {
  for (const root of [doc, ...Array.from(doc.querySelectorAll('template'), template => template.content)])
    for (const element of root.querySelectorAll('.play-label')) element.textContent = label;
}
