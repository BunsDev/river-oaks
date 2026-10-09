// Problem reports: what the game was doing when something broke, in one file a
// player can copy, download or send. The collectors start with the sign-in page
// and keep small bounded logs (errors, console, failed requests, interactions,
// frame times). Everything that leaves the browser passes `redact`: no email
// addresses, account ids, sign-in tokens, invite codes or typed text.

export const REPORT_SCHEMA = 'river-oaks.debug-report', REPORT_VERSION = 1;
const LIMITS = { errors: 50, console: 80, network: 40, breadcrumbs: 40, frames: 600, longTasks: 30 };
const started = typeof performance !== 'undefined' ? performance.now() : 0;
const logs = { errors: [], console: [], network: [], breadcrumbs: [], frames: [], longTasks: [], events: { contextLost: 0, contextRestored: 0 } };
const sources = new Map();
let installed = false, lastFrame = null, captureFrame = null;

const SENSITIVE_KEYS = /^(code|token|ticket|state|invite|csrf|session|key|secret|password|auth|access_token|id_token|refresh_token|email)$/i;
const SAFE_KEYS = new Set(['world', 'debug', 'motion-debug', 'place', 'at', 'quality', 'occlusion', 'theme', 'view']);

// Strip anything that identifies a person or unlocks an account.
export function redact(value, max = 500) {
  let text = typeof value === 'string' ? value : String(value ?? '');
  text = text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\buser_[A-Za-z0-9]{12,}\b/g, '[account]')
    .replace(/\bBearer\s+[\w.~+/-]+=*/gi, 'Bearer [token]')
    .replace(/\beyJ[\w-]{8,}\.[\w-]{8,}(?:\.[\w-]+)?/g, '[token]')
    .replace(/([?&;\s"'](?:code|token|ticket|state|invite|csrf|session|key|secret|password|auth)=)[^&\s"';]+/gi, '$1[redacted]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, match => /^[0-9a-f]{40}$/.test(match) ? match : '[token]');
  return text.length > max ? `${text.slice(0, max)}… (+${text.length - max} chars)` : text;
}

// A URL reduced to its path and the query keys we can safely keep.
export function sanitizeUrl(raw, base = typeof location !== 'undefined' ? location.href : 'http://localhost/') {
  try {
    const url = new URL(raw, base), here = new URL(base);
    const query = [...url.searchParams.keys()].map(key => `${key}=${SAFE_KEYS.has(key) && !SENSITIVE_KEYS.test(key) ? redact(url.searchParams.get(key), 60) : '[redacted]'}`).join('&');
    const host = url.origin === here.origin ? '' : url.origin;
    return redact(`${host}${url.pathname}${query ? `?${query}` : ''}`, 300);
  } catch { return redact(raw, 300); }
}

// Frame-time statistics over the sampled frames, in milliseconds.
export function frameStats(frames) {
  if (!frames.length) return { count: 0 };
  const sorted = [...frames].sort((a, b) => a - b), pick = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const mean = frames.reduce((sum, value) => sum + value, 0) / frames.length;
  const round = value => Math.round(value * 10) / 10;
  return { count: frames.length, fps: round(1000 / mean), meanMs: round(mean), medianMs: round(pick(0.5)), p90Ms: round(pick(0.9)), p99Ms: round(pick(0.99)), maxMs: round(sorted.at(-1)),
    over33Ms: frames.filter(value => value > 33.4).length, over50Ms: frames.filter(value => value > 50).length, last120: frames.slice(-120).map(value => Math.round(value)) };
}

const since = () => Math.round(performance.now() - started);
const push = (list, entry, limit) => {
  const last = list.at(-1);
  // Repeats collapse into a count instead of flooding the log.
  if (last && last.message === entry.message && last.type === entry.type && last.level === entry.level) { last.count = (last.count ?? 1) + 1; last.lastAt = entry.at; return; }
  list.push(entry); if (list.length > limit) list.shift();
};
const describeArg = value => {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, (key, item) => (typeof item === 'bigint' ? String(item) : item)); } catch { return String(value); }
};
const stackOf = error => (typeof error?.stack === 'string' ? redact(error.stack.split('\n').slice(0, 14).join('\n'), 2000) : null);
const labelOf = element => redact((element.getAttribute('aria-label') || element.textContent || element.value || element.name || element.id || element.tagName).replace(/\s+/g, ' ').trim(), 60);

