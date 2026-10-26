// Shared screenings (#366): the town holds one timeline per venue, and only a host with an
// explicit server-side grant changes it. The timeline is a status and an elapsed position
// anchored to server time; everyone reads it from the snapshot and projects the position
// themselves (preview/src/screening-contract.js). A viewer never moves it.
//
// It lives inside the world like the table games, so the memory town and the Redis room
// (one leased writer, one fenced commit) apply the same rules and two gateways can never
// hold competing timelines. Retries carry an operation id; the receipt is scoped to the
// actor, session, venue and epoch and remembers a digest of what was asked, so a retry
// applies once and a reused id with different content is refused.
import { createHash, randomUUID } from 'node:crypto';
import {
  SCREENING_MEDIA, SCREENING_STATUSES, SCREENING_VENUES, parseScreeningCommand, screeningPositionAt,
} from '../preview/src/screening-contract.js';

export const SCREENING_RECEIPTS = 64, SCREENING_RESTORE_GRACE_MS = 15_000;
const VIEW_FIELDS = ['venueId', 'screeningId', 'mediaId', 'status', 'revision', 'positionMs', 'anchorServerTimeMs', 'durationMs', 'hostId'];
const EPOCH = /^[A-Za-z0-9_-]{1,64}$/, USER = /^[A-Za-z0-9_.|-]{1,160}$/;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactly = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const reject = (error, message = error) => ({ ok: false, error, message });
const sha256 = value => createHash('sha256').update(value).digest('hex');
const stopped = (venueId, revision) => ({ venueId, screeningId: null, mediaId: null, status: 'stopped', revision, positionMs: 0, anchorServerTimeMs: 0, durationMs: 0, hostId: null });

// RIVER_OAKS_SCREENING_HOSTS="ipic:<userId>[@<ISO expiry>],…". A malformed entry grants nothing.
export function parseScreeningHosts(text = '', { onInvalid = () => {} } = {}) {
  const grants = [];
  for (const entry of String(text ?? '').split(',').map(item => item.trim()).filter(Boolean)) {
    const match = /^([a-z][a-z0-9-]{0,31}):([^@]+)(?:@(.+))?$/.exec(entry);
    const until = match?.[3] === undefined ? null : Date.parse(match[3]);
    if (!match || !Object.hasOwn(SCREENING_VENUES, match[1]) || !USER.test(match[2]) || Number.isNaN(until)) { onInvalid(entry); continue; }
    grants.push({ venueId: match[1], userId: match[2], until });
  }
  return grants;
}

