import { accountName } from '../preview/src/resident-names.js';

/** Shared HTTP behavior for blocking, local and Redis backed (#292). */
export async function blockAction({ action, identity, blocks, social, readBody, visiblePlayer, allowWrite, separated }) {
  if (!blocks) return { status: 503, value: { error: 'Blocking is unavailable.' } };
  if (action === 'list') return { status: 200, value: { blocked: (await blocks.list(identity.userId)).map(item => ({ id: item.id, name: accountName(item.id, item.name) })) } };
  if (!['add', 'remove'].includes(action)) return { status: 404, value: { error: 'Not found.' } };
  let data;
  try { data = await readBody(); } catch { return { status: 400, value: { error: 'Invalid block request.' } }; }
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => key !== 'peerId')
    || typeof data.peerId !== 'string' || !data.peerId.length || data.peerId.length > 160 || data.peerId === identity.userId) {
    return { status: 400, value: { error: 'Invalid resident.' } };
  }
  if (!await allowWrite(identity.userId)) return { status: 429, value: { error: 'Please wait before changing blocks.' } };
  if (action === 'remove') {
    // No contact can begin during a block, so one still here was left by a failed
    // removal; it ends before the block lifts, and contacts never come back on unblock.
    // Without this resident's own block there is nothing to lift, and a contact stays.
    if ((await blocks.list(identity.userId)).some(item => item.id === data.peerId)) await social?.remove(identity.userId, data.peerId);
    const result = await blocks.remove(identity.userId, data.peerId);
    if (!result.ok) return { status: 400, value: { error: 'Invalid resident.' } };
    await settle(separated, identity.userId, data.peerId, false);
    return { status: 200, value: { ok: true } };
  }
  // A resident can be blocked from where they are met: in this world, or as a contact.
  const seen = await visiblePlayer(identity, data.peerId);
  const contact = seen ? null : (await social?.list(identity.userId))?.find(item => item.peer.id === data.peerId);
  const name = seen?.name ?? contact?.peer.name;
  if (!name) return { status: 404, value: { error: 'Resident not found.' } };
  const result = await blocks.add(identity.userId, { userId: data.peerId, name });
  if (!result.ok) return result.reason === 'limit' ? { status: 429, value: { error: 'Block limit reached.' } } : { status: 400, value: { error: 'Invalid resident.' } };
  // A block ends the contact, with its messages and invitations, in both directions. The
  // block stands once stored; if the contact cannot be ended, asking again ends it, and
  // meanwhile it stays out of both contact lists and group invitations. Invitations in
  // the worlds end, and open sockets hear of the block, either way.
  try { await social?.remove(identity.userId, data.peerId); }
  catch { return { status: 503, value: { error: 'Blocked, but the contact could not be ended yet. Try again.' } }; }
  finally { await settle(separated, identity.userId, data.peerId, true); }
  return { status: 200, value: { ok: true } };
}

// Ending invitations and reaching open sockets is best effort: every request checks the
// block anyway, and sockets catch up at the next sync.
async function settle(separated, a, b, blocked) {
  try { await separated?.(a, b, blocked); } catch { console.warn(JSON.stringify({ event: 'block_separation_incomplete', blocked })); }
}
