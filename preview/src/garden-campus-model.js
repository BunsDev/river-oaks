// The Gardens' rental directory and lease actions on the client (#510), without DOM: what
// the campus panel shows from a `campus list` answer, which actions each record offers,
// and the commands it sends. Leases are owner-managed and never charge; the label comes
// from the server's answer, and this model has no price, currency or payment notion.
//
// Retries: every intent (an action on a record) keeps one operation id until the server
// answers it, so a timeout or reconnect retries the same operation and the server replays
// it instead of acting twice (#509 receipts). A definite answer, success or refusal, ends
// the intent; the next click is a new operation.
import { CAMPUS_LEASE_CONTRACT, CAMPUS_LEASE_ERRORS, CAMPUS_LEASE_LABEL, campusLeaseUnits } from '../../shared/garden-campus-lease-contract.js';

const DAY = 86_400_000;
export const CAMPUS_DEFAULT_TERM_DAYS = 30;
const SIDES = { 'W-S': 'west, south end', 'W-N': 'west, north end', E: 'east side', 'E-S': 'east, south end', 'E-N': 'east, north end' };
const TOWERS = { T1: 'Grove Offices', T2: 'The Commons', T3: 'Atelier Offices' };
const units = new Map(campusLeaseUnits().map(unit => [unit.unitId, unit]));

/** Where a suite is, in words a visitor can follow from the street. */
export function campusSuiteDirections(unitId) {
  const unit = units.get(unitId);
  if (!unit) return null;
  const side = SIDES[unitId.split('-').slice(2).join('-')] ?? 'off the gallery';
  return `${TOWERS[unit.tower]} (${unit.tower}), Floor ${unit.floor}: take the lift from the ground-floor hall, then suite ${unit.number} is on the ${side} of the corridor.`;
}
export const campusErrorMessage = (code, fallback) => CAMPUS_LEASE_ERRORS[code] ?? fallback ?? 'The campus could not complete that. Try again.';
const day = ms => new Date(ms).toISOString().slice(0, 10);

// Endings (#510). The server keeps each account's ended leases and closed requests with a
// reason (#509); the directory says what happened to the newest few from the last month.
// A request answered with an offer is left out: the offer's own row continues its story.
export const CAMPUS_OUTCOMES_SHOWN = 5, CAMPUS_OUTCOME_WINDOW_DAYS = 30;
const LEASE_ENDINGS = {
  expired: d => `The lease ended on ${d}: its term ran out.`,
  revoked: d => `The lease ended on ${d}: the campus operator ended it.`,
  released: d => `The lease ended on ${d}: you gave the suite up.`,
  declined: d => `You declined this offer on ${d}.`,
  withdrawn: d => `The campus operator withdrew this offer on ${d}.`,
  superseded: d => `This offer closed on ${d}: another offer for the suite was accepted first.`,
  offer_expired: d => `This offer lapsed unanswered on ${d}.`,
  retired: d => `This lease ended on ${d}: the campus no longer offers this suite.`,
};
// The same endings told to the operator whose own offer or extension they overtook.
const OPERATOR_ENDINGS = {
  ...LEASE_ENDINGS,
  revoked: d => `The lease ended on ${d}: a campus operator ended it.`,
  released: d => `The lease ended on ${d}: the tenant gave the suite up.`,
  declined: d => `The resident declined this offer on ${d}.`,
  withdrawn: d => `A campus operator withdrew this offer on ${d}.`,
};
const REQUEST_ENDINGS = {
  cancelled: d => `You withdrew your request on ${d}.`,
  declined: d => `The campus operator declined your request on ${d}.`,
  expired: d => `Your request lapsed unanswered on ${d}.`,
  retired: d => `Your request closed on ${d}: the campus no longer offers this suite.`,
};
function campusOutcomes(campus, now, notices) {
  const since = now - CAMPUS_OUTCOME_WINDOW_DAYS * DAY;
  const leases = (campus.leases ?? []).filter(lease => lease.status === 'ended' && lease.role !== 'guest')
    .map(lease => ({ kind: 'lease', id: lease.id, unitId: lease.unitId, number: lease.number, at: lease.endedAt, reason: lease.endedReason,
      text: (LEASE_ENDINGS[lease.endedReason] ?? (d => `This lease ended on ${d}.`))(day(lease.endedAt)) }));
  const requests = (campus.requests ?? []).filter(item => item.status !== 'pending' && item.status !== 'offered')
    .map(item => ({ kind: 'request', id: item.id, unitId: item.unitId, number: item.number, at: item.closedAt, reason: item.status,
      text: (REQUEST_ENDINGS[item.status] ?? (d => `Your request closed on ${d}.`))(day(item.closedAt)) }));
  return [...leases, ...requests, ...notices].filter(item => Number.isFinite(item.at) && item.at >= since)
    .sort((a, b) => b.at - a.at).slice(0, CAMPUS_OUTCOMES_SHOWN);
}