// Start the collectors once, as early as possible.
export function installDiagnostics() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', event => {
    const target = event.target;
    if (target && target !== window && (target.src || target.href)) {
      push(logs.errors, { at: since(), type: 'resource', message: `Failed to load ${target.tagName.toLowerCase()} ${sanitizeUrl(target.src || target.href)}` }, LIMITS.errors);
      return;
    }
    push(logs.errors, { at: since(), type: 'error', message: redact(event.message || describeArg(event.error)), source: event.filename ? `${sanitizeUrl(event.filename)}:${event.lineno}:${event.colno}` : null, stack: stackOf(event.error) }, LIMITS.errors);
  }, true);
  window.addEventListener('unhandledrejection', event => {
    push(logs.errors, { at: since(), type: 'unhandledrejection', message: redact(describeArg(event.reason)), stack: stackOf(event.reason) }, LIMITS.errors);
  });
  for (const level of ['error', 'warn']) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      try { push(logs.console, { at: since(), level, message: redact(args.map(describeArg).join(' ')), stack: args.find(arg => arg instanceof Error) ? stackOf(args.find(arg => arg instanceof Error)) : undefined }, LIMITS.console); } catch { /* never break logging */ }
    };
  }
  if (typeof window.fetch === 'function') {
    const original = window.fetch;
    window.fetch = async function fetchWithDiagnostics(input, init) {
      const begin = performance.now(), method = String(init?.method ?? input?.method ?? 'GET').toUpperCase(), url = sanitizeUrl(typeof input === 'string' || input instanceof URL ? String(input) : input?.url ?? '');
      try {
        const response = await original.apply(this, arguments);
        const ms = Math.round(performance.now() - begin);
        if (!response.ok || ms > 3000) push(logs.network, { at: since(), type: 'fetch', message: `${method} ${url} → ${response.status}`, method, url, status: response.status, ms }, LIMITS.network);
        return response;
      } catch (error) {
        push(logs.network, { at: since(), type: 'fetch', message: `${method} ${url} failed`, method, url, status: 0, ms: Math.round(performance.now() - begin), error: redact(error?.message ?? error) }, LIMITS.network);
        throw error;
      }
    };
  }
  // Interactions: which control was used, never what was typed.
  document.addEventListener('click', event => {
    const element = event.target?.closest?.('button, a, summary, [role=button], [role=tab], label, select, input[type=checkbox], input[type=radio]');
    if (element) push(logs.breadcrumbs, { at: since(), type: 'click', message: labelOf(element), id: element.id || undefined }, LIMITS.breadcrumbs);
  }, true);
  document.addEventListener('keydown', event => {
    if (/^F\d{1,2}$/.test(event.key) || event.key === 'Escape') push(logs.breadcrumbs, { at: since(), type: 'key', message: event.key }, LIMITS.breadcrumbs);
  }, true);
  document.addEventListener('visibilitychange', () => push(logs.breadcrumbs, { at: since(), type: 'visibility', message: document.visibilityState }, LIMITS.breadcrumbs));
  for (const type of ['online', 'offline']) window.addEventListener(type, () => push(logs.breadcrumbs, { at: since(), type: 'network', message: type }, LIMITS.breadcrumbs));
  document.addEventListener('webglcontextlost', () => { logs.events.contextLost++; push(logs.errors, { at: since(), type: 'webgl', message: 'WebGL context lost' }, LIMITS.errors); }, true);
  document.addEventListener('webglcontextrestored', () => { logs.events.contextRestored++; }, true);
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) { logs.longTasks.push({ at: Math.round(entry.startTime - started), ms: Math.round(entry.duration) }); if (logs.longTasks.length > LIMITS.longTasks) logs.longTasks.shift(); }
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* long tasks are Chromium-only */ }
}

