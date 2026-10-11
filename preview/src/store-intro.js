import { Vector3 } from 'three';

// Camera-only presentation. Never use these positions as player movement.
export function createStoreIntroDirector({ camera, claim, onStart = () => {}, onEnd = () => {}, getReducedMotion = () => false }) {
  let lastVisit = null, generation = 0, playing = null;
  const target = new Vector3();
  const cancel = () => {
    generation++;
    if (!playing) return;
    const saved = playing.saved;
    playing = null;
    camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion);
    camera.fov = saved.fov; camera.updateProjectionMatrix();
    onEnd();
  };
  return {
    get active() { return Boolean(playing); },
    cancel,
    reset() { cancel(); lastVisit = null; },
    observe({ room, accountId, worldId, canPlay }) {
      const key = room && accountId ? JSON.stringify([accountId, worldId, room.storeId]) : null;
      if (key === lastVisit) { if (!canPlay) cancel(); return; }
      cancel();
      if (!key) { lastVisit = null; return; }
      if (!canPlay) return;
      lastVisit = key;
      const token = generation;
      // A claim is consumed on arrival, including skipped/interrupted playback.
      Promise.resolve().then(() => claim(room.storeId)).then(result => {
        if (token !== generation || !result?.firstVisit) return;
        const reduced = getReducedMotion();
        playing = { room, reduced, started: null, saved: { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov } };
        onStart(room, reduced);
      }).catch(() => {
        // Service or presentation failure must never retain camera ownership.
        if (token === generation) cancel();
      });
    },
    update(now) {
      if (!playing) return;
      playing.started ??= now;
      const elapsed = now - playing.started;
      if (elapsed >= (playing.reduced ? 2200 : 6000)) { cancel(); return; }
      if (playing.reduced) return;
      const { room } = playing;
      const exterior = elapsed < 2400;
      const progress = exterior ? elapsed / 2400 : (elapsed - 2400) / 3600;
      const ease = progress * progress * (3 - 2 * progress);
      // Two separate shots avoid flying through walls or across interior fixtures.
      const position = room.toWorld(0, exterior ? -5.5 + .5 * ease : .85 + .3 * ease);
      const look = room.toWorld(exterior ? 0 : room.center * .5, exterior ? 0 : Math.min(5, room.depth * .75));
      camera.position.set(position[0], room.floor + (exterior ? 2.2 : 1.75), -position[1]);
      target.set(look[0], room.floor + (exterior ? 2.8 : 1.6), -look[1]);
      camera.lookAt(target); camera.fov = exterior ? 58 : 65; camera.updateProjectionMatrix();
    },
  };
}
