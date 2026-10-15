// The shared screening contract (#366): which venues can screen, which media they may
// show, what a command may carry, and how a client projects the shared timeline.
// The town (server/screenings.js) owns the timeline; a client only reads snapshots
// and asks. Nothing here accepts a position, duration, URL or owner from a viewer.
import { IPIC_INTERIOR } from './ipic-plan.js';

const freeze = value => Object.freeze(value);

// A venue is a mapped interior; the server decides membership from where the player stands.
export const SCREENING_VENUES = freeze({
  ipic: freeze({ id: 'ipic', interior: IPIC_INTERIOR, label: 'IPIC auditorium' }),
});

// Allowlisted media. The server takes the duration from here; files, sources and
// captions are bundled with the client player (#367). The fixture is a labelled test
// clip, never the approved short (#365).
export const SCREENING_MEDIA = freeze({
  'ipic-fixture-v1': freeze({ id: 'ipic-fixture-v1', venues: freeze(['ipic']), durationMs: 12_000, label: 'Fixture clip (test pattern)', fixture: true }),
});

export const SCREENING_STATUSES = freeze(['stopped', 'playing', 'paused', 'ended']);
export const SCREENING_CONTROLS = freeze(['start', 'play', 'pause', 'stop']);
export const SCREENING_ID = /^[A-Za-z0-9_-]{8,64}$/;

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactly = (message, keys) => Object.keys(message).length === keys.length && keys.every(key => Object.hasOwn(message, key));
const invalid = { ok: false, error: 'invalid_screening' };

export function parseScreeningCommand(message) {
  if (!record(message) || message.type !== 'screening' || !Object.hasOwn(SCREENING_VENUES, message.venueId)) return invalid;
  const { action, venueId } = message;
  if (action === 'sync') return exactly(message, ['type', 'action', 'venueId']) ? { ok: true, command: { action, venueId } } : invalid;
  if (!SCREENING_CONTROLS.includes(action)) return invalid;
  const keys = ['type', 'action', 'venueId', 'epoch', 'expectedRevision', 'operationId', ...(action === 'start' ? ['mediaId'] : [])];
  if (!exactly(message, keys)) return invalid;
  const { epoch, expectedRevision, operationId, mediaId } = message;
  if (typeof epoch !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(epoch)) return invalid;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision > 2 ** 40) return invalid;
  if (typeof operationId !== 'string' || !SCREENING_ID.test(operationId)) return invalid;
  if (action === 'start' && !(Object.hasOwn(SCREENING_MEDIA, mediaId) && SCREENING_MEDIA[mediaId].venues.includes(venueId))) return invalid;
  return { ok: true, command: { action, venueId, epoch, expectedRevision, operationId, ...(action === 'start' ? { mediaId } : {}) } };
}

// Elapsed position at a server time: anchored, never before the anchor, never past the end.
export function screeningPositionAt(view, serverTimeMs) {
  const base = Math.max(0, Math.min(view.positionMs, view.durationMs));
  if (view.status !== 'playing' || !Number.isFinite(serverTimeMs)) return base;
  return Math.min(view.durationMs, base + Math.max(0, serverTimeMs - view.anchorServerTimeMs));
}

export function screeningStatusAt(view, serverTimeMs) {
  return view.status === 'playing' && Number.isFinite(serverTimeMs) && screeningPositionAt(view, serverTimeMs) >= view.durationMs ? 'ended' : view.status;
}
