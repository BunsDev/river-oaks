// Player blocking (#292). The town enforces every block; this module only asks for
// one and shows the resident who made it what they blocked. A blocked resident is
// never told, so nothing here is shown on their side.

// Blocking asks once more before it takes effect, because it also ends the contact.
export const BLOCK_CONFIRM_MS = 4000;

// The signed-in resident's block list, as the town last reported it. The town client
// attaches its request function on sign-in and detaches it on sign-out.
export function createBlockList() {
  let request = null, blocked = new Map(), loaded = false, generation = 0, askedList = 0, error = '';
  const listeners = new Set();
  const changed = () => { for (const listener of [...listeners]) listener(); };
  const call = (action, data) => {
    if (!request) throw new Error('Sign in to manage blocked players.');
    return request(action, data);
  };
  const list = {
    get loaded() { return loaded; },
    get connected() { return request !== null; },
    get session() { return generation; },
    get error() { return error; },
    has: id => blocked.has(id),
    entries: () => [...blocked].map(([id, name]) => ({ id, name })),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    attach(next) {
      request = next; generation++; blocked = new Map(); loaded = false; error = ''; changed();
    },
    async refresh() {
      const asked = generation, sequence = ++askedList;
      try {
        const value = await call('list');
        // Neither an earlier session nor an older read can replace a newer list.
        if (asked !== generation || sequence !== askedList) return;
        if (!Array.isArray(value?.blocked) || value.blocked.some(item => !item || typeof item.id !== 'string' || typeof item.name !== 'string')) {
          throw new Error('The town did not confirm your blocked residents. Refresh to try again.');
        }
        blocked = new Map(value.blocked.map(item => [item.id, item.name]));
        loaded = true; error = ''; changed();
      } catch (failure) {
        if (asked === generation && sequence === askedList) { error = failure.message; changed(); }
        throw failure;
      }
    },
    block: id => mutate('add', id),
    unblock: id => mutate('remove', id),
  };
  async function mutate(action, id) {
    const asked = generation, value = await call(action, { peerId: id });
    if (asked !== generation) throw new Error('Your session changed. Refresh before changing blocks.');
    if (value?.ok !== true) throw new Error(value?.error || 'The town did not confirm this change. Refresh to check your blocked residents.');
    await list.refresh();
    if (asked !== generation) throw new Error('Your session changed. Refresh before changing blocks.');
    if (blocked.has(id) !== (action === 'add')) throw new Error('The town did not confirm this change. Refresh to check your blocked residents.');
  }
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
    button.disabled = entry.busy || !blocks.loaded || !blocks.connected;
  };
  const settle = entry => { clearTimer(entry.confirming); entry.confirming = null; };
  let session = blocks.session;
  const unsubscribe = blocks.subscribe(() => {
    for (const entry of rows.values()) {
      if (session !== blocks.session) { settle(entry); entry.busy = false; }
      render(entry);
    }
    session = blocks.session;
  });
  return {
    rosterButton(row, player) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'multiplayer-block';
      const entry = { button, row, id: player.id, confirming: null, busy: false };
      button.addEventListener('click', async () => {
        if (button.disabled || rows.get(player.id) !== entry) return;
        const asked = blocks.session, current = () => asked === blocks.session && rows.get(player.id) === entry;
        const name = row.dataset.name, blocked = blocks.has(player.id);
        if (!blocked && !entry.confirming) {
          entry.confirming = setTimer(() => { entry.confirming = null; render(entry); }, BLOCK_CONFIRM_MS);
          render(entry); announce(`Block ${name}? You won’t see each other’s chat, gestures or profile, and your contact ends. Press again to confirm.`);
          return;
        }
        settle(entry); entry.busy = true; render(entry);
        try {
          if (blocked) { await blocks.unblock(player.id); if (current()) announce(`You unblocked ${name}.`); }
          else { await blocks.block(player.id); if (current()) announce(`You blocked ${name}. They are not told.`); }
        } catch (error) { if (current()) announce(error.message); }
        finally { if (current()) { entry.busy = false; render(entry); } }
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
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Refresh blocked residents';
  let session = blocks.session, message = '', disposed = false;
  const refresh = async () => {
    if (!blocks.connected || disposed) return;
    message = ''; render();
    try { await blocks.refresh(); } catch { /* The shared list retains and displays the error. */ }
  };
  retry.addEventListener('click', refresh);
  root.append(help, list, empty, status, retry);
  const render = () => {
    if (session !== blocks.session) { session = blocks.session; message = ''; }
    status.textContent = message || blocks.error;
    retry.disabled = !blocks.connected;
    const entries = blocks.entries();
    list.replaceChildren(...entries.map(({ id, name }) => {
      const asked = blocks.session;
      const item = document.createElement('li'), label = document.createElement('span'), button = document.createElement('button');
      label.textContent = name;
      button.type = 'button'; button.textContent = 'Unblock'; button.setAttribute('aria-label', `Unblock ${name}`);
      button.addEventListener('click', async () => {
        if (button.disabled || asked !== blocks.session || disposed) return;
        button.disabled = true;
        try { await blocks.unblock(id); if (asked === blocks.session && !disposed) { message = `You unblocked ${name}.`; render(); } }
        catch (error) { if (asked === blocks.session && !disposed) { button.disabled = false; message = error.message; render(); } }
      });
      item.append(label, button); return item;
    }));
    list.hidden = !entries.length;
    empty.textContent = !blocks.loaded ? 'Residents you block appear here while you’re in town.' : entries.length ? '' : 'You haven’t blocked anyone.';
    empty.hidden = !empty.textContent;
  };
  const unsubscribe = blocks.subscribe(render); render();
  return Object.assign(root, { refresh, dispose() { disposed = true; unsubscribe(); } });
}
