// A one-use tab-local handoff for an explicit fallback reload. Authentication,
// authoritative pose and consequential actions are never serialized/replayed.
const key = 'river-oaks-graphics-reload';
const sanitize = value => ({
  settings: value.settings === true,
  settingsTab: typeof value.settingsTab === 'string' ? value.settingsTab.slice(0, 100) : null,
  chatDraft: typeof value.chatDraft === 'string' ? value.chatDraft.slice(0, 280) : '',
});
// A fallback must leave unpreserved state in this page. The player can save or
// dismiss it deliberately; ordinary in-place recovery needs no such guard.
export function graphicsReloadBlocker({ photoActive, photoRetained, dialogs = [] } = {}) {
  if (photoActive || photoRetained) return 'photo';
  if (dialogs.some(id => id !== 'settings-dialog')) return 'dialog';
  return null;
}
export function createGraphicsReloadState({ storage: given, scope, now = () => Date.now() }) {
  let storage = given;
  if (given === undefined) try { storage = globalThis.sessionStorage; } catch { /* unavailable */ }
  return {
    save(value) {
      if (!storage) return false;
      try { storage.setItem(key, JSON.stringify({ scope, at: now(), ui: sanitize(value) })); return true; } catch { return false; }
    },
    take() {
      try {
        const value = JSON.parse(storage?.getItem(key) ?? 'null'); storage?.removeItem(key);
        if (!value || value.scope !== scope || !Number.isFinite(value.at) || now() - value.at > 600000 || !value.ui) return null;
        return sanitize(value.ui);
      } catch { return null; }
    },
  };
}
