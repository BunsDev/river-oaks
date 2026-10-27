// Player blocking (#292). The town enforces every block; this module only asks for
// one and shows the resident who made it what they blocked. A blocked resident is
// never told, so nothing here is shown on their side.

// Blocking asks once more before it takes effect, because it also ends the contact.
export const BLOCK_CONFIRM_MS = 4000;

// The signed-in resident's block list, as the town last reported it. The town client
// attaches its request function on sign-in and detaches it on sign-out.
export function createBlockList() {
  let request = null, blocked = new Map(), loaded = false, generation = 0;
  const listeners = new Set();
  const changed = () => { for (const listener of [...listeners]) listener(); };
  const call = (action, data) => {
    if (!request) throw new Error('Sign in to manage blocked players.');
    return request(action, data);
  };
  const list = {
    get loaded() { return loaded; },
    has: id => blocked.has(id),
    entries: () => [...blocked].map(([id, name]) => ({ id, name })),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    attach(next) {
      request = next; generation++; blocked = new Map(); loaded = false; changed();
    },
    async refresh() {
      const asked = generation, value = await call('list');
      // A reply for an earlier session never reaches this one.
      if (asked !== generation) return;
      blocked = new Map((Array.isArray(value?.blocked) ? value.blocked : []).map(item => [item.id, item.name]));
      loaded = true; changed();
    },
    async block(id) { await call('add', { peerId: id }); await list.refresh(); },
    async unblock(id) { await call('remove', { peerId: id }); await list.refresh(); },
  };
  return list;
}

let shared = null;
export function sharedBlockList() { return shared ??= createBlockList(); }

// A Block or Unblock button in each resident's roster row, beside Report. The row's
// data-name follows renames, so labels always carry the current name.
export function createBlockUI({ blocks, announce = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const rows = new Map();
  const render = entry => {
    const { button, row, id } = entry, name = row.dataset.name;
    const label = entry.confirming ? 'Confirm blocking {name}' : blocks.has(id) ? 'Unblock {name}' : 'Block {name}';
    button.textContent = entry.confirming ? 'Confirm block' : blocks.has(id) ? 'Unblock' : 'Block';
    button.dataset.label = label; button.setAttribute('aria-label', label.replace('{name}', name));
  };
  const settle = entry => { clearTimer(entry.confirming); entry.confirming = null; };
  const unsubscribe = blocks.subscribe(() => { for (const entry of rows.values()) render(entry); });
  return {
    rosterButton(row, player) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'multiplayer-block';
      const entry = { button, row, id: player.id, confirming: null };
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        const name = row.dataset.name, blocked = blocks.has(player.id);
        if (!blocked && !entry.confirming) {
          entry.confirming = setTimer(() => { entry.confirming = null; render(entry); }, BLOCK_CONFIRM_MS);
          render(entry); announce(`Block ${name}? You won’t see each other’s chat, gestures or profile, and your contact ends. Press again to confirm.`);
          return;
        }
        settle(entry); button.disabled = true;
        try {
          if (blocked) { await blocks.unblock(player.id); announce(`You unblocked ${name}.`); }
          else { await blocks.block(player.id); announce(`You blocked ${name}. They are not told.`); }
        } catch (error) { announce(error.message); }
        finally { button.disabled = false; render(entry); }
      });
      rows.set(player.id, entry); render(entry); row.append(button);
      return button;
    },
    forgetRow(id) { const entry = rows.get(id); if (entry) settle(entry); rows.delete(id); },
    dispose() { for (const entry of rows.values()) settle(entry); rows.clear(); unsubscribe(); },
  };
}

// Settings → Account: everyone the resident blocked, each with Unblock.
export function createBlockedPlayersSettings({ blocks }) {
  const root = document.createElement('div'); root.className = 'blocked-players';
  const help = document.createElement('p');
  help.textContent = 'Blocked residents don’t see your chat, gestures or profile, and you don’t see theirs. They are not told.';
  const list = document.createElement('ul'); list.className = 'blocked-players-list';
  const empty = document.createElement('p'); empty.className = 'blocked-players-empty';
  const status = document.createElement('p'); status.className = 'blocked-players-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  root.append(help, list, empty, status);
  const render = () => {
    const entries = blocks.entries();
    list.replaceChildren(...entries.map(({ id, name }) => {
      const item = document.createElement('li'), label = document.createElement('span'), button = document.createElement('button');
      label.textContent = name;
      button.type = 'button'; button.textContent = 'Unblock'; button.setAttribute('aria-label', `Unblock ${name}`);
      button.addEventListener('click', async () => {
        button.disabled = true;
        try { await blocks.unblock(id); status.textContent = `You unblocked ${name}.`; }
        catch (error) { button.disabled = false; status.textContent = error.message; }
      });
      item.append(label, button); return item;
    }));
    list.hidden = !entries.length;
    empty.textContent = !blocks.loaded ? 'Residents you block appear here while you’re in town.' : entries.length ? '' : 'You haven’t blocked anyone.';
    empty.hidden = !empty.textContent;
  };
  const unsubscribe = blocks.subscribe(render); render();
  return Object.assign(root, { dispose: unsubscribe });
}
