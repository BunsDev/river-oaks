// On foot with the player's own keys (#785): while an officer is on a wanted player the town refuses
// `travel`, so a journey leaves the chase by walking. The walk holds W (and Shift while far) and
// re-aims by dragging the view only when the heading is off (walking-ui: yaw -= dx * 0.003). It reads
// the page's own pose (#walking-hud data), never the server echo, which lags on a software renderer.
// Officers run at 3.4 m/s and telegraph a grab after 4 s within 1.5 m, so a stop-and-turn per stride
// lets them close in; a continuous walk keeps the lawful pace the server enforces.
const pose = tab => tab.evaluate(() => {
  const hud = document.querySelector('#walking-hud'), m = window.__riverMultiplayer(), s = m.snapshot;
  return { position: JSON.parse(hud.dataset.position), yaw: Number(hud.dataset.yaw), subdued: (s?.police?.subdued ?? []).includes(m.selfId),
    officers: (s?.police?.units ?? []).filter(unit => unit.targetId === m.selfId).map(unit => ({ state: unit.state, position: unit.position?.map(v => Math.round(v * 10) / 10) })) };
});

// Resolves to { position } within `reach` metres of [east, north], or { position: null, reason, trail }.
export async function walkNear(tab, [east, north], reach, { timeoutMs = 45000 } = {}) {
  const host = tab.locator('#canvas-host'), box = await host.boundingBox();
  const trail = [], held = new Set(), started = Date.now();
  const hold = async (key, on) => { if (on && !held.has(key)) { await tab.keyboard.down(key); held.add(key); } else if (!on && held.has(key)) { await tab.keyboard.up(key); held.delete(key); } };
  const release = async () => { for (const key of [...held]) await hold(key, false); };
  try {
    await host.focus();
    for (;;) {
      const now = await pose(tab), [x, , z] = now.position, de = east - x, dn = north + z, gap = Math.hypot(de, dn);
      if (!trail.length || Date.now() - trail.at(-1).t >= 1000) trail.push({ t: Date.now(), at: [Math.round(x * 10) / 10, Math.round(-z * 10) / 10], gap: Math.round(gap * 10) / 10, officers: now.officers });
      if (gap <= reach) { await release(); return { position: now.position }; }
      if (now.subdued) { await release(); return { position: null, reason: 'subdued by an officer', trail }; }
      if (Date.now() - started > timeoutMs) { await release(); return { position: null, reason: `not within ${reach} m after ${timeoutMs} ms`, trail }; }
      const delta = Math.atan2(Math.sin(Math.atan2(de, dn) + now.yaw), Math.cos(Math.atan2(de, dn) + now.yaw));
      // Near the point a coarse heading overshoots, so stop and aim; far away, steer while walking.
      if (Math.abs(delta) > (gap > 3 ? 0.2 : 0.08)) {
        if (gap <= 3) await hold('KeyW', false);
        const limit = box.width * 0.4, px = Math.max(-limit, Math.min(limit, delta / 0.003)), cx = box.x + box.width / 2, cy = box.y + box.height * 0.35;
        await tab.mouse.move(cx, cy); await tab.mouse.down(); await tab.mouse.move(cx + px, cy, { steps: 6 }); await tab.mouse.up();
      }
      await hold('ShiftLeft', gap > 3);
      await hold('KeyW', true);
      await tab.waitForTimeout(gap > 3 ? 120 : 60);
    }
  } finally { await release(); }
}
