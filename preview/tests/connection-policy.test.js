import test from 'node:test';
import assert from 'node:assert/strict';
import { CONNECTING, IMPROVED, OFFLINE_STALE_MS, QUIET_CHECKS, STALE_SNAPSHOT_MS, UPDATING, closeNotice, createStalenessWatch, retryDelay } from '../src/connection-policy.js';

test('retries back off to 30 s, with each delay drawn from the upper half of its step', () => {
  const steps = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
  steps.forEach((ceiling, attempt) => {
    assert.equal(retryDelay(attempt, () => 0), ceiling / 2, `attempt ${attempt} floor`);
    assert.equal(retryDelay(attempt, () => 1), ceiling, `attempt ${attempt} ceiling`);
  });
  // Pages that lost the same server do not return together.
  const spread = new Set(Array.from({ length: 20 }, (_, i) => retryDelay(3, () => i / 20)));
  assert.equal(spread.size, 20);
  assert.equal(retryDelay(-4, () => 0), 500);
});

test('a visible page that hears no snapshot for 8 s holds a dead socket', () => {
  const watch = createStalenessWatch();
  watch.heard(10_000);
  let now = 10_000;
  for (; now <= 10_000 + STALE_SNAPSHOT_MS; now += 1000) assert.equal(watch.stale(now), false, `fresh at ${now}`);
  assert.equal(watch.stale(now), true, 'stale once 8 s pass without a snapshot');
  watch.heard(now);
  assert.equal(watch.stale(now + 1000), false, 'a snapshot clears it');
});

test('a frozen page gets several checks before its socket is judged, and late checks still reach a verdict', () => {
  // The page was frozen for 12 s: the first checks after it do not judge the socket.
  const watch = createStalenessWatch();
  watch.heard(0);
  const late = [13_000, 16_000, 19_000, 22_000, 25_000];
  late.slice(0, QUIET_CHECKS - 1).forEach(now => assert.equal(watch.stale(now), false, `check at ${now}`));
  assert.equal(watch.stale(late[QUIET_CHECKS - 1]), true, 'every check ran late, and the socket is still judged');
  // Coming back into view after a long time hidden: the checks count afresh.
  const back = createStalenessWatch();
  back.heard(0);
  back.resume();
  for (const now of [60_000, 61_000, 62_000, 63_000]) assert.equal(back.stale(now), false, `grace on return, ${now}`);
  assert.equal(back.stale(64_000), true);
  // A snapshot inside the grace clears it.
  const fresh = createStalenessWatch();
  fresh.heard(0);
  fresh.stale(20_000); fresh.heard(20_500);
  for (let now = 21_000; now <= 28_000; now += 1000) assert.equal(fresh.stale(now), false);
});

test('an update says the world is improving, not that the player was disconnected', () => {
  assert.equal(closeNotice(1012, 'River Oaks is updating.'), UPDATING);
  assert.match(UPDATING.title, /improving/);
  assert.doesNotMatch(`${UPDATING.title} ${UPDATING.description} ${UPDATING.status}`, /lost|disconnect|unavailable/i);
  assert.equal(UPDATING.terminal, false, 'the page keeps rejoining on its own');
  for (const code of [4000, 426]) {
    const notice = closeNotice(code, 'World version changed');
    assert.equal(notice, IMPROVED);
    assert.equal(notice.refresh, true, 'a new version offers a refresh');
    assert.doesNotMatch(`${notice.title} ${notice.description} ${notice.status}`, /lost|disconnect|changed/i);
  }
});

test('other closes keep their meaning and whether the page retries', () => {
  assert.deepEqual([4003, 4009].map(code => closeNotice(code).terminal), [true, true]);
  assert.equal(closeNotice(4009).status, 'Your account joined from another tab.');
  assert.equal(closeNotice(4010).terminal, false);
  assert.equal(closeNotice(1006).status, 'Connection lost. Rejoining the town…');
  assert.equal(closeNotice(4901, 'No town updates.').terminal, false);
  assert.equal(CONNECTING.status, 'Connecting to the town…');
});

test('a page the browser reports offline admits a silent socket at once, and a socket still delivering stays (#290)', () => {
  let online = true;
  const watch = createStalenessWatch({ online: () => online });
  watch.heard(0);
  assert.equal(watch.stale(OFFLINE_STALE_MS + 1), false, 'online: a short silence is nothing');
  online = false;
  assert.equal(watch.stale(OFFLINE_STALE_MS + 1), true, 'offline: the same silence is a dead socket, with no quiet checks to wait out');
  // A socket the network loss did not reach (a local server) keeps delivering and stays.
  const local = createStalenessWatch({ online: () => false });
  for (let now = 0; now <= 5000; now += 200) { local.heard(now); assert.equal(local.stale(now + 100), false, `delivering at ${now}`); }
  assert.ok(OFFLINE_STALE_MS >= 600 && OFFLINE_STALE_MS < 1000, 'several missed snapshots, and well inside a watchdog tick');
  // By default the watch asks the browser.
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
    const browser = createStalenessWatch(); browser.heard(0);
    assert.equal(browser.stale(OFFLINE_STALE_MS + 1), true);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    const unknown = createStalenessWatch(); unknown.heard(0);
    assert.equal(unknown.stale(OFFLINE_STALE_MS + 1), false, 'a browser that cannot tell counts as online');
  } finally { if (saved) Object.defineProperty(globalThis, 'navigator', saved); else delete globalThis.navigator; }
});