// The game loop reports each frame so stutter can be measured.
export function noteFrame(now) {
  if (lastFrame !== null) { const delta = now - lastFrame; if (delta > 0 && delta < 5000) { logs.frames.push(delta); if (logs.frames.length > LIMITS.frames) logs.frames.shift(); } }
  lastFrame = now;
}
// Named sections the running game contributes (renderer, scene, game state).
export function registerDiagnosticSource(name, read) { sources.set(name, read); }
// The game provides a way to grab the next rendered frame for screenshots.
export function setScreenshotCapture(capture) { captureFrame = capture; }
export const canCaptureScreenshot = () => Boolean(captureFrame);
export async function captureScreenshot({ width = 960, maxChars = 138_000 } = {}) {
  if (!captureFrame) return null;
  // The copy is taken right after the game draws its next frame; a hidden tab or a
  // stalled renderer never draws one, so give up after two seconds.
  const canvas = await new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 2000);
    captureFrame(source => {
      clearTimeout(timer);
      const scale = Math.min(1, width / source.width), copy = document.createElement('canvas');
      copy.width = Math.round(source.width * scale); copy.height = Math.round(source.height * scale);
      copy.getContext('2d').drawImage(source, 0, 0, copy.width, copy.height); resolve(copy);
    });
  });
  if (!canvas) return null;
  for (const quality of [0.72, 0.55, 0.4]) { const url = canvas.toDataURL('image/jpeg', quality); if (url.length <= maxChars) return url; }
  return null;
}

// GPU and renderer details from a three.js WebGLRenderer.
export function describeRenderer(renderer, extra = {}) {
  if (!renderer) return null;
  const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info'), info = renderer.info;
  const extensions = gl.getSupportedExtensions() ?? [], webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  return {
    webgl: webgl2 ? 2 : 1,
    vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR), gpu: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
    version: gl.getParameter(gl.VERSION), glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE), maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), maxSamples: webgl2 ? gl.getParameter(gl.MAX_SAMPLES) : null,
    extensionCount: extensions.length, extensions: extensions.filter(name => /color_buffer_float|texture_float_linear|parallel_shader|compressed_texture|timer_query|anisotropic/.test(name)),
    contextLost: gl.isContextLost(), pixelRatio: renderer.getPixelRatio(), drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    toneMapping: renderer.toneMapping, outputColorSpace: renderer.outputColorSpace, shadows: { enabled: renderer.shadowMap.enabled, type: renderer.shadowMap.type },
    lastFrame: { calls: info.render.calls, triangles: info.render.triangles, lines: info.render.lines, points: info.render.points },
    memory: { geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? null },
    contextEvents: { ...logs.events }, ...extra,
  };
}

// What the scene holds, by kind.
export function describeScene(scene) {
  if (!scene) return null;
  const counts = { objects: 0, meshes: 0, instancedMeshes: 0, instances: 0, skinnedMeshes: 0, lights: {}, hidden: 0 }, materials = new Set(), textures = new Set();
  scene.traverse(object => {
    counts.objects++;
    if (!object.visible) counts.hidden++;
    if (object.isLight) counts.lights[object.type] = (counts.lights[object.type] ?? 0) + 1;
    if (!object.isMesh) return;
    counts.meshes++;
    if (object.isInstancedMesh) { counts.instancedMeshes++; counts.instances += object.count; }
    if (object.isSkinnedMesh) counts.skinnedMeshes++;
    for (const material of [].concat(object.material ?? [])) { materials.add(material); for (const key of ['map', 'normalMap', 'emissiveMap', 'roughnessMap']) if (material[key]) textures.add(material[key]); }
  });
  return { ...counts, materials: materials.size, textures: textures.size };
}

