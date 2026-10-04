import { createProfileUI } from './profile-ui.js';
import { worldVisitUrl } from './world-portal.js';
import { placeLink } from './places.js';

const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
};

export function createSocialUI({ panel, request, profileRequest, connected, selfId, getMeetingPlaces = () => [] }) {
  const section = node('section', null, 'multiplayer-social');
  section.setAttribute('aria-label', 'Contacts and private messages');
  const title = node('h3', 'Contacts'), status = node('p', null, 'multiplayer-social-status');
  status.setAttribute('role', 'status');
  const contacts = node('div', null, 'multiplayer-social-contacts');
  const conversation = node('div', null, 'multiplayer-social-conversation');
  section.append(title, contacts, conversation, status);
  panel.querySelector('.multiplayer-chat')?.after(section);
  const profiles=createProfileUI({host:section,request:profileRequest,selfId});
  let items = [], selected = null, lastItems = '', lastMessages = '', busy = false, disposed = false;
  const call = (action, data = {}) => request(action, data);
  async function run(action, data, success) {
    status.textContent = '';
    try { await call(action, data); status.textContent = success; await refresh(true); }
    catch (error) { status.textContent = error.message; }
  }
  function renderContacts() {
    contacts.replaceChildren();
    if (!items.length) contacts.append(node('p', 'Meet another player to add a contact.'));
    for (const item of items) {
      const row = node('div', null, 'multiplayer-social-row');
      const label = node('span', item.peer.name);
      if (item.status === 'accepted') label.append(node('small', item.presence ? ` · Online in ${item.presence.title}` : ' · Offline'));
      row.append(label);
      if (item.status === 'accepted') {
        if (item.presence) {
          try {
            const visit = node('a', 'Join world');
            visit.href = worldVisitUrl(item.presence.worldId);
            visit.setAttribute('aria-label', `Join ${item.peer.name} in ${item.presence.title}`);
            row.append(visit);
          } catch { /* Ignore an invalid world from an old presence record. */ }
        }
        const profile=node('button','Profile');profile.type='button';profile.setAttribute('aria-label',`View profile for ${item.peer.name}`);
        profile.addEventListener('click',()=>profiles.inspect(item.peer));row.append(profile);
        const open = node('button', 'Message'); open.type = 'button';
        open.setAttribute('aria-label', `Message ${item.peer.name}`);
        open.addEventListener('click', () => { selected = item.peer.id; lastMessages = ''; renderConversation(); refreshMessages(); });
        row.append(open);
        const invite = node('button', 'Invite to world'); invite.type = 'button';
        invite.setAttribute('aria-label', `Invite ${item.peer.name} to this world`);
        invite.addEventListener('click', () => run('invite-world', { peerId: item.peer.id }, `World invitation sent to ${item.peer.name}.`));
        row.append(invite);
      } else if (item.direction === 'incoming') {
        row.append(node('small', 'wants to connect'));
        const accept = node('button', 'Accept'); accept.type = 'button';
        accept.addEventListener('click', () => run('accept', { peerId: item.peer.id }, 'Contact accepted.'));
        row.append(accept);
      } else row.append(node('small', 'invited'));
      const remove = node('button', item.status === 'accepted' ? 'Remove' : item.direction === 'incoming' ? 'Decline' : 'Cancel');
      remove.type = 'button'; remove.setAttribute('aria-label', `Remove ${item.peer.name}`);
      remove.addEventListener('click', () => run('remove', { peerId: item.peer.id }, 'Contact removed.'));
      row.append(remove); contacts.append(row);
    }
  }
  function renderConversation() {
    conversation.replaceChildren();
    const contact = items.find(item => item.peer.id === selected && item.status === 'accepted');
    if (!contact) { selected = null; return; }
    const heading = node('h4', `Private messages with ${contact.peer.name}`);
    const history = node('div', null, 'multiplayer-social-history');
    history.setAttribute('role', 'log'); history.setAttribute('aria-label', `Messages with ${contact.peer.name}`);
    const form = node('form', null, 'multiplayer-social-form');
    const input = node('input'), send = node('button', 'Send');
    input.type = 'text'; input.maxLength = 280; input.placeholder = 'Private message';
    input.setAttribute('aria-label', `Private message to ${contact.peer.name}`);
    send.type = 'submit'; form.append(input, send);
    form.addEventListener('submit', async event => {
      event.preventDefault(); const text = input.value.trim(); if (!text) return;
      send.disabled = true;
      try { await call('send', { peerId: contact.peer.id, text }); input.value = ''; status.textContent = ''; await refreshMessages(); }
      catch (error) { status.textContent = error.message; }
      finally { send.disabled = false; input.focus(); }
    });
    const meetingPlaces=getMeetingPlaces();
    if(meetingPlaces.length) {
      const meeting=node('div',null,'multiplayer-social-meeting');
      const label=node('label',`Meet ${contact.peer.name} at`);
      const select=node('select');
      select.setAttribute('aria-label',`Place to meet ${contact.peer.name}`);
      for(const place of meetingPlaces) {
        const option=node('option',place.name);option.value=place.id;select.append(option);
      }
      label.append(select);
      const invite=node('button','Invite to place');invite.type='button';
      invite.addEventListener('click',async()=>{
        invite.disabled=true;status.textContent='';
        try {
          await call('invite-place',{peerId:contact.peer.id,placeId:select.value});
          status.textContent=`Place invitation sent to ${contact.peer.name}.`;
          await refreshMessages();
        } catch(error) { status.textContent=error.message; }
        finally { invite.disabled=false; }
      });
      meeting.append(label,invite);conversation.append(heading,history,form,meeting);
    } else conversation.append(heading,history,form);
  }
  async function refreshMessages() {
    if (!selected || !connected()) return;
    try {
      const peer = selected, { messages } = await call('messages', { peerId: peer });
      if (peer !== selected) return;
      const serialized = JSON.stringify(messages);
      if (serialized === lastMessages) return;
      lastMessages = serialized;
      const history = conversation.querySelector('.multiplayer-social-history'); if (!history) return;
      const atEnd = history.scrollHeight - history.scrollTop - history.clientHeight < 24;
      history.replaceChildren(...messages.map(message => {
        const line = node('p');
        line.append(node('strong', message.authorId === selfId() ? 'You' : message.authorName), document.createTextNode(`: ${message.text}`));
        if (message.kind === 'world-invite' || message.kind === 'place-invite') {
          try {
            const place=message.kind==='place-invite';
            const link = node('a', place?`Meet at ${message.placeName}`:`Visit ${message.worldTitle}`);
            link.href = place?placeLink({id:message.placeId},worldVisitUrl(message.worldId)):worldVisitUrl(message.worldId);
            line.append(document.createTextNode(' '), link);
          } catch { /* Ignore an invalid world ID from old or malformed history. */ }
        }
        return line;
      }));
      if (atEnd) history.scrollTop = history.scrollHeight;
    } catch (error) { status.textContent = error.message; }
  }
  async function refresh(force = false) {
    if (disposed || busy || !connected() || (!force && document.visibilityState === 'hidden')) return;
    busy = true;
    try {
      const result = await call('list');
      const serialized = JSON.stringify(result.contacts);
      if (serialized !== lastItems) {
        lastItems = serialized; items = result.contacts;
        renderContacts();
        if (selected && !items.some(item => item.peer.id === selected && item.status === 'accepted')) { lastMessages = ''; renderConversation(); }
      }
      await refreshMessages();
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; }
  }
  const timer = setInterval(() => refresh(), 10_000);
  return {
    refresh,
    async invite(player) { await run('request', { peerId: player.id }, `Invitation sent to ${player.name}.`); },
    inspect:profiles.inspect,
    dispose() { disposed = true; clearInterval(timer); section.remove(); },
  };
}
