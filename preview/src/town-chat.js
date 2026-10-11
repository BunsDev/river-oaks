// Presentation only: messages, connection state and sending remain owned by the town client.
export function createTownChatDock(section) {
  const dock = document.createElement('details'); dock.className = 'town-chat-dock'; dock.open = true;
  const toggle = document.createElement('summary'); toggle.className = 'town-chat-toggle';
  toggle.innerHTML = '<span>Town chat <small>Everyone in this world</small></span><span class="chat-unread" aria-live="polite"></span><span aria-hidden="true">⌃</span>';
  const history = section.querySelector('.multiplayer-chat-history');
  const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'chat-jump'; jump.textContent = 'New messages ↓'; jump.hidden = true;
  history.after(jump);
  const empty = document.createElement('p'); empty.className = 'chat-empty'; empty.textContent = 'Say hello to the district.'; history.before(empty);
  section.querySelector('h3').hidden = true;
  dock.append(toggle, section); document.querySelector('#viewport').append(dock);
  let unread = 0;
  const badge = toggle.querySelector('.chat-unread');
  const atEnd = () => history.scrollHeight - history.scrollTop - history.clientHeight < 24;
  const showCount = () => { badge.textContent = unread ? `${unread} new` : ''; jump.hidden = !unread; };
  const markRead = () => { unread = 0; showCount(); };
  jump.addEventListener('click', () => { history.scrollTop = history.scrollHeight; markRead(); });
  history.addEventListener('scroll', () => { if (dock.open && dock.checkVisibility({ visibilityProperty: true }) && atEnd()) markRead(); });
  dock.addEventListener('toggle', () => {
    if (dock.open) {
      if (matchMedia('(max-width:900px)').matches) {
        document.querySelectorAll('.hud-space:not([hidden]) .hud-space-header button').forEach(button => button.click());
        document.querySelector('#community-close')?.click();
      }
    }
  });
  dock.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing) return;
    event.preventDefault(); event.stopPropagation(); dock.open = false; document.querySelector('#canvas-host').focus({ preventScroll: true });
  });
  return {
    beforeUpdate: () => dock.open && dock.checkVisibility({ visibilityProperty: true }) && atEnd(),
    updated({ added, initial, follow }) {
      empty.hidden = Boolean(history.children.length);
      if (initial || follow) { history.scrollTop = history.scrollHeight; markRead(); }
      else { unread = Math.min(history.children.length, unread + added); showCount(); }
    },
    reveal() { if (dock.open && dock.checkVisibility({ visibilityProperty: true })) { history.scrollTop = history.scrollHeight; markRead(); } },
    dispose() { dock.remove(); },
  };
}

export function bindTownChatComposer({ form, input, send, status, connected, sendMessage, onSent = () => {}, signal }) {
  let pending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !connected() || pending) return;
    pending = true; send.disabled = true; status.textContent = 'Sending…';
    const draft = input.value;
    try {
      const result = await sendMessage(text);
      if (result.ok) {
        if (input.value === draft) input.value = '';
        status.textContent = ''; onSent();
      } else status.textContent = result.message;
    } catch (error) { status.textContent = error.message; }
    finally { pending = false; send.disabled = !connected(); }
  }, { signal });
}