function environment() {
  const nav = navigator, media = query => matchMedia(query).matches, connection = nav.connection;
  const brands = nav.userAgentData?.brands?.filter(brand => !/Not.?A.?Brand/i.test(brand.brand)).map(brand => `${brand.brand} ${brand.version}`).join(', ');
  return {
    browser: brands || redact(nav.userAgent, 200), userAgent: redact(nav.userAgent, 300), platform: nav.userAgentData?.platform ?? nav.platform, mobile: nav.userAgentData?.mobile ?? /Mobi/.test(nav.userAgent),
    desktopApp: /Electron/.test(nav.userAgent), languages: [...(nav.languages ?? [nav.language])].slice(0, 4), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    online: nav.onLine, cores: nav.hardwareConcurrency ?? null, memoryGb: nav.deviceMemory ?? null,
    connection: connection ? { type: connection.effectiveType, rttMs: connection.rtt, downlinkMbps: connection.downlink, saveData: connection.saveData } : null,
    screen: { width: screen.width, height: screen.height, available: [screen.availWidth, screen.availHeight], colorDepth: screen.colorDepth },
    viewport: [innerWidth, innerHeight], devicePixelRatio, zoom: visualViewport ? Math.round(visualViewport.scale * 100) / 100 : null, fullscreen: Boolean(document.fullscreenElement),
    preferences: { colorScheme: media('(prefers-color-scheme: dark)') ? 'dark' : 'light', reducedMotion: media('(prefers-reduced-motion: reduce)'), reducedTransparency: media('(prefers-reduced-transparency: reduce)'),
      contrast: media('(prefers-contrast: more)') ? 'more' : 'no-preference', pointer: media('(pointer: coarse)') ? 'coarse' : 'fine', theme: document.documentElement.dataset.theme ?? null },
  };
}

function timing() {
  const navigation = performance.getEntriesByType('navigation')[0], paint = Object.fromEntries(performance.getEntriesByType('paint').map(entry => [entry.name, Math.round(entry.startTime)]));
  const resources = performance.getEntriesByType('resource');
  const memory = performance.memory ? { usedMb: Math.round(performance.memory.usedJSHeapSize / 1048576), totalMb: Math.round(performance.memory.totalJSHeapSize / 1048576), limitMb: Math.round(performance.memory.jsHeapSizeLimit / 1048576) } : null;
  return {
    uptimeMs: Math.round(performance.now()), startedAt: new Date(performance.timeOrigin).toISOString(),
    navigation: navigation ? { type: navigation.type, ttfbMs: Math.round(navigation.responseStart), domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd), loadMs: Math.round(navigation.loadEventEnd), transferKb: Math.round(navigation.transferSize / 1024) } : null,
    paint, memory, frames: frameStats(logs.frames),
    longTasks: { count: logs.longTasks.length, totalMs: logs.longTasks.reduce((sum, task) => sum + task.ms, 0), worst: [...logs.longTasks].sort((a, b) => b.ms - a.ms).slice(0, 5) },
    resources: { count: resources.length, transferKb: Math.round(resources.reduce((sum, entry) => sum + (entry.transferSize ?? 0), 0) / 1024),
      slowest: [...resources].sort((a, b) => b.duration - a.duration).slice(0, 6).map(entry => ({ url: sanitizeUrl(entry.name), ms: Math.round(entry.duration), kb: Math.round((entry.transferSize ?? 0) / 1024) })) },
  };
}

async function storage() {
  let keys = [];
  try { keys = Object.keys(localStorage).filter(key => key.startsWith('river-oaks')).map(key => ({ key, chars: localStorage.getItem(key)?.length ?? 0 })); } catch { /* blocked */ }
  let estimate = null;
  try { const value = await navigator.storage?.estimate?.(); if (value) estimate = { usageMb: Math.round(value.usage / 1048576), quotaMb: Math.round(value.quota / 1048576) }; } catch { /* unsupported */ }
  return { localStorage: keys, estimate };
}

