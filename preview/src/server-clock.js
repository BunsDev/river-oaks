// @ts-check
// The town's clock as this page best knows it (#777). Each snapshot carries
// the server's time when it was sent; arrival is later by the network delay,
// so the largest recent (server - local) difference is the best estimate of
// the offset. Server-timed motion (Ribbonwing maneuvers) reads serverNow().
const samples = /** @type {number[]} */ ([]);
let offset = 0;

/** @param {unknown} serverTimeMs @param {number} [localTime] */
export function observeServerTime(serverTimeMs, localTime = Date.now()) {
  if (typeof serverTimeMs !== 'number' || !Number.isFinite(serverTimeMs)) return;
  samples.push(serverTimeMs - localTime);if (samples.length > 20) samples.shift();
  offset = Math.max(...samples);
}
export const serverNow = (localTime = Date.now()) => localTime + offset;
export const resetServerClock = () => { samples.length = 0;offset = 0; };
