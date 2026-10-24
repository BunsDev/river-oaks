// One event source per document fans out to the owners of held input/audio.
// Subscriptions use the owner's existing AbortSignal or returned disposer.
const pages = new WeakMap();

export function bindPageLifecycle({ release = () => {}, resume = () => {},
  document = globalThis.document, window = globalThis.window, signal } = {}) {
  if (signal?.aborted || !document || !window) return () => {};
  let page = pages.get(document);
  if (!page) {
    const subscribers = new Set(), captures = new Map();
    const clear = reason => {
      for (const [id, target] of captures) {
        try { if (target.hasPointerCapture(id)) target.releasePointerCapture(id); } catch { /* Detached capture owner. */ }
      }
      captures.clear();
      for (const owner of [...subscribers]) owner.release(reason);
    };
    const blur = () => clear('blur');
    const hidden = () => { if (document.hidden || document.visibilityState === 'hidden') clear('hidden'); };
    const hide = () => clear('pagehide');
    const show = event => {
      if (!event.persisted) return;
      clear('pageshow');
      for (const owner of [...subscribers]) owner.resume();
    };
    const capture = event => captures.set(event.pointerId, event.target);
    const uncapture = event => captures.delete(event.pointerId);
    const events = [[window, 'blur', blur], [document, 'visibilitychange', hidden], [window, 'pagehide', hide], [window, 'pageshow', show],
      [document, 'gotpointercapture', capture], [document, 'lostpointercapture', uncapture]];
    for (const [target, type, listener] of events) target.addEventListener(type, listener);
    page = { subscribers, dispose() { for (const [target, type, listener] of events) target.removeEventListener(type, listener); pages.delete(document); captures.clear(); } };
    pages.set(document, page);
  }
  const owner = { release, resume }; page.subscribers.add(owner);
  let disposed = false;
  const dispose = () => {
    if (disposed) return; disposed = true;
    page.subscribers.delete(owner); signal?.removeEventListener('abort', dispose);
    if (!page.subscribers.size) page.dispose();
  };
  signal?.addEventListener('abort', dispose, { once: true });
  return dispose;
}
