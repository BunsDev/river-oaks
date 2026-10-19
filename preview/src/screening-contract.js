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

// Allowlisted media. The server takes only the id and duration from here; the client plays
// the bundled sources (preview/public/assets/ipic/screening, hashes in its sources.json).
// The host chooses among a venue's approved films (#499); the venue's default is the approved
// short (#365, Val, 2026-10-15). The fixture is a labelled synthetic test clip that tests and
// tools can still name by command; it is never offered as a film to choose. audio and poster
// say truthfully what each film carries, for the chooser.
const SHORT_TEXT = ['Westheimer Road, River Oaks.', 'Jevica’s office, by invitation.', 'Room for good work.', 'A scene idea, saved privately.', 'Then out, to meet a friend at IPIC.', 'Past the lounge.', 'Two seats, one screen.', 'Then back to the street.'];
const FIXTURE_TEXT = ['Fixture clip: a test pattern for shared playback.', 'A tone sounds once each second.', 'This is not the IPIC screening short.'];
const TWO_SEATS_TEXT = ["[Soft piano music]", "Maya: Two seats, front row. Told you we'd make it.", "Theo: Barely. Westheimer was all brake lights.", "Maya: So what's on tonight?", "Theo: Whatever the host picks. That's half the fun.", "Maya: No spoilers, then.", "Theo: None. Just a good seat and good company.", "[The house lights dim]", "Maya: Here it comes.", "Theo: Phones down. Sound on.", "[The piano swells, then fades]"];
export const SCREENING_MEDIA = freeze({
  'ipic-original-v1': freeze({
    id: 'ipic-original-v1', venues: freeze(['ipic']), durationMs: 52_555, label: 'River Oaks: an evening at the office and IPIC', fixture: false,
    audio: 'silent', poster: '/assets/ipic/screening/ipic-original-v1-poster.jpg',
    sources: freeze([
      freeze({ src: '/assets/ipic/screening/ipic-original-v1.webm', type: 'video/webm; codecs="vp9, opus"' }),
      freeze({ src: '/assets/ipic/screening/ipic-original-v1.mp4', type: 'video/mp4; codecs="avc1.4D401F, mp4a.40.2"' }),
    ]),
    captions: freeze({ src: '/assets/ipic/screening/ipic-original-v1.en.vtt', srclang: 'en', label: 'English' }),
    transcript: freeze(SHORT_TEXT),
  }),
  'ipic-fixture-v1': freeze({
    id: 'ipic-fixture-v1', venues: freeze(['ipic']), durationMs: 30_000, label: 'Fixture clip (test pattern)', fixture: true,
    audio: 'test tone', poster: null,
    sources: freeze([
      freeze({ src: '/assets/ipic/screening/fixture-v1.webm', type: 'video/webm; codecs="vp9, opus"' }),
      freeze({ src: '/assets/ipic/screening/fixture-v1.mp4', type: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"' }),
    ]),
    captions: freeze({ src: '/assets/ipic/screening/fixture-v1.en.vtt', srclang: 'en', label: 'English' }),
    transcript: freeze(FIXTURE_TEXT),
  }),
  'ipic-two-seats-v1': freeze({
    id: 'ipic-two-seats-v1', venues: freeze(['ipic']), durationMs: 62_000, label: 'Two Seats, One Screen', fixture: false,
    audio: 'dialogue and music', poster: '/assets/ipic/screening/ipic-two-seats-v1-poster.jpg',
    sources: freeze([
      freeze({ src: '/assets/ipic/screening/ipic-two-seats-v1.webm', type: 'video/webm; codecs="vp9, opus"' }),
      freeze({ src: '/assets/ipic/screening/ipic-two-seats-v1.mp4', type: 'video/mp4; codecs="avc1.4D401F, mp4a.40.2"' }),
    ]),
    captions: freeze({ src: '/assets/ipic/screening/ipic-two-seats-v1.en.vtt', srclang: 'en', label: 'English' }),
    transcript: freeze(TWO_SEATS_TEXT),
  }),
});

// The film Start plays unless the host chooses another, named rather than taken from catalog order.
export const SCREENING_DEFAULT_MEDIA = freeze({ ipic: 'ipic-original-v1' });
// The films a host may choose for a venue: allowlisted for it, never a fixture (tests may ask for
// those), the default first. The server still checks every Start against the allowlist.
export function screeningChoices(venueId, { fixtures = false } = {}) {
  const first = SCREENING_DEFAULT_MEDIA[venueId];
  return Object.values(SCREENING_MEDIA).filter(film => film.venues.includes(venueId) && (fixtures || !film.fixture))
    .sort((a, b) => Number(b.id === first) - Number(a.id === first));
}

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