/**
 * A retry the server replays answers with the record as it is now (#509 receipts). When that
 * record no longer shows what the action did (an accepted lease since ended, an asked suite
 * since declined), say what happened instead of plain success. Ending actions always hold.
 */
const STILL = { request: item => ['pending', 'offered'].includes(item.status), accept: item => item.status === 'active', grant: item => item.status === 'active',
  renew: item => item.status === 'active', issue: item => ['offered', 'active'].includes(item.status) };
export function campusReplayChange(action, result) {
  const holds = STILL[action], item = result?.lease ?? result?.request;
  if (!result?.replayed || !holds || !item || holds(item)) return null;
  const endings = action === 'issue' || action === 'renew' ? OPERATOR_ENDINGS : LEASE_ENDINGS;
  if (result.lease) return (endings[item.endedReason] ?? (d => `This lease ended on ${d}.`))(day(item.endedAt));
  return (REQUEST_ENDINGS[item.status] ?? (d => `Your request closed on ${d}.`))(day(item.closedAt));
}

/**
 * Guest access the page saw in its previous list and no longer sees. The server clears a
 * lease's guests when it ends and keeps no record of them, so a former guest's own list is
 * silent; only the page that listed both answers can tell them. `left` holds the leases
 * this page left on purpose.
 */
export function campusLostGuestAccess(before, after, { left = new Set(), at = Date.now() } = {}) {
  const still = new Set((after?.leases ?? []).map(lease => lease.id));
  return (before?.leases ?? []).filter(lease => lease.role === 'guest' && lease.status === 'active' && !still.has(lease.id) && !left.has(lease.id))
    .map(lease => ({ kind: 'guest', id: lease.id, unitId: lease.unitId, number: lease.number, at, reason: 'guest_access_ended',
      text: `Your guest access ended: ${lease.tenantName ?? 'the tenant'} removed you, or the lease ended.` }));
}

/**
 * The directory, the caller's own records and (for operators) the management queues.
 * `notices` are endings only this page knows (lost guest access), merged into `outcomes`.
 */
export function campusDirectory(campus, { now = Date.now(), notices = [] } = {}) {
  if (!campus) return null;
  const mine = new Map((campus.leases ?? []).filter(lease => lease.status !== 'ended').map(lease => [lease.unitId, lease]));
  const requested = new Map((campus.requests ?? []).filter(item => item.status === 'pending').map(item => [item.unitId, item]));
  const access = new Map((campus.access ?? []).map(item => [item.unitId, item]));
  const towers = [];
  for (const unit of campus.units ?? []) {
    let tower = towers.find(item => item.id === unit.tower);
    if (!tower) towers.push(tower = { id: unit.tower, name: TOWERS[unit.tower] ?? unit.tower, floors: [] });
    let floor = tower.floors.find(item => item.floor === unit.floor);
    if (!floor) tower.floors.push(floor = { floor: unit.floor, units: [] });
    const lease = mine.get(unit.unitId) ?? null, request = requested.get(unit.unitId) ?? null, entry = access.get(unit.unitId) ?? null;
    const state = entry ? (entry.role === 'guest' ? 'guest' : 'yours') : lease?.status === 'offered' ? 'offered' : request ? 'requested' : unit.status === 'available' ? 'available' : 'leased';
    floor.units.push({ ...unit, state, lease, request, access: entry, directions: campusSuiteDirections(unit.unitId),
      canRequest: state === 'available' && campus.leasing === 'owner-managed' && !campus.operator });
  }
  for (const tower of towers) tower.floors.sort((a, b) => a.floor - b.floor);
  return {
    label: campus.label ?? CAMPUS_LEASE_LABEL, leasing: campus.leasing, operator: Boolean(campus.operator), towers,
    leases: (campus.leases ?? []).map(lease => ({ ...lease, term: `${day(lease.startsAt)} to ${day(lease.endsAt)}`, actions: leaseActions(lease, campus, now) })),
    requests: (campus.requests ?? []).map(item => ({ ...item, term: `${day(item.startsAt)} to ${day(item.endsAt)}`, actions: item.status === 'pending' && !campus.operator ? ['cancel'] : [] })),
    outcomes: campusOutcomes(campus, now, notices),
    manage: campus.operator ? {
      requests: (campus.manage?.requests ?? []).filter(item => item.status === 'pending').map(item => ({ ...item, term: `${day(item.startsAt)} to ${day(item.endsAt)}`, actions: ['issue', 'decline'] })),
      leases: (campus.manage?.leases ?? []).filter(lease => ['offered', 'active'].includes(lease.status))
        .map(lease => ({ ...lease, term: `${day(lease.startsAt)} to ${day(lease.endsAt)}`, actions: lease.status === 'active' ? ['renew', 'revoke'] : ['revoke'] })),
    } : null,
  };
}
function leaseActions(lease, campus, now) {
  if (lease.role === 'guest') return lease.status === 'active' ? ['leave'] : [];
  if (lease.status === 'ended') return [];
  if (lease.status === 'offered') return ['accept', 'decline'];
  if (lease.status === 'active') return lease.endsAt > now ? ['release', 'grant', ...(lease.guests?.length ? ['ungrant'] : [])] : [];
  return [];
}

