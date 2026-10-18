// Held-key control for the throwing games (darts, wine pong). A tap moves one step, as
// a slider does; a key held past a short delay keeps moving at a steady rate, measured
// by the clock rather than by frames, so a slow frame never loses or gains movement.
// Shift makes both a quarter as large. `keys` maps a key code to [axis, direction];
// `apply` receives { axis: amount } and does the moving.
export function createHeldControls({ keys, step, rate, apply, now = () => performance.now(), delay = 250, fine = 0.25 }) {
  const held = new Map();
  const shifted = () => held.has('ShiftLeft') || held.has('ShiftRight');
  function advance(time = now()) {
    const scale = shifted() ? fine : 1, move = {};
    for (const [code, key] of held) {
      const binding = keys[code];
      if (!binding) continue;
      const from = Math.max(key.lastAt, key.pressedAt + delay), seconds = Math.min(1, Math.max(0, (time - from) / 1000));
      key.lastAt = Math.max(key.lastAt, time);
      if (seconds > 0) move[binding[0]] = (move[binding[0]] ?? 0) + binding[1] * rate[binding[0]] * scale * seconds;
    }
    if (Object.keys(move).length) apply(move);
  }
  return {
    // A keydown: true when it is one of the game's keys (the caller prevents its default).
    down(event) {
      const time = now();
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') { advance(time); held.set(event.code, { pressedAt: time, lastAt: time }); return false; }
      const binding = keys[event.code];
      if (!binding) return false;
      if (!event.repeat && !held.has(event.code)) {
        advance(time); held.set(event.code, { pressedAt: time, lastAt: time });
        apply({ [binding[0]]: binding[1] * step[binding[0]] * (shifted() ? fine : 1) });
      }
      return true;
    },
    up(event) { advance(); held.delete(event.code); },
    advance,
    clear() { held.clear(); },
  };
}
