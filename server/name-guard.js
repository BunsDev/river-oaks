import { accountName } from '../preview/src/resident-names.js';

// Stored copies of resident names (contacts, messages, groups, waitlist) were
// written with whatever name a session had at the time. Each is checked again
// on the way out against the account it belongs to, so only Jevica's accounts
// ever read as Jevica, including records saved before residents were named by
// GitHub username. Group, event and place titles are not resident names and
// are left alone.
const named = (value, idKey = 'id', nameKey = 'name') =>
  value && typeof value === 'object' && nameKey in value ? { ...value, [nameKey]: accountName(value[idKey], value[nameKey]) } : value;

export const guardMessage = value => named(value, 'authorId', 'authorName');
export const guardContact = item => item && typeof item === 'object'
  ? { ...item, peer: named(item.peer), ...('latest' in item ? { latest: guardMessage(item.latest) } : {}) } : item;
export const guardWaitlistRequest = value => named(value, 'userId', 'name');

export function guardGroup(group) {
  if (!group || typeof group !== 'object') return group;
  return { ...group,
    ...('ownerName' in group ? { ownerName: accountName(group.ownerId, group.ownerName) } : {}),
    ...('latest' in group ? { latest: guardMessage(group.latest) } : {}),
    ...(Array.isArray(group.members) ? { members: group.members.map(member => named(member)) } : {}),
    ...(Array.isArray(group.invites) ? { invites: group.invites.map(invite => named(invite)) } : {}),
    ...(Array.isArray(group.messages) ? { messages: group.messages.map(guardMessage) } : {}),
  };
}

// An action result may carry the changed contact, group or message.
export const guardResult = result => result && typeof result === 'object' ? { ...result,
  ...(result.contact ? { contact: guardContact(result.contact) } : {}),
  ...(result.group ? { group: guardGroup(result.group) } : {}),
  ...(result.message ? { message: guardMessage(result.message) } : {}),
} : result;
