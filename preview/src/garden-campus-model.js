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

/** The directory, the caller's own records and (for operators) the management queues. */
export function campusDirectory(campus, { now = Date.now() } = {}) {
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
    cancel: request => { const key = `cancel:${request.id}`;return run(key, { ...common(key), action: 'cancel', requestId: request.id }); },
    decline: request => { const key = `decline:${request.id}`;return run(key, { ...common(key), action: 'decline', requestId: request.id }); },
    issue: ({ unitId, tenantId, startsAt, endsAt, requestId = null }) => {
      const key = `issue:${unitId}:${tenantId}:${startsAt}:${endsAt}:${requestId ?? ''}`;
      return run(key, { ...common(key), action: 'issue', unitId, tenantId, startsAt, endsAt, ...(requestId ? { requestId } : {}) });
    },
    accept: lease => leaseCommand('accept', lease), release: lease => leaseCommand('release', lease), revoke: lease => leaseCommand('revoke', lease),
    renew: (lease, endsAt) => leaseCommand('renew', lease, { endsAt }),
    grant: (lease, peerId) => leaseCommand('grant', lease, { peerId }), ungrant: (lease, peerId) => leaseCommand('ungrant', lease, { peerId }),
    // A guest leaves a suite by removing themselves.
    leave: (lease, selfId) => leaseCommand('ungrant', lease, { peerId: selfId }),
  };
}
