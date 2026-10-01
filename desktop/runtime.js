import { realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';

// The packaged renderer can reach only these fixed loopback bridge routes.
export async function bridgeRequest(request,fetcher) {
  const url=new URL(request.url);
  if(url.protocol!=='app:'||url.host!=='game'||!url.pathname.startsWith('/v1/'))return null;
  const methods={'/v1/decisions':['POST'],'/v1/settings/elevenlabs/voice':['PUT'],'/v1/voice/jev':['POST'],'/v1/voice':['GET','POST'],'/v1/settings/elevenlabs':['GET','PUT','DELETE'],'/v1/chauffeur':['GET','POST'],'/v1/settings/jev':['GET','PUT','DELETE'],'/v1/companion':['GET','POST'],'/v1/auto':['GET','POST']};
  if(url.search||!methods[url.pathname]?.includes(request.method))return new Response('Not found',{status:404});
  try {
    const body=['POST','PUT'].includes(request.method)?await request.text():undefined;
    if(body&&Buffer.byteLength(body)>16384)return new Response('Request too large',{status:413});
    const result=await fetcher(`http://127.0.0.1:8765${url.pathname}`,{method:request.method,headers:{'Content-Type':'application/json'},body,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(url.pathname.startsWith('/v1/voice')?24000:3000)});
    return new Response(result.body,{status:result.status,headers:{'Content-Type':result.headers.get('content-type')?.startsWith('audio/')?result.headers.get('content-type'):'application/json','Cache-Control':'no-store'}});
  }catch{return Response.json({source:'unavailable',reason:'bridge_unavailable'},{status:503});}
}

export async function resolveAsset(root, input) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'app:' || url.host !== 'game') return null;
    const path = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const base = await realpath(root);
    const file = await realpath(resolve(base, `.${path}`));
    const child = relative(base, file);
    if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) return null;
    return (await stat(file)).isFile() ? file : null;
  } catch { return null; }
}

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
