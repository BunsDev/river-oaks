export function navigationAllowed(input, entry) {
  try {
    const url = new URL(input), base = new URL(entry);
    return url.protocol === base.protocol && url.host === base.host && !url.username && !url.password;
  } catch { return false; }
}

export function windowBounds(saved, displays) {
  const primary = displays[0] ?? { width: 1280, height: 800 };
  const fallback = { width: Math.min(1280, primary.width), height: Math.min(800, primary.height) };
  const { x, y, width, height } = saved ?? {};
  if (![x, y, width, height].every(Number.isFinite) || width < 800 || height < 600) return fallback;
  const display = displays.find(d => x >= d.x && y >= d.y && x + width <= d.x + d.width && y + height <= d.y + d.height);
  return display ? { x, y, width, height } : fallback;
}

// The optional Python bridge (decisions, local Kokoro voices, Jev's ElevenLabs
// voice) on 127.0.0.1:8765. Development starts it alongside Vite so voices
// work without a separate terminal; a bridge someone already started is
// reused, and a machine without uv simply runs the game without it.
export const BRIDGE_PORT = 8765;
export const BRIDGE_HEALTH = `http://127.0.0.1:${BRIDGE_PORT}/health`;
export function bridgeCommand({ voice = true } = {}) {
  return { command: 'uv', args: ['run', ...(voice ? ['--extra', 'voice'] : []), 'river-oaks', 'serve', '--port', String(BRIDGE_PORT)] };
}
// A bridge is ready when /health answers with the bridge's own contract: its
// status and decision mode. A different service on the port, or a connection
// refused, is not our bridge.
// The decision engine reports exactly one of these (src/river_oaks/agents.py).
export const BRIDGE_MODES = new Set(['local_rules', 'jev']);
export async function bridgeReady(fetcher, { timeoutMs = 1500 } = {}) {
  try {
    const response = await fetcher(BRIDGE_HEALTH, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.status === 'ok' && typeof body.mode === 'string' && BRIDGE_MODES.has(body.mode);
  } catch { return false; }
}
// Poll until the bridge answers, or give up; bounded so a broken install
// never stalls the game window.
export async function waitForBridge(fetcher, { attempts = 40, intervalMs = 500, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await bridgeReady(fetcher)) return true;
    await sleep(intervalMs);
  }
  return false;
}
