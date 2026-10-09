import { randomUUID } from 'node:crypto';

// Problem reports sent from the game's "Report a problem" dialog. Storage is
// bounded: the newest LIMIT reports are kept for TTL, oldest dropped first.
export const DEBUG_REPORT_SCHEMA = 'river-oaks.debug-report', DEBUG_REPORT_VERSION = 1;
export const MAX_DEBUG_REPORT_BYTES = 196_608, MAX_SCREENSHOT_CHARS = 140_000, MAX_DESCRIPTION = 2000;
const LIMIT = 50, TTL = 30 * 86_400_000;

const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const shortText = (value, max) => typeof value === 'string' && value.length <= max;

// Accept a report object from a client, or null. Free-form sections are kept as
// sent (they are JSON and never rendered as markup); the envelope is checked.
export function validDebugReport(data) {
  if (!plainObject(data) || data.schema !== DEBUG_REPORT_SCHEMA || data.version !== DEBUG_REPORT_VERSION) return null;
  if (!shortText(data.description ?? '', MAX_DESCRIPTION) || !shortText(data.createdAt, 40) || Number.isNaN(Date.parse(data.createdAt))) return null;
  if (!plainObject(data.app) || !plainObject(data.environment)) return null;
  if (data.screenshot !== undefined && data.screenshot !== null
    && !(shortText(data.screenshot, MAX_SCREENSHOT_CHARS) && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data.screenshot))) return null;
  for (const key of ['errors', 'console', 'network', 'breadcrumbs']) if (data[key] !== undefined && !Array.isArray(data[key])) return null;
  return data;
}

// What an admin sees in the list before downloading a report.
export function debugReportSummary(record) {
  const text = value => typeof value === 'string' ? value.slice(0, 200) : '';
  const firstError = record.report.errors?.find(item => plainObject(item));
  return {
    id: record.id, receivedAt: record.receivedAt, reporter: record.reporter,
    description: text(record.report.description),
    version: text(record.report.app?.version), commit: text(record.report.app?.commit), path: text(record.report.app?.path),
    errors: record.report.errors?.length ?? 0, firstError: firstError ? text(firstError.message) : '',
    browser: text(record.report.environment?.browser), screenshot: Boolean(record.report.screenshot),
  };
}

const recordFor = (report, reporter, now, createId) => ({ id: createId(), receivedAt: new Date(now).toISOString(), reporter, report });

export function createMemoryDebugReports({ now = Date.now, createId = randomUUID, limit = LIMIT, ttl = TTL } = {}) {
  let records = [];
  const prune = () => { const cutoff = now() - ttl; records = records.filter(record => Date.parse(record.receivedAt) > cutoff).slice(0, limit); };
  return {
    async add(report, reporter) { const record = recordFor(report, reporter, now(), createId); records.unshift(record); prune(); return { ok: true, id: record.id }; },
    async list() { prune(); return records.map(debugReportSummary); },
    async get(id) { prune(); return records.find(record => record.id === id) ?? null; },
  };
}

// One Redis list per namespace, newest first, trimmed and expired as a whole.
const ADD = `
redis.call('LPUSH', KEYS[1], ARGV[1])
redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1)
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[3]))
return 'ok'`;
const LIST = `return redis.call('LRANGE', KEYS[1], 0, -1)`;

export function createRedisDebugReports({ redis, prefix, now = Date.now, createId = randomUUID, limit = LIMIT, ttl = TTL } = {}) {
  if (!redis?.eval || typeof prefix !== 'string' || !/^\{[^{}]+\}$/.test(prefix)) throw new Error('Invalid debug report storage');
  const key = `${prefix}:debug-reports`;
  const all = async () => {
    const cutoff = now() - ttl;
    return (await redis.eval(LIST, 1, key)).flatMap(raw => { try { return [JSON.parse(raw)]; } catch { return []; } })
      .filter(record => Date.parse(record.receivedAt) > cutoff);
  };
  return {
    async add(report, reporter) {
      const record = recordFor(report, reporter, now(), createId);
      await redis.eval(ADD, 1, key, JSON.stringify(record), limit, ttl);
      return { ok: true, id: record.id };
    },
    async list() { return (await all()).map(debugReportSummary); },
    async get(id) { return (await all()).find(record => record.id === id) ?? null; },
  };
}
