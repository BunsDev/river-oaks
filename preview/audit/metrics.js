export function distribution(samples) {
  if (!samples.length || samples.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Missing or invalid timing samples');
  const sorted = [...samples].sort((a, b) => a - b);
  const at = fraction => Math.round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] * 100) / 100;
  return { count: sorted.length, p50Ms: at(.5), p95Ms: at(.95), p99Ms: at(.99), maxMs: at(1) };
}

export function auditOptions(args) {
  // vsync=off unlocks the frame rate, so intervals measure frame cost instead of
  // snapping to display refresh multiples (16.7/33.3 ms at 60 Hz). view=player
  // keeps the game's follow camera; view=away looks from the viewer's eye away
  // from the other players, who are then behind the camera. compare adds eight
  // alternating segments (off/on/on/off/on/off/off/on) of one runtime feature to each tier, and
  // profile=on records a CPU profile beside the report for each tier.
  const result = { seconds: 15, warmup: 5, quality: 'sharp', vsync: 'on', view: 'crowd', compare: 'none', profile: 'off', players: [1, 8, 16, 32], output: 'data/reports/rendered-multiplayer-audit.json' };
  const seen = new Set();
  for (const arg of args) {
    const match = /^--(seconds|warmup|quality|vsync|view|compare|profile|players|output)=(.+)$/.exec(arg);
    if (!match || seen.has(match[1])) throw new Error(`Invalid or duplicate option: ${arg}`);
    seen.add(match[1]);
    const [, key, value] = match;
    result[key] = ['seconds', 'warmup'].includes(key) ? Number(value) : key === 'players' ? value.split(',').map(Number) : value;
  }
  if (!Number.isInteger(result.seconds) || result.seconds < 5 || result.seconds > 600
    || !Number.isInteger(result.warmup) || result.warmup < 1 || result.warmup > 60
    || !['sharp', 'auto', 'smooth'].includes(result.quality) || !['on', 'off'].includes(result.vsync)
    || !['crowd', 'player', 'away'].includes(result.view) || !['none', 'avatar-culling', 'figure-culling'].includes(result.compare) || !['on', 'off'].includes(result.profile)
    || !result.players.length || result.players.some((value, i) => ![1, 8, 16, 32].includes(value) || i && value <= result.players[i - 1]))
    throw new Error('Use seconds 5–600, warmup 1–60, quality sharp/auto/smooth, vsync on/off, view crowd/player/away, compare none/avatar-culling/figure-culling, profile on/off, and increasing player tiers from 1,8,16,32.');
  return result;
}

// Finish a sample instead of issuing a final command inside the cooldown.
// Timers may round a fractional remaining duration down and wake before the
// deadline; the explicit finish bit prevents that extra early command.
export function gestureWait(remainingMs) {
  return { delayMs: Math.max(1, Math.ceil(Math.min(1700, remainingMs))), finish: remainingMs <= 1700 };
}
