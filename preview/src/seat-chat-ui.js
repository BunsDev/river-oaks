import { seatClusterIndex } from './seat-clusters.js';
import './seat-chat.css';

// Seat chat panel (#825 slice 4). Shown only to someone seated in a cluster, or who has a request
// or conversation to deal with. The town decides everything: this draws the account's private
// view and sends what the person chooses. Nothing here is colour alone: every state has words.
// Each signature change rebuilds only the part that changed, so typing and focus survive frames.

export function createSeatChatPanel({ host, getTown, getWorld, focusScene = () => {}, onEnded = () => {} }) {
  const panel = document.createElement('section'); panel.className = 'seat-chat'; panel.hidden = true; panel.setAttribute('aria-label', 'Seat conversation');
  const heading = document.createElement('h3'); heading.textContent = 'Seat conversation';
  const privacy = document.createElement('p'); privacy.className = 'seat-chat-note';
  const invites = document.createElement('div'); invites.className = 'seat-chat-invites';
  const people = document.createElement('div'); people.className = 'seat-chat-people';
  const pending = document.createElement('div'); pending.className = 'seat-chat-pending';
  const log = document.createElement('div'); log.className = 'seat-chat-log'; log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'polite'); log.setAttribute('tabindex', '0'); log.hidden = true;
  const form = document.createElement('form'); form.className = 'seat-chat-form'; form.hidden = true;
  const label = document.createElement('label'); label.htmlFor = 'seat-chat-input';
  const input = document.createElement('input'); input.id = 'seat-chat-input'; input.maxLength = 280; input.autocomplete = 'off';
  const send = document.createElement('button'); send.type = 'submit';
  const leave = document.createElement('button'); leave.type = 'button'; leave.className = 'seat-chat-leave'; leave.textContent = 'Leave conversation';
  form.append(label, input, send, leave);
  const status = document.createElement('p'); status.className = 'seat-chat-status'; status.setAttribute('role', 'status');
  panel.append(heading, privacy, invites, people, pending, log, form, status);
  host.append(panel);

  let indexWorld = null, index = new Map(), sessionId = null, peerName = null, busy = false, signature = '', logCount = -1, lastPaint = -Infinity, pendingFocus = false;
  const say = text => { status.textContent = text ?? ''; };
  const clusterIndex = () => { const world = getWorld(); if (world !== indexWorld) { indexWorld = world; index = world ? seatClusterIndex(world) : new Map(); } return index; };
  const request = async (message, done) => {
    const town = getTown();
    if (busy || !town) return null;
    busy = true;
    try {
      const result = await town.command(message);
      if (!result.ok) say(result.message ?? 'The town could not confirm that.');
      else { say('');done?.(result); }
      return result;
    } catch (error) { say(error.message); return null; }
    finally { busy = false; lastPaint = -Infinity; }
  };
  const button = (text, name, onClick) => { const item = document.createElement('button'); item.type = 'button'; item.textContent = text; if (name) item.setAttribute('aria-label', name); item.addEventListener('click', onClick); return item; };

  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || sessionId === null) return;
    const kept = input.value;
    input.value = '';
    void request({ type: 'seatChat', action: 'send', sessionId, text }).then(result => { if (!result?.ok && !input.value) input.value = kept; });
  });
  // Escape puts the words down without ending anything and gives the keys back to walking.
  input.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); input.blur(); focusScene(); } });
  input.addEventListener('keyup', event => event.stopPropagation());
  leave.addEventListener('click', () => { void request({ type: 'seatChat', action: 'leave' }); });

  function paint(view, self, peers) {
    const session = view?.session ?? null, outgoing = view?.outgoing ?? null, asked = view?.invites ?? [];
    const key = JSON.stringify([session?.id ?? null, session?.peer.name ?? null, outgoing?.to.id ?? null, asked.map(item => item.from.id), peers.map(peer => [peer.id, peer.name])]);
    if (key !== signature) {
      const hadFocus = panel.contains(document.activeElement) && document.activeElement !== input;
      signature = key;
      invites.replaceChildren(...asked.map(item => {
        const row = document.createElement('div'); row.className = 'seat-chat-invite';
        const words = document.createElement('p'); words.textContent = `${item.from.name} would like to talk.`;
        row.append(words,
          button('Accept', `Accept ${item.from.name}'s request to talk`, () => { void request({ type: 'seatChat', action: 'accept', peerId: item.from.id }, () => { pendingFocus = true; }); }),
          button('Not now', `Decline ${item.from.name}'s request to talk`, () => { void request({ type: 'seatChat', action: 'decline', peerId: item.from.id }); }));
        return row;
      }));
      people.replaceChildren(...(session || outgoing ? [] : peers.map(peer => button(`Ask ${peer.name} to talk`, null, () => { void request({ type: 'seatChat', action: 'invite', peerId: peer.id }); }))));
      if (!session && !outgoing && !peers.length && !asked.length) { const empty = document.createElement('p'); empty.className = 'seat-chat-empty'; empty.textContent = 'Nobody else is seated here.'; people.replaceChildren(empty); }
      const waiting = [];
      if (outgoing) { const words = document.createElement('p'); words.textContent = `You asked ${outgoing.to.name}. Waiting for an answer.`; waiting.push(words, button('Cancel request', `Cancel your request to ${outgoing.to.name}`, () => { void request({ type: 'seatChat', action: 'cancel' }); })); }
      pending.replaceChildren(...waiting);
      privacy.textContent = session ? `Only ${session.peer.name} can read this. Standing up ends it.` : 'Sitting here shares nothing. Words flow only after you both agree.';
      // Keyboard users keep their place when the button they pressed goes away.
      if (hadFocus && !panel.contains(document.activeElement)) (panel.querySelector('button:not([hidden])') ?? input).focus?.({ preventScroll: true });
    }
    const wasTalking = sessionId !== null;
    if (session?.id !== sessionId) {
      // Words typed for one conversation stay out of the next.
      if (sessionId !== null) input.value = '';
      sessionId = session?.id ?? null; logCount = -1;
      // A new conversation is not the one that ended.
      if (session) say('');
    }
    if (wasTalking && !session) { say(`Your conversation with ${peerName ?? 'them'} has ended.`); onEnded(); }
    peerName = session?.peer.name ?? null;
    log.hidden = form.hidden = !session;
    if (session) {
      label.textContent = `Message to ${session.peer.name}`;
      send.textContent = `Send to ${session.peer.name}`;
      if (logCount !== session.messages.length || log.dataset.last !== String(session.messages.at(-1)?.id ?? '')) {
        logCount = session.messages.length; log.dataset.last = String(session.messages.at(-1)?.id ?? '');
        log.replaceChildren(...session.messages.map(entry => {
          const row = document.createElement('p'), who = document.createElement('strong');
          who.textContent = entry.authorId === self ? 'You' : entry.authorName;
          row.append(who, ` ${entry.text}`);
          return row;
        }));
        log.scrollTop = log.scrollHeight;
      }
      if (pendingFocus) { pendingFocus = false; input.focus({ preventScroll: true }); }
    } else log.replaceChildren();
  }
  return {
    panel,
    update(now) {
      if (now - lastPaint < 150) return;
      lastPaint = now;
      const town = getTown(), snapshot = town?.snapshot, self = town?.identity?.id;
      const me = snapshot?.players?.find(player => player.id === self), view = snapshot?.seatChat ?? null, seatsById = clusterIndex();
      const buildId = me?.sitting?.buildId, seated = Boolean(buildId && seatsById.has(buildId));
      if (!seated && !view && sessionId === null) { panel.hidden = true; status.textContent = ''; signature = ''; return; }
      const peers = seated ? snapshot.players.filter(player => player.id !== self && seatsById.get(player.sitting?.buildId) === seatsById.get(buildId)) : [];
      panel.hidden = false;
      paint(view, self, peers);
    },
  };
}
