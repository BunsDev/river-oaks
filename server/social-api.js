import { guardContact, guardMessage, guardResult } from './name-guard.js';
import { ABSENT_RESIDENT } from './blocks.js';
import { screenText } from './content-filter.js';

/** Shared HTTP behavior for local and Redis backed resident relationships. */
export async function socialAction({ action, identity, social, presence, readBody, visiblePlayer, inviteWorld, invitePlace, allowWrite, blocks = null, contentFilter = null }) {
  if (!social) return { status: 503, value: { error: 'Contacts are unavailable.' } };
  if (action === 'list') {
    const hidden = blocks ? await blocks.hidden(identity.userId) : null;
    const contacts = (await social.list(identity.userId)).filter(item => !hidden?.has(item.peer.id)).map(guardContact);
    if (!presence) return { status: 200, value: { contacts } };
    const locations = await presence.getMany(contacts.filter(item => item.status === 'accepted').map(item => item.peer.id));
    return { status: 200, value: { contacts: contacts.map(item => item.status === 'accepted'
      ? { ...item, presence: locations.get(item.peer.id) ?? null } : item) } };
  }
  let data;
  try { data = await readBody(); } catch { return { status: 400, value: { error: 'Invalid contact request.' } }; }
  if (!data || typeof data.peerId !== 'string' || !data.peerId.length || data.peerId.length > 160 || data.peerId === identity.userId) {
    return { status: 400, value: { error: 'Invalid resident.' } };
  }
  // A block either way answers exactly as a resident who is not here or not a contact
  // (#292): every check below is asked about a resident who is never present, so the
  // answer comes from the same check, in the same order, as for one who left.
  const blocked = Boolean(blocks) && await blocks.between(identity.userId, data.peerId);
  const peerId = blocked && action !== 'remove' ? ABSENT_RESIDENT : data.peerId;
  if (action === 'messages') {
    const messages = await social.messages(identity.userId, peerId);
    return messages ? { status: 200, value: { messages: messages.map(guardMessage) } } : { status: 404, value: { error: 'Contact not found.' } };
  }
  if (!['request', 'accept', 'remove', 'send', 'invite-world', 'invite-place'].includes(action)) return { status: 404, value: { error: 'Not found.' } };
  if (!await allowWrite(identity.userId)) return { status: 429, value: { error: 'Please wait before changing contacts.' } };
  let result;
  if (action === 'request') {
    const target = await visiblePlayer(identity, peerId);
    if (!target) return { status: 409, value: { error: 'Meet this resident in the same world first.' } };
    result = await social.request(identity, { userId: target.id, name: target.name });
    // A block made while this request was in flight still ends it.
    if (result.ok && blocks && await blocks.between(identity.userId, target.id)) {
      await social.remove(identity.userId, target.id);
      return { status: 409, value: { error: 'Meet this resident in the same world first.' } };
    }
  } else if (action === 'accept') result = await social.accept(identity.userId, peerId);
  else if (action === 'remove') result = await social.remove(identity.userId, data.peerId);
  else if (action === 'invite-world') {
    if(Object.keys(data).some(key=>key!=='peerId'))return {status:400,value:{error:'Invalid world invitation.'}};
    const world=await inviteWorld?.(identity);
    if(!world)return {status:409,value:{error:'Join the world before inviting a contact.'}};
    result=await social.inviteWorld(identity,peerId,world);
  }
  else if (action === 'invite-place') {
    if(Object.keys(data).some(key=>!['peerId','placeId'].includes(key))
      || typeof data.placeId!=='string' || !/^(arrival|(?:spot|shop):[\w.:-]{1,80})$/.test(data.placeId))
      return {status:400,value:{error:'Invalid place invitation.'}};
    const destination=await invitePlace?.(identity,data.placeId);
    if(!destination)return {status:409,value:{error:'Join the world and select an available place.'}};
    result=await social.invitePlace(identity,peerId,destination.world,destination.place);
  }
  else {
    // The content filter (#292) screens a message before the store sees it; a refusal is 400, as for invalid text.
    const screened = screenText(contentFilter, 'message', data.text);
    if (!screened.ok) return { status: 400, value: { error: screened.message, reason: screened.reason } };
    result = await social.send(identity, peerId, screened.text);
  }
  if (result.ok) return { status: 200, value: guardResult(result) };
  const status = result.reason === 'invalid' ? 400 : result.reason === 'limit' ? 429 : 409;
  return { status, value: { error: result.reason === 'existing' ? 'A contact invitation already exists.'
    : result.reason === 'limit' ? 'Contact limit reached.'
    : result.reason === 'invalid' ? 'Invalid contact request.' : 'Contact is no longer available.' } };
}
