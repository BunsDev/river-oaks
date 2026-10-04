/** Shared HTTP behavior for local and Redis backed resident relationships. */
export async function socialAction({ action, identity, social, readBody, visiblePlayer, allowWrite }) {
  if (!social) return { status: 503, value: { error: 'Contacts are unavailable.' } };
  if (action === 'list') return { status: 200, value: { contacts: await social.list(identity.userId) } };
  let data;
  try { data = await readBody(); } catch { return { status: 400, value: { error: 'Invalid contact request.' } }; }
  if (!data || typeof data.peerId !== 'string' || !data.peerId.length || data.peerId.length > 160 || data.peerId === identity.userId) {
    return { status: 400, value: { error: 'Invalid resident.' } };
  }
  if (action === 'messages') {
    const messages = await social.messages(identity.userId, data.peerId);
    return messages ? { status: 200, value: { messages } } : { status: 404, value: { error: 'Contact not found.' } };
  }
  if (!['request', 'accept', 'remove', 'send'].includes(action)) return { status: 404, value: { error: 'Not found.' } };
  if (!await allowWrite(identity.userId)) return { status: 429, value: { error: 'Please wait before changing contacts.' } };
  let result;
  if (action === 'request') {
    const target = await visiblePlayer(identity, data.peerId);
    if (!target) return { status: 409, value: { error: 'Meet this resident in the same world first.' } };
    result = await social.request(identity, { userId: target.id, name: target.name });
  } else if (action === 'accept') result = await social.accept(identity.userId, data.peerId);
  else if (action === 'remove') result = await social.remove(identity.userId, data.peerId);
  else result = await social.send(identity, data.peerId, data.text);
  if (result.ok) return { status: 200, value: result };
  const status = result.reason === 'invalid' ? 400 : result.reason === 'limit' ? 429 : 409;
  return { status, value: { error: result.reason === 'existing' ? 'A contact invitation already exists.'
    : result.reason === 'limit' ? 'Contact limit reached.'
    : result.reason === 'invalid' ? 'Invalid contact request.' : 'Contact is no longer available.' } };
}