const build = () => (typeof __RIVER_OAKS_BUILD__ !== 'undefined' ? __RIVER_OAKS_BUILD__ : { version: 'unknown', commit: 'unknown' });

// The whole report. Each section is read separately, so one failure is recorded
// in `sourceErrors` instead of losing the report.
export async function buildDebugReport({ description = '', screenshot = null } = {}) {
  const sourceErrors = {}, read = (name, fn) => { try { return fn(); } catch (error) { sourceErrors[name] = redact(error?.message ?? error); return null; } };
  const sections = {};
  for (const [name, fn] of sources) sections[name] = read(name, fn);
  const app = build();
  return {
    schema: REPORT_SCHEMA, version: REPORT_VERSION, id: crypto.randomUUID?.() ?? String(Date.now()), createdAt: new Date().toISOString(),
    description: String(description).slice(0, 2000),
    app: { name: 'TypeSafe Place', version: app.version, commit: app.commit, mode: import.meta.env?.MODE ?? null, host: location.host, path: sanitizeUrl(location.href) },
    environment: read('environment', environment), performance: read('performance', timing), storage: await storage().catch(() => null),
    ...sections,
    errors: logs.errors.map(entry => ({ ...entry })), console: logs.console.map(entry => ({ ...entry })), network: logs.network.map(entry => ({ ...entry })), breadcrumbs: logs.breadcrumbs.map(entry => ({ ...entry })),
    sourceErrors, screenshot: screenshot ?? null,
  };
}

// A readable summary first, then the full report, for pasting into an issue or chat.
export function reportMarkdown(report) {
  const env = report.environment ?? {}, renderer = report.renderer ?? {}, frames = report.performance?.frames ?? {}, game = report.game ?? {};
  const row = (label, value) => (value === undefined || value === null || value === '' ? '' : `| ${label} | ${String(value).replace(/\|/g, '\\|')} |\n`);
  const { screenshot, ...rest } = report;
  const top = report.errors?.slice(-5).map(error => `- \`${error.type}\` ${error.message}${error.count > 1 ? ` (×${error.count})` : ''}`).join('\n');
  return `# TypeSafe Place problem report\n\nReport \`${report.id}\` · ${report.createdAt}\n\n${report.description ? `> ${report.description.replace(/\n/g, '\n> ')}\n\n` : ''}`
    + `| | |\n|---|---|\n`
    + row('Build', `${report.app?.version} · ${String(report.app?.commit).slice(0, 12)}${report.app?.mode ? ` · ${report.app.mode}` : ''}`)
    + row('Page', `${report.app?.host}${report.app?.path}`) + row('Browser', env.browser) + row('Platform', `${env.platform}${env.desktopApp ? ' · desktop app' : ''}`)
    + row('GPU', renderer.gpu ? `${renderer.gpu} (WebGL ${renderer.webgl})` : null)
    + row('Viewport', env.viewport ? `${env.viewport.join('×')} @${env.devicePixelRatio}x` : null)
    + row('Frames', frames.count ? `${frames.fps} fps · median ${frames.medianMs} ms · p99 ${frames.p99Ms} ms · ${frames.over50Ms} over 50 ms` : null)
    + row('Quality', renderer.quality ? JSON.stringify(renderer.quality) : null)
    + row('Place', game.place ?? null) + row('Position', game.position ? game.position.join(', ') : null)
    + row('Errors', `${report.errors?.length ?? 0} errors · ${report.console?.length ?? 0} console · ${report.network?.length ?? 0} failed requests`)
    + (top ? `\n## Latest errors\n\n${top}\n` : '')
    + `\n## Full report\n\n\`\`\`json\n${JSON.stringify({ ...rest, screenshot: screenshot ? '[attached separately]' : null }, null, 2)}\n\`\`\`\n`;
}

// Read-only access for tests and the debug panel.
export const diagnosticLogs = () => logs;
