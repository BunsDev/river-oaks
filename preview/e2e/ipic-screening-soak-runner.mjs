// IPIC screening soak (#368, returned to #367): node preview/e2e/ipic-screening-soak-runner.mjs [cycles]
// Starts the loopback browser fixture with a synthetic host grant for alice and runs
// preview/e2e/ipic-screening-soak.js: alice hosts, bob enters and leaves IPIC once to warm up
// and then `cycles` (default 10) more times, with resource counters after every exit.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

// Counts what the page creates, without changing what it does: media elements it plays or
// creates, AudioContexts, live intervals and pending timeouts, and play() calls.
const instrument = () => {
  const media = new Set(), contexts = new Set(), intervals = new Set(), timeouts = new Set();
  let playCalls = 0;
  const track = element => { if (!element.__soakTracked) { element.__soakTracked = true; media.add(new WeakRef(element)); } };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) { track(this); playCalls++; return play.apply(this, args); };
  const create = Document.prototype.createElement;
  Document.prototype.createElement = function (...args) { const element = create.apply(this, args); if (element instanceof HTMLMediaElement) track(element); return element; };
  if (window.AudioContext) window.AudioContext = class extends window.AudioContext { constructor(...args) { super(...args); contexts.add(new WeakRef(this)); } };
  const { setInterval: si, clearInterval: ci, setTimeout: st, clearTimeout: ct } = window;
  window.setInterval = function (...args) { const id = si.apply(this, args); intervals.add(id); return id; };
  window.clearInterval = function (id) { intervals.delete(id); return ci.call(this, id); };
  window.setTimeout = function (callback, ...args) {
    let id;
    const run = typeof callback === 'function' ? function (...values) { timeouts.delete(id); return callback.apply(this, values); } : callback;
    id = st.call(this, run, ...args); timeouts.add(id); return id;
  };
  window.clearTimeout = function (id) { timeouts.delete(id); return ct.call(this, id); };
  const live = set => [...set].map(ref => ref.deref()).filter(Boolean);
  window.__soak = { counters: () => {
    const elements = live(media);
    return { mediaTracked: elements.length, mediaInDom: document.querySelectorAll('video, audio').length, mediaLoaded: elements.filter(el => el.readyState > 0 || el.currentSrc).length,
      mediaPlaying: elements.filter(el => !el.paused).length, audioContexts: live(contexts).filter(context => context.state !== 'closed').length,
      intervals: intervals.size, timeouts: timeouts.size, playCalls };
  } };
};

const cycles = Number(process.argv[2] ?? 10);
if (!Number.isInteger(cycles) || cycles < 1) throw new Error('cycles must be a positive integer');
const release = await holdBrowserLock('IPIC screening soak');
let fixture, browser;
await mkdir('output/playwright/ipic', { recursive: true });
try {
  fixture = await startBrowserFixture({ env: { VITE_SHARED_SOFTWARE_RENDERING: '1', RIVER_OAKS_SCREENING_HOSTS: 'ipic:alice' } });
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const sessions = new Map();
  const open = async identity => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies([{ name: 'fixture_session', value: identity, url: fixture.origin }]);
    await context.addInitScript(instrument);
    const page = await context.newPage(); page.setDefaultTimeout(60000);
    sessions.set(page, await context.newCDPSession(page));
    return page;
  };
  const [host, viewer] = [await open('alice'), await open('bob')];
  const tools = {
    cycles,
    gc: async page => { await sessions.get(page).send('HeapProfiler.collectGarbage'); await page.waitForTimeout(50); await sessions.get(page).send('HeapProfiler.collectGarbage'); },
    dom: async page => sessions.get(page).send('Memory.getDOMCounters'),
  };
  const source = (await readFile('preview/e2e/ipic-screening-soak.js', 'utf8')).replaceAll('http://127.0.0.1:5173', fixture.origin);
  const started = Date.now();
  try {
    const result = await eval(`(${source})`)(host, viewer, tools);
    await writeFile('output/playwright/ipic/screening-soak.json', JSON.stringify({ status: 'passed', browser: await browser.version(), durationMs: Date.now() - started, ...result }, null, 2));
    console.log(JSON.stringify({ checks: result.checks, convergedAfterMs: result.cycles.map(item => item.convergedAfterMs), growth: Object.fromEntries(Object.entries(result.growth).map(([key, value]) => [key, [value.baseline, value.last]])) }));
  } catch (error) {
    await Promise.all([host.screenshot({ path: 'output/playwright/ipic/soak-host-failure.png' }), viewer.screenshot({ path: 'output/playwright/ipic/soak-viewer-failure.png' })].map(p => p.catch(() => {})));
    await writeFile('output/playwright/ipic/screening-soak.json', JSON.stringify({ status: 'failed', durationMs: Date.now() - started, error: error.stack }, null, 2));
    throw error;
  }
} finally { await browser?.close(); await fixture?.close(); release(); }