export function createScreenings({ players, inVenue, grants: listed = [], changed = () => {}, randomId = () => randomUUID().replaceAll('-', '') }) {
  // A grant without an expiry lasts for the process; nothing else confers hosting.
  const grants = listed.map(({ venueId, userId, until = null }) => ({ venueId, userId, until: Number.isFinite(until) ? until : null }));
  let epoch = randomId(), venues = new Map(), receipts = [];
  const fresh = (revisions = new Map()) => new Map(Object.keys(SCREENING_VENUES).map(id => [id, stopped(id, revisions.get(id) ?? 0)]));
  venues = fresh();
  const view = entry => ({ ...entry, epoch });
  // A host is whoever holds a live grant for the venue; the last grant listed wins a tie.
  const grantFor = (userId, venueId) => grants.filter(grant => grant.userId === userId && grant.venueId === venueId)
    .sort((a, b) => (a.until ?? Infinity) - (b.until ?? Infinity)).at(-1) ?? null;
  const hostAt = (userId, venueId, time) => { const grant = grantFor(userId, venueId); return Boolean(grant) && (grant.until === null || time < grant.until); };

  function pause(entry, at) {
    Object.assign(entry, { status: 'paused', positionMs: screeningPositionAt(entry, at), anchorServerTimeMs: at, revision: entry.revision + 1 });
  }
  // A playing film ends at its duration; it pauses where it was when its host left town,
  // walked out of the venue, or lost the grant (at the instant the grant lapsed).
  function prune(time) {
    let touched = false;
    for (const entry of venues.values()) {
      if (entry.status !== 'playing') continue;
      const end = entry.anchorServerTimeMs + entry.durationMs - entry.positionMs;
      const host = players.get(entry.hostId), grant = grantFor(entry.hostId, entry.venueId);
      let lostAt = null;
      if (!host || !grant || !inVenue(host, entry.venueId)) lostAt = time;
      else if (grant.until !== null && grant.until <= time) lostAt = Math.max(entry.anchorServerTimeMs, grant.until);
      if (end <= (lostAt ?? time)) Object.assign(entry, { status: 'ended', positionMs: entry.durationMs, anchorServerTimeMs: end, revision: entry.revision + 1 });
      else if (lostAt !== null) pause(entry, lostAt);
      else continue;
      touched = true;
    }
    if (touched) changed();
  }

  function command(player, message, time, { sessionId = null } = {}) {
    const parsed = parseScreeningCommand(message);
    if (!parsed.ok) return parsed;
    const ask = parsed.command;
    prune(time);
    const entry = venues.get(ask.venueId);
    if (ask.action === 'sync') return { ok: true, screening: view(entry), canHost: inVenue(player, ask.venueId) && hostAt(player.id, ask.venueId, time), serverTimeMs: time };
    if (ask.epoch !== epoch) return reject('screening_stale', 'The screening changed. Refresh and try again.');
    if (!inVenue(player, ask.venueId)) return reject('screening_not_in_venue', 'Go into the auditorium to host the film.');
    if (!hostAt(player.id, ask.venueId, time)) return reject('screening_host_required', 'Only the venue host can control the film.');
    const key = JSON.stringify([player.id, sessionId, ask.venueId, epoch, ask.operationId]);
    const digest = sha256(JSON.stringify([ask.action, ask.venueId, ask.epoch, ask.expectedRevision, ask.mediaId ?? null]));
    const prior = receipts.find(item => item.key === key);
    if (prior) return prior.digest === digest ? { ...prior.reply, replayed: true, serverTimeMs: time } : reject('screening_operation_conflict', 'That request was already used for something else.');
    if (ask.expectedRevision !== entry.revision) return reject('screening_stale', 'The screening changed. Refresh and try again.');
    switch (ask.action) {
      case 'start': {
        if (!['stopped', 'ended'].includes(entry.status)) return reject('screening_in_progress', 'Stop this screening first.');
        const media = SCREENING_MEDIA[ask.mediaId], revision = entry.revision + 1;
        Object.assign(entry, { screeningId: `${ask.venueId}-${epoch.slice(0, 12)}-${revision}`, mediaId: media.id, status: 'playing', revision,
          positionMs: 0, anchorServerTimeMs: time, durationMs: media.durationMs, hostId: player.id });
        break;
      }
      case 'play':
        if (entry.status !== 'paused') return reject('screening_not_paused', 'The film is not paused.');
        Object.assign(entry, { status: 'playing', anchorServerTimeMs: time, hostId: player.id, revision: entry.revision + 1 });
        break;
      case 'pause':
        if (entry.status !== 'playing') return reject('screening_not_playing', 'The film is not playing.');
        pause(entry, time);
        break;
      case 'stop':
        if (entry.status === 'stopped') return reject('screening_not_running', 'Nothing is showing.');
        venues.set(ask.venueId, stopped(ask.venueId, entry.revision + 1));
        break;
    }
    changed();
    const reply = { ok: true, screening: view(venues.get(ask.venueId)) };
    receipts.push({ key, digest, reply });
    if (receipts.length > SCREENING_RECEIPTS) receipts.shift();
    return { ...reply, serverTimeMs: time };
  }

  // Snapshots are one frame for everyone: public timeline fields only.
  const snapshot = () => [...venues.values()].map(view);
  const checkpoint = time => structuredClone({ epoch, savedAt: time, venues: [...venues.values()], receipts });

  // Restore refuses anything outside the contract. A film that was playing keeps playing
  // across a quick lease handoff, and pauses where it was saved after a longer outage.
  function validate(saved, time) {
    if (!exactly(saved, ['epoch', 'savedAt', 'venues', 'receipts']) || typeof saved.epoch !== 'string' || !EPOCH.test(saved.epoch)
      || !Number.isFinite(saved.savedAt) || saved.savedAt < 0 || !Array.isArray(saved.venues) || saved.venues.length !== Object.keys(SCREENING_VENUES).length
      || !Array.isArray(saved.receipts) || saved.receipts.length > SCREENING_RECEIPTS) throw new Error('Invalid screenings');
    const next = new Map();
    let retiredFixture = false;
    const validateTimeline = item => {
      if (!exactly(item, VIEW_FIELDS) || !Object.hasOwn(SCREENING_VENUES, item.venueId) || !SCREENING_STATUSES.includes(item.status)
        || !Number.isSafeInteger(item.revision) || item.revision < 0) throw new Error('Invalid screening');
      if (item.status === 'stopped') {
        if (JSON.stringify(item) !== JSON.stringify(stopped(item.venueId, item.revision))) throw new Error('Invalid stopped screening');
      } else {
        const media = SCREENING_MEDIA[item.mediaId];
        // Before bundled playback, this fixture id described a 12-second placeholder.
        // Recognize only that exact contract; never accept arbitrary media/durations.
        const historical = item.mediaId === 'ipic-fixture-v1' && item.durationMs === 12_000 && media?.durationMs === 30_000;
        if (!Object.hasOwn(SCREENING_MEDIA, item.mediaId) || !media.venues.includes(item.venueId) || (!historical && item.durationMs !== media.durationMs)
          || !Number.isFinite(item.positionMs) || item.positionMs < 0 || item.positionMs > item.durationMs || !Number.isFinite(item.anchorServerTimeMs) || item.anchorServerTimeMs < 0
          || typeof item.screeningId !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(item.screeningId)
          || !(item.hostId === null && item.status !== 'playing' || typeof item.hostId === 'string' && USER.test(item.hostId))
          || item.status === 'ended' && item.positionMs !== item.durationMs) throw new Error('Invalid screening timeline');
        retiredFixture ||= historical;
      }
    };
    for (const item of saved.venues) {
      validateTimeline(item);
      if (next.has(item.venueId)) throw new Error('Duplicate screening venue');
      next.set(item.venueId, { ...item });
    }
    for (const item of saved.receipts) {
      if (!exactly(item, ['key', 'digest', 'reply']) || typeof item.key !== 'string' || item.key.length > 512 || !/^[a-f0-9]{64}$/.test(item.digest)
        || !exactly(item.reply, ['ok', 'screening']) || item.reply.ok !== true || !exactly(item.reply.screening, [...VIEW_FIELDS, 'epoch'])) throw new Error('Invalid screening receipt');
      const { epoch: receiptEpoch, ...timeline } = item.reply.screening;
      if (receiptEpoch !== saved.epoch) throw new Error('Invalid screening receipt epoch');
      validateTimeline(timeline);
    }
    // The old clip cannot resume as different media. Rotate the epoch only after
    // validating everything, including old replies retained by a stopped venue.
    // Office visits and all other world state remain untouched; retries are stale.
    if (retiredFixture) return { epoch: randomId(), venues: fresh(new Map([...next].map(([id, entry]) => [id, entry.revision + 1]))), receipts: [] };
    if (time - saved.savedAt > SCREENING_RESTORE_GRACE_MS) for (const entry of next.values()) if (entry.status === 'playing') pause(entry, saved.savedAt);
    return { epoch: saved.epoch, venues: next, receipts: structuredClone(saved.receipts) };
  }
  // Checkpoints written before screenings existed restore to a fresh, stopped state.
  const blank = () => ({ epoch: randomId(), venues: fresh(), receipts: [] });
  const load = state => { ({ epoch, venues, receipts } = state); };
  // A trusted reset (and a region migration, which starts from a fresh checkpoint) opens a
  // new epoch: everything stops and commands written for the old epoch are stale.
  function reset() {
    epoch = randomId();
    venues = fresh(new Map([...venues].map(([id, entry]) => [id, entry.revision + 1])));
    receipts = [];
    changed();
  }

  // Account erasure: a film the account hosted pauses (prune) and forgets its host;
  // its receipts go, and so does any receipt whose reply names it as a film's host.
  // Without a receipt, a retry of that operation is answered as a new request.
  function forget(userId, time) {
    prune(time);
    for (const entry of venues.values()) if (entry.hostId === userId && entry.status !== 'playing') entry.hostId = null;
    const own = item => { try { return JSON.parse(item.key)[0] === userId; } catch { return false; } };
    receipts = receipts.filter(item => !own(item) && item.reply?.screening?.hostId !== userId);
    changed();
  }
  return { command, prune, forget, snapshot, checkpoint, validate, blank, load, reset };
}
