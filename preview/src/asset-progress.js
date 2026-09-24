import * as THREE from 'three';

// The district opens as soon as its map data is built, then the sky, trees,
// residents and interiors stream in. This reports that streaming honestly:
// counts of finished files from three's loading manager, never a guessed
// percentage, and a bar that never runs backwards when late loads join.
export const SETTLE_MS = 450;

export function trackAssetProgress(manager = THREE.DefaultLoadingManager, onChange = () => {}, { settleMs = SETTLE_MS, schedule = setTimeout, cancel = clearTimeout } = {}) {
  const state = { loaded: 0, total: 0, failed: 0, fraction: 0, active: false, done: false };
  let settle = null;
  // Per-file bookkeeping, so callers can wait for one kind of asset.
  const pending = new Map(), waiters = new Set(), itemStart = manager.itemStart;
  manager.itemStart = url => { pending.set(url, (pending.get(url) ?? 0) + 1); itemStart.call(manager, url); };
  const finish = url => {
    const count = (pending.get(url) ?? 1) - 1;
    if (count > 0) pending.set(url, count); else pending.delete(url);
    for (const waiter of waiters) waiter();
  };
  const emit = () => onChange({ ...state });
  const update = (loaded, total) => {
    state.loaded = loaded; state.total = Math.max(total, loaded);
    state.fraction = Math.max(state.fraction, state.total ? state.loaded / state.total : 0);
  };
  manager.onStart = (url, loaded, total) => {
    cancel(settle); settle = null;
    if (state.done) { state.done = false; state.fraction = 0; }
    state.active = true; update(loaded, total); emit();
  };
  manager.onProgress = (url, loaded, total) => {
    finish(url);
    state.active = true; update(loaded, total);
    // Keep the bar short of full while more files may still start.
    if (loaded < total) state.fraction = Math.min(state.fraction, 0.99);
    emit();
  };
  manager.onError = () => { state.failed++; emit(); };
  manager.onLoad = () => {
    // A finished batch often triggers the next (a character after its data),
    // so completion waits for a quiet moment before it is announced.
    cancel(settle);
    settle = schedule(() => { settle = null; state.fraction = 1; state.active = false; state.done = true; emit(); }, settleMs);
  };
  return {
    get state() { return { ...state }; },
    // Resolves once no started file matching `test` is still loading, or after
    // `timeout` ms so a slow or failing file never holds the caller hostage.
    settled(test, { timeout = 10000 } = {}) {
      return new Promise(resolve => {
        let timer = null;
        const check = () => {
          if ([...pending.keys()].some(test)) return;
          waiters.delete(check); cancel(timer); resolve(true);
        };
        timer = schedule(() => { waiters.delete(check); resolve(false); }, timeout);
        waiters.add(check); check();
      });
    },
    dispose() {
      cancel(settle); waiters.clear(); manager.itemStart = itemStart;
      for (const key of ['onStart', 'onProgress', 'onError', 'onLoad']) manager[key] = undefined;
    },
  };
}

export function describeAssetProgress({ loaded, total, failed, done }) {
  if (done) return failed ? `District ready · ${failed} detail${failed === 1 ? '' : 's'} unavailable` : 'District ready';
  return `Bringing the district to life · ${loaded} of ${total}`;
}

// A quiet pill at the top of the view, plus a bar inside the opening overlay.
export function mountAssetProgress({ viewport, overlay, manager, reducedMotion = false }) {
  const pill = document.createElement('div');
  pill.className = 'asset-progress'; pill.setAttribute('role', 'status'); pill.hidden = true;
  const label = document.createElement('span'); label.className = 'asset-progress-label';
  const bar = document.createElement('span'); bar.className = 'asset-progress-bar'; bar.setAttribute('aria-hidden', 'true');
  bar.append(document.createElement('i'));
  pill.append(label, bar);
  viewport.append(pill);
  const overlayBar = bar.cloneNode(true); overlayBar.classList.add('loading-progress');
  overlay.querySelector('p')?.after(overlayBar);
  let hideTimer = null;
  const tracker = trackAssetProgress(manager, state => {
    const text = describeAssetProgress(state);
    label.textContent = text;
    for (const target of [bar, overlayBar]) target.style.setProperty('--progress', state.fraction.toFixed(3));
    viewport.dataset.assetProgress = JSON.stringify({ loaded: state.loaded, total: state.total, failed: state.failed, done: state.done });
    clearTimeout(hideTimer);
    if (state.active) { pill.hidden = false; pill.classList.remove('leaving'); }
    else if (state.done && !pill.hidden) {
      // Announce completion briefly, then step aside.
      hideTimer = setTimeout(() => {
        if (reducedMotion) { pill.hidden = true; return; }
        pill.classList.add('leaving');
        hideTimer = setTimeout(() => { pill.hidden = true; pill.classList.remove('leaving'); }, 260);
      }, state.failed ? 4000 : 1400);
    }
  });
  return { element: pill, settled: tracker.settled, dispose() { clearTimeout(hideTimer); tracker.dispose(); pill.remove(); overlayBar.remove(); } };
}