/** Default dates for a new request: from now, for 30 days. */
export const campusDefaultTerm = (now = Date.now()) => ({ startsAt: now, endsAt: now + CAMPUS_DEFAULT_TERM_DAYS * DAY });

// Commands. `intents` holds operation ids by intent key until a definite answer.
export function createCampusCommands({ worldId, send, randomId = () => crypto.randomUUID().replaceAll('-', '') }) {
  const intents = new Map();
  const common = key => {
    if (!intents.has(key)) intents.set(key, randomId());
    return { type: 'campus', operationId: intents.get(key), worldId, contract: { ...CAMPUS_LEASE_CONTRACT } };
  };
  async function run(key, message) {
    let result;
    try { result = await send(message); } catch (error) { return { ok: false, retry: true, message: error.message }; }
    // No answer (offline, a closed socket) keeps the intent: Retry sends the same operation.
    if (!result || (result.ok === false && !result.error)) return { ok: false, retry: true, message: result?.message ?? 'The town did not answer. Try again.' };
    intents.delete(key);
    return result.ok ? result : { ...result, message: campusErrorMessage(result.error, result.message) };
  }
  // Server views name a lease or request by `id`; commands name it leaseId / requestId.
  const leaseCommand = (action, lease, extra = {}) => {
    const key = `${action}:${lease.id}:${extra.peerId ?? ''}:${extra.endsAt ?? ''}`;
    return run(key, { ...common(key), action, leaseId: lease.id, expectedVersion: lease.version, ...extra });
  };
  return {
    pending: () => intents.size,
    list: () => send({ type: 'campus', action: 'list' }),
    request: (unitId, { startsAt, endsAt }) => { const key = `request:${unitId}:${startsAt}:${endsAt}`;return run(key, { ...common(key), action: 'request', unitId, startsAt, endsAt }); },
    // A lease request is named leaseRequestId: the socket envelope's own requestId routes replies.
    cancel: request => { const key = `cancel:${request.id}`;return run(key, { ...common(key), action: 'cancel', leaseRequestId: request.id }); },
    decline: request => { const key = `decline:${request.id}`;return run(key, { ...common(key), action: 'decline', leaseRequestId: request.id }); },
    issue: ({ unitId, tenantId, startsAt, endsAt, requestId = null }) => {
      const key = `issue:${unitId}:${tenantId}:${startsAt}:${endsAt}:${requestId ?? ''}`;
      return run(key, { ...common(key), action: 'issue', unitId, tenantId, startsAt, endsAt, ...(requestId ? { leaseRequestId: requestId } : {}) });
    },
    accept: lease => leaseCommand('accept', lease), release: lease => leaseCommand('release', lease), revoke: lease => leaseCommand('revoke', lease),
    renew: (lease, endsAt) => leaseCommand('renew', lease, { endsAt }),
    grant: (lease, peerId) => leaseCommand('grant', lease, { peerId }), ungrant: (lease, peerId) => leaseCommand('ungrant', lease, { peerId }),
    // A guest leaves a suite by removing themselves.
    leave: (lease, selfId) => leaseCommand('ungrant', lease, { peerId: selfId }),
  };
}
