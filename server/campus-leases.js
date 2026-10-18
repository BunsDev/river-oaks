// Garden campus tenancy (#509): owner-managed, non-charging leases on #506's rentable suites,
// tenant guest grants and resident requests. It lives inside the world like the office
// grants, so the memory town and the Redis room (one leased writer, one fenced commit)
// apply the same rules: of two concurrent acceptances for one suite, from any gateways,
// exactly one wins. The checkpoint holds every record; presence never does.
//
// States. A request is pending until cancelled, declined, offered or expired; it is never
// admission. A lease is offered (by an operator, with explicit terms) until the tenant
// accepts it, or it is declined, withdrawn, superseded or lapses; an active lease ends by
// release, revocation or expiry. An ended lease is terminal: nothing revives it, and a new
// lease gets a new id. Mutations carry an operation id (one receipt per actor) and, on a
// lease, the version the client saw. See docs/garden-campus-leases.md.
import { createHash } from 'node:crypto';
import { accountName } from '../preview/src/resident-names.js';
import { DEFAULT_WORLD_ID } from '../preview/src/world-contract.js';
import { checkCampusCompatibility } from '../shared/garden-campus-layout.js';
import {
  CAMPUS_LEASE_CHARGE, CAMPUS_LEASE_CONTRACT, CAMPUS_LEASE_ERRORS, CAMPUS_LEASE_ID, CAMPUS_LEASE_LABEL, CAMPUS_LEASE_LIMITS as LIMITS,
  CAMPUS_LEASE_MODE, CAMPUS_REQUEST_ID, campusContract, campusLeaseUnits, campusUserId, parseCampusCommand,
} from '../shared/garden-campus-lease-contract.js';

const UNITS = new Map(campusLeaseUnits().map(unit => [unit.unitId, unit]));
const LEASE_KEYS = ['id', 'unitId', 'tenantId', 'tenantName', 'operatorId', 'operatorName', 'contract', 'mode', 'charge', 'startsAt', 'endsAt',
  'status', 'version', 'createdAt', 'updatedAt', 'offerExpiresAt', 'requestId', 'guests', 'endedAt', 'endedReason'];
const REQUEST_KEYS = ['id', 'userId', 'name', 'unitId', 'contract', 'startsAt', 'endsAt', 'status', 'createdAt', 'expiresAt', 'closedAt', 'closedReason', 'leaseId'];
const ENDED = ['declined', 'withdrawn', 'superseded', 'offer_expired', 'released', 'revoked', 'expired', 'retired'];
const CLOSED = ['cancelled', 'declined', 'offered', 'expired', 'retired'];
const MAX_OPEN_LEASES = UNITS.size * (LIMITS.offersPerUnit + 1);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactly = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const instant = value => Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
const label = value => typeof value === 'string' && value.length <= 80;
const serialOf = id => Number(id.slice(id.indexOf('-') + 1));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = error => ({ ok: false, error, message: CAMPUS_LEASE_ERRORS[error] ?? error });
const compatible = contract => campusContract(contract) && checkCampusCompatibility(contract).ok;

// RIVER_OAKS_CAMPUS_OPERATOR_IDS="<userId>,…". Nobody operates by default, so nothing
// activates by accident; a malformed entry grants nothing.
export function parseCampusOperators(text = '', { onInvalid = () => {} } = {}) {
  const ids = [];
  for (const entry of String(text ?? '').split(',').map(item => item.trim()).filter(Boolean)) {
    if (!campusUserId(entry)) { onInvalid(entry); continue; }
    if (!ids.includes(entry)) ids.push(entry);
  }
  return ids;
}

// The campus is served only in the River Oaks town, and only on a district revision that
// carries it (#507's attachGardenCampus sets worldData.gardenCampus). Anywhere else the
// section is inert: restored, validated and written back unchanged, with no access, units,
// commands or expiry, so switching the district back and forth (#512) loses nothing.
export const campusServed = (worldData, worldId) => worldId === DEFAULT_WORLD_ID && worldData?.gardenCampus?.id === CAMPUS_LEASE_CONTRACT.id;

export function createCampusLeases({ enabled = true, worldId, operators = [], players = new Map(), changed = () => {}, onAccessEnded = () => {} } = {}) {
  const operatorIds = new Set(operators.filter(campusUserId));
  let serial = 0, leases = new Map(), requests = new Map(), receipts = [];
  const isOperator = id => operatorIds.has(id);
  const open = () => enabled && operatorIds.size > 0;
  const nameOf = (id, fallback = id) => String(players.get(id)?.name ?? fallback).slice(0, 80);
  const live = () => [...leases.values()].filter(lease => lease.status !== 'ended');
  const activeFor = unitId => live().find(lease => lease.unitId === unitId && lease.status === 'active') ?? null;
  const pending = () => [...requests.values()].filter(item => item.status === 'pending');
  const termsValid = (startsAt, endsAt, time) => startsAt >= time - LIMITS.clockSkewMs && startsAt <= time + LIMITS.maxLeadMs
    && endsAt - startsAt >= LIMITS.minTermMs && endsAt - startsAt <= LIMITS.maxTermMs;

  // Ending a lease drops its guests. Ending an active one reports every account whose suite
  // access it held, with the public point outside the suite door; the world returns any
  // occupant there (#508). Account-private desk work is untouched.
  function end(lease, reason, at) {
    const holders = lease.status === 'active' ? [[lease.tenantId, 'tenant'], ...lease.guests.map(guest => [guest.userId, 'guest'])] : [];
    Object.assign(lease, { status: 'ended', endedAt: at, endedReason: reason, guests: [], version: lease.version + 1, updatedAt: Math.max(lease.updatedAt, at) });
    for (const [userId, role] of holders) onAccessEnded(ended(userId, role, lease, reason));
  }
  const ended = (userId, role, lease, reason) => ({ userId, role, unitId: lease.unitId, leaseId: lease.id, reason, landing: structuredClone(UNITS.get(lease.unitId)?.landing ?? null) });
  const close = (item, reason, at, leaseId = null) => Object.assign(item, { status: 'closed', closedAt: at, closedReason: reason, leaseId });
  // Keep the newest ended leases and closed requests; drop the oldest beyond the bound.
  function trim(leaseMap = leases, requestMap = requests) {
    for (const [map, done, at] of [[leaseMap, item => item.status === 'ended', item => item.endedAt], [requestMap, item => item.status === 'closed', item => item.closedAt]]) {
      const old = [...map.values()].filter(done).sort((a, b) => at(a) - at(b) || serialOf(a.id) - serialOf(b.id));
      for (const item of old.slice(0, Math.max(0, old.length - LIMITS.endedRetained))) map.delete(item.id);
    }
  }
  // Expiry happens at the instant it was due, whichever gateway ticks first.
  function prune(time) {
    if (!enabled) return false;
    let touched = false;
    for (const lease of live()) {
      if (lease.status === 'active' && lease.endsAt <= time) end(lease, 'expired', lease.endsAt);
      else if (lease.status === 'offered' && Math.min(lease.offerExpiresAt, lease.endsAt) <= time) end(lease, 'offer_expired', Math.min(lease.offerExpiresAt, lease.endsAt));
      else continue;
      touched = true;
    }
    for (const item of pending()) if (item.expiresAt <= time) { close(item, 'expired', item.expiresAt);touched = true; }
    if (touched) { trim();changed(); }
    return touched;
  }

  // The access decision #508 (suite entry) and #510 (suite desk) consume. Only an active
  // lease inside its dates admits, and only its tenant and the guests they named. A restore
  // passes the state validate returned, to check restored occupants before it commits.
  function suiteAccess(userId, unitId, time, restored = null) {
    if (!enabled) return { ok: false, reason: 'campus_unavailable' };
    if (!UNITS.has(unitId)) return { ok: false, reason: 'campus_unknown_unit' };
    const lease = restored ? [...restored.leases.values()].find(item => item.unitId === unitId && item.status === 'active') ?? null : activeFor(unitId);
    if (!lease) return { ok: false, reason: 'campus_unit_not_leased' };
    if (time < lease.startsAt) return { ok: false, reason: 'campus_lease_not_started' };
    if (time >= lease.endsAt) return { ok: false, reason: 'campus_lease_expired' };
    const role = lease.tenantId === userId ? 'tenant' : lease.guests.some(guest => guest.userId === userId) ? 'guest' : null;
    if (!role) return { ok: false, reason: 'campus_access_required' };
    return { ok: true, role, unitId, leaseId: lease.id, version: lease.version, until: lease.endsAt, landing: structuredClone(UNITS.get(unitId).landing) };
  }
  const entitlements = (userId, time) => live().filter(lease => lease.status === 'active' && (lease.tenantId === userId || lease.guests.some(g => g.userId === userId)))
    .map(lease => suiteAccess(userId, lease.unitId, time)).filter(access => access.ok);

  // Views. The tenant sees their lease and guests; a guest sees the suite, dates and host;
  // an operator sees every lease but not who the guests are. Nobody else sees anything.
  const unitOf = unitId => ({ unitId, number: UNITS.get(unitId)?.number ?? null });
  const terms = lease => ({ ...unitOf(lease.unitId), startsAt: lease.startsAt, endsAt: lease.endsAt, mode: lease.mode, charge: lease.charge, label: CAMPUS_LEASE_LABEL });
  const ending = lease => lease.status === 'ended' ? { endedAt: lease.endedAt, endedReason: lease.endedReason } : {};
  function leaseView(viewer, lease) {
    const base = { id: lease.id, status: lease.status, version: lease.version, ...terms(lease) };
    if (lease.tenantId === viewer) return { ...base, role: 'tenant', operatorName: accountName(lease.operatorId, lease.operatorName),
      offerExpiresAt: lease.offerExpiresAt, createdAt: lease.createdAt, updatedAt: lease.updatedAt, ...ending(lease),
      guests: lease.guests.map(guest => ({ userId: guest.userId, name: accountName(guest.userId, guest.name), grantedAt: guest.grantedAt })) };
    if (isOperator(viewer)) return { ...base, role: 'operator', tenantId: lease.tenantId, tenantName: accountName(lease.tenantId, lease.tenantName),
      requestId: lease.requestId, offerExpiresAt: lease.offerExpiresAt, createdAt: lease.createdAt, updatedAt: lease.updatedAt, ...ending(lease), guestCount: lease.guests.length };
    if (lease.guests.some(guest => guest.userId === viewer)) return { ...base, role: 'guest', tenantName: accountName(lease.tenantId, lease.tenantName) };
    return null;
  }
  const requestView = (viewer, item) => item.userId === viewer || isOperator(viewer) ? {
    id: item.id, ...unitOf(item.unitId), status: item.status === 'pending' ? 'pending' : item.closedReason, startsAt: item.startsAt, endsAt: item.endsAt,
    createdAt: item.createdAt, expiresAt: item.expiresAt, ...(item.status === 'closed' ? { closedAt: item.closedAt } : {}), leaseId: item.leaseId,
    ...(item.userId !== viewer ? { userId: item.userId, name: accountName(item.userId, item.name) } : {}),
  } : null;
  const unitStatus = unitId => activeFor(unitId) ? 'leased' : 'available';
  function status(viewer, time) {
    return { contract: { ...CAMPUS_LEASE_CONTRACT }, worldId, mode: CAMPUS_LEASE_MODE, charge: CAMPUS_LEASE_CHARGE, label: CAMPUS_LEASE_LABEL,
      leasing: open() ? CAMPUS_LEASE_MODE : 'closed', operator: isOperator(viewer),
      units: [...UNITS.values()].map(unit => ({ unitId: unit.unitId, number: unit.number, tower: unit.tower, floor: unit.floor, netArea: unit.netArea, status: unitStatus(unit.unitId) })),
      access: entitlements(viewer, time),
      leases: [...leases.values()].filter(lease => lease.tenantId === viewer || lease.guests.some(g => g.userId === viewer)).map(lease => leaseView(viewer, lease)),
      requests: [...requests.values()].filter(item => item.userId === viewer).map(item => requestView(viewer, item)),
      ...(isOperator(viewer) ? { manage: { leases: [...leases.values()].map(lease => leaseView(viewer, lease)), requests: [...requests.values()].map(item => requestView(viewer, item)) } } : {}) };
  }

  // A lease names its parties; anyone else is told it does not exist.
  function partyLease(viewer, leaseId) {
    const lease = leases.get(leaseId);
    return lease && (lease.tenantId === viewer || isOperator(viewer) || lease.guests.some(g => g.userId === viewer)) ? lease : null;
  }
  function apply(id, ask, time) {
    // Role first, then state, then the version the client saw.
    const leaseOf = (allowed, roleError) => {
      const lease = partyLease(id, ask.leaseId);
      if (!lease) return fail('campus_lease_unknown');
      if (!allowed(lease)) return fail(roleError);
      if (lease.status === 'ended') return fail('campus_lease_ended');
      if (lease.version !== ask.expectedVersion) return fail('campus_lease_stale');
      return { ok: true, lease };
    };
    const done = (kind, item) => ({ ok: true, kind, item });
    switch (ask.action) {
      case 'request': {
        if (!open()) return fail('campus_leasing_closed');
        if (isOperator(id)) return fail('campus_invalid_tenant');
        if (!UNITS.has(ask.unitId)) return fail('campus_unknown_unit');
        if (!termsValid(ask.startsAt, ask.endsAt, time)) return fail('campus_invalid_terms');
        if (activeFor(ask.unitId)) return fail('campus_unit_unavailable');
        const mine = pending().filter(item => item.userId === id);
        if (mine.some(item => item.unitId === ask.unitId)) return fail('campus_request_exists');
        if (mine.length >= LIMITS.requestsPerAccount) return fail('campus_request_limit');
        if (live().filter(lease => lease.tenantId === id).length >= LIMITS.leasesPerAccount) return fail('campus_lease_limit');
        if (pending().length >= LIMITS.pendingRequests) return fail('campus_busy');
        const item = { id: `request-${++serial}`, userId: id, name: nameOf(id), unitId: ask.unitId, contract: { ...CAMPUS_LEASE_CONTRACT }, startsAt: ask.startsAt, endsAt: ask.endsAt,
          status: 'pending', createdAt: time, expiresAt: time + LIMITS.requestTtlMs, closedAt: null, closedReason: null, leaseId: null };
        requests.set(item.id, item);return done('request', item);
      }
      case 'cancel': case 'decline': {
        if (ask.action === 'decline' && !isOperator(id)) return fail('campus_operator_required');
        const item = requests.get(ask.leaseRequestId);
        if (!item || ask.action === 'cancel' && item.userId !== id) return fail('campus_request_unknown');
        if (item.status !== 'pending') return fail('campus_request_closed');
        close(item, ask.action === 'cancel' ? 'cancelled' : 'declined', time);return done('request', item);
      }
      case 'issue': {
        if (!isOperator(id)) return fail('campus_operator_required');
        if (!UNITS.has(ask.unitId)) return fail('campus_unknown_unit');
        if (isOperator(ask.tenantId)) return fail('campus_invalid_tenant');
        if (!termsValid(ask.startsAt, ask.endsAt, time)) return fail('campus_invalid_terms');
        if (activeFor(ask.unitId)) return fail('campus_unit_unavailable');
        const offers = live().filter(lease => lease.unitId === ask.unitId);
        if (offers.some(lease => lease.tenantId === ask.tenantId)) return fail('campus_offer_exists');
        if (offers.length >= LIMITS.offersPerUnit) return fail('campus_offer_limit');
        if (live().filter(lease => lease.tenantId === ask.tenantId).length >= LIMITS.leasesPerAccount) return fail('campus_lease_limit');
        const asked = ask.leaseRequestId === null ? null : requests.get(ask.leaseRequestId);
        if (ask.leaseRequestId !== null) {
          if (!asked) return fail('campus_request_unknown');
          if (asked.status !== 'pending') return fail('campus_request_closed');
          if (asked.userId !== ask.tenantId || asked.unitId !== ask.unitId) return fail('campus_request_mismatch');
        }
        const lease = { id: `lease-${++serial}`, unitId: ask.unitId, tenantId: ask.tenantId, tenantName: nameOf(ask.tenantId, asked?.name ?? ask.tenantId),
          operatorId: id, operatorName: nameOf(id), contract: { ...CAMPUS_LEASE_CONTRACT }, mode: CAMPUS_LEASE_MODE, charge: CAMPUS_LEASE_CHARGE,
          startsAt: ask.startsAt, endsAt: ask.endsAt, status: 'offered', version: 1, createdAt: time, updatedAt: time,
          offerExpiresAt: Math.min(time + LIMITS.offerTtlMs, ask.endsAt), requestId: asked?.id ?? null, guests: [], endedAt: null, endedReason: null };
        leases.set(lease.id, lease);
        if (asked) close(asked, 'offered', time, lease.id);
        return done('lease', lease);
      }
      case 'accept': {
        const found = leaseOf(lease => lease.tenantId === id, 'campus_tenant_required');if (!found.ok) return found;
        const { lease } = found;
        if (lease.status !== 'offered') return fail('campus_lease_not_offered');
        if (!open()) return fail('campus_leasing_closed');
        if (!isOperator(lease.operatorId)) return fail('campus_operator_retired');
        if (activeFor(lease.unitId)) return fail('campus_unit_unavailable');
        if (live().filter(other => other.tenantId === id && other.status === 'active').length >= LIMITS.leasesPerAccount) return fail('campus_lease_limit');
        Object.assign(lease, { status: 'active', version: lease.version + 1, updatedAt: time });
        // The suite is taken: other offers for it end now instead of failing later.
        for (const other of live()) if (other.unitId === lease.unitId && other.status === 'offered') end(other, 'superseded', time);
        return done('lease', lease);
      }
      case 'release': case 'revoke': {
        const found = ask.action === 'release' ? leaseOf(lease => lease.tenantId === id, 'campus_tenant_required') : leaseOf(() => isOperator(id), 'campus_operator_required');if (!found.ok) return found;
        const { lease } = found, offered = lease.status === 'offered';
        end(lease, ask.action === 'release' ? offered ? 'declined' : 'released' : offered ? 'withdrawn' : 'revoked', time);
        return done('lease', lease);
      }
      case 'renew': {
        const found = leaseOf(() => isOperator(id), 'campus_operator_required');if (!found.ok) return found;
        const { lease } = found;
        if (lease.status !== 'active') return fail('campus_lease_not_active');
        if (ask.endsAt <= lease.endsAt || ask.endsAt > time + LIMITS.maxTermMs) return fail('campus_invalid_terms');
        Object.assign(lease, { endsAt: ask.endsAt, version: lease.version + 1, updatedAt: time });
        return done('lease', lease);
      }
      case 'grant': case 'ungrant': {
        // A guest may remove themselves; only the tenant names or removes anyone else.
        const found = leaseOf(lease => lease.tenantId === id || ask.action === 'ungrant' && ask.peerId === id && lease.guests.some(item => item.userId === id), 'campus_tenant_required');
        if (!found.ok) return found;
        const { lease } = found, guest = lease.guests.find(item => item.userId === ask.peerId);
        if (lease.status !== 'active') return fail('campus_lease_not_active');
        if (ask.action === 'ungrant') {
          if (!guest) return fail('campus_guest_unknown');
          Object.assign(lease, { guests: lease.guests.filter(item => item !== guest), version: lease.version + 1, updatedAt: time });
          onAccessEnded(ended(guest.userId, 'guest', lease, 'guest_removed'));
          return done('lease', lease);
        }
        if (ask.peerId === lease.tenantId) return fail('campus_invalid_guest');
        if (guest) return fail('campus_guest_exists');
        if (lease.guests.length >= LIMITS.guestsPerLease
          || live().filter(other => other.guests.some(item => item.userId === ask.peerId)).length >= LIMITS.guestOfPerAccount) return fail('campus_guest_limit');
        Object.assign(lease, { guests: [...lease.guests, { userId: ask.peerId, name: nameOf(ask.peerId), grantedAt: time }], version: lease.version + 1, updatedAt: time });
        return done('lease', lease);
      }
    }
    return fail('invalid_campus_command');
  }

  function command(player, message, time) {
    const parsed = parseCampusCommand(message);
    if (!parsed.ok) return parsed;
    if (!enabled) return fail('campus_unavailable');
    const ask = parsed.command, id = player.id;
    prune(time);
    if (ask.action === 'list') return { ok: true, campus: status(id, time), serverTimeMs: time };
    if (ask.worldId !== worldId) return fail('campus_world_mismatch');
    if (!checkCampusCompatibility(ask.contract).ok) return { ...fail('campus_contract_stale'), contract: { ...CAMPUS_LEASE_CONTRACT } };
    // One receipt per actor and operation, whatever session or gateway sent it: a retry
    // after a lost reply or a reconnect applies once, and a reused id with other content fails.
    const key = JSON.stringify([id, ask.operationId]), { operationId: _operationId, ...content } = ask, digest = sha256(JSON.stringify(content));
    const prior = receipts.find(item => item.key === key);
    if (prior) {
      if (prior.digest !== digest) return fail('campus_operation_conflict');
      const item = (prior.kind === 'lease' ? leases : requests).get(prior.id);
      return { ok: true, replayed: true, [prior.kind]: item ? prior.kind === 'lease' ? leaseView(id, item) : requestView(id, item) : null, serverTimeMs: time };
    }
    const result = apply(id, ask, time);
    if (!result.ok) return result;
    receipts.push({ key, digest, kind: result.kind, id: result.item.id });
    if (receipts.length > LIMITS.receipts) receipts.shift();
    trim();changed();
    return { ok: true, [result.kind]: result.kind === 'lease' ? leaseView(id, result.item) : requestView(id, result.item), serverTimeMs: time };
  }

  // Public frame: which suites are taken, and whether leasing is open. No tenant, guest,
  // request, term or desk detail; it carries no clock (snapshots are compared whole).
  const snapshot = () => ({ contract: { ...CAMPUS_LEASE_CONTRACT }, leasing: open() ? CAMPUS_LEASE_MODE : 'closed',
    leased: live().filter(lease => lease.status === 'active').map(lease => lease.unitId).sort() });
  const checkpoint = () => structuredClone({ serial, leases: [...leases.values()], requests: [...requests.values()], receipts });
  const blank = () => ({ serial: 0, leases: new Map(), requests: new Map(), receipts: [] });
  const isBlank = saved => exactly(saved, ['serial', 'leases', 'requests', 'receipts']) && Number.isSafeInteger(saved.serial) && saved.serial >= 0
    && [saved.leases, saved.requests, saved.receipts].every(items => Array.isArray(items) && items.length === 0);

  // Restore refuses anything outside the contract, so a garbled section fails the whole
  // checkpoint and the previous committed world stays authoritative. Checkpoints before v13
  // have no campus and restore with none. A well-formed record for a unit or contract this
  // server no longer serves ends (retired) instead of granting access; it is never moved.
  function validate(saved, version, time) {
    if (version < 13) {
      if (saved !== undefined && !isBlank(saved)) throw new Error('Invalid campus version');
      return blank();
    }
    if (!exactly(saved, ['serial', 'leases', 'requests', 'receipts']) || !Number.isSafeInteger(saved.serial) || saved.serial < 0 || saved.serial > 1e9
      || !Array.isArray(saved.leases) || saved.leases.length > MAX_OPEN_LEASES + LIMITS.endedRetained
      || !Array.isArray(saved.requests) || saved.requests.length > LIMITS.pendingRequests + LIMITS.endedRetained
      || !Array.isArray(saved.receipts) || saved.receipts.length > LIMITS.receipts) throw new Error('Invalid campus');
    const ids = new Set(), owned = id => { const n = serialOf(id);if (n > saved.serial || ids.has(n)) return false;ids.add(n);return true; };
    const nextLeases = new Map(), nextRequests = new Map();
    for (const lease of saved.leases) {
      if (!exactly(lease, LEASE_KEYS) || typeof lease.id !== 'string' || !CAMPUS_LEASE_ID.test(lease.id) || !owned(lease.id)
        || typeof lease.unitId !== 'string' || lease.unitId.length > 80 || !campusUserId(lease.tenantId) || !campusUserId(lease.operatorId) || lease.tenantId === lease.operatorId
        || !label(lease.tenantName) || !label(lease.operatorName) || !campusContract(lease.contract) || lease.mode !== CAMPUS_LEASE_MODE || lease.charge !== CAMPUS_LEASE_CHARGE
        || !['startsAt', 'endsAt', 'createdAt', 'updatedAt', 'offerExpiresAt'].every(key => instant(lease[key])) || lease.startsAt >= lease.endsAt
        || lease.createdAt > lease.updatedAt || lease.offerExpiresAt > lease.endsAt || !['offered', 'active', 'ended'].includes(lease.status)
        || !Number.isSafeInteger(lease.version) || lease.version < 1 || lease.version > 1e9
        || !(lease.requestId === null || typeof lease.requestId === 'string' && CAMPUS_REQUEST_ID.test(lease.requestId))
        || (lease.status === 'ended' ? !instant(lease.endedAt) || !ENDED.includes(lease.endedReason) : lease.endedAt !== null || lease.endedReason !== null)
        || !Array.isArray(lease.guests) || lease.guests.length > (lease.status === 'active' ? LIMITS.guestsPerLease : 0)
        || new Set(lease.guests.map(guest => guest?.userId)).size !== lease.guests.length
        || !lease.guests.every(guest => exactly(guest, ['userId', 'name', 'grantedAt']) && campusUserId(guest.userId) && guest.userId !== lease.tenantId && label(guest.name) && instant(guest.grantedAt))) throw new Error('Invalid campus lease');
      nextLeases.set(lease.id, structuredClone(lease));
    }
    for (const item of saved.requests) {
      if (!exactly(item, REQUEST_KEYS) || typeof item.id !== 'string' || !CAMPUS_REQUEST_ID.test(item.id) || !owned(item.id) || !campusUserId(item.userId) || !label(item.name)
        || typeof item.unitId !== 'string' || item.unitId.length > 80 || !campusContract(item.contract)
        || !['startsAt', 'endsAt', 'createdAt', 'expiresAt'].every(key => instant(item[key])) || item.startsAt >= item.endsAt || item.createdAt > item.expiresAt
        || (item.status === 'pending' ? item.closedAt !== null || item.closedReason !== null || item.leaseId !== null
          : item.status !== 'closed' || !instant(item.closedAt) || !CLOSED.includes(item.closedReason)
            || (item.closedReason === 'offered') !== (typeof item.leaseId === 'string' && CAMPUS_LEASE_ID.test(item.leaseId)) || item.closedReason !== 'offered' && item.leaseId !== null)) throw new Error('Invalid campus request');
      nextRequests.set(item.id, structuredClone(item));
    }
    // Commands never produce these, so a checkpoint holding them is not ours.
    const openLeases = [...nextLeases.values()].filter(lease => lease.status !== 'ended'), waiting = [...nextRequests.values()].filter(item => item.status === 'pending');
    const count = (items, key) => items.reduce((map, item) => map.set(key(item), (map.get(key(item)) ?? 0) + 1), new Map());
    const most = map => Math.max(0, ...map.values());
    if (most(count(openLeases.filter(lease => lease.status === 'active'), lease => lease.unitId)) > 1
      || most(count(openLeases.filter(lease => lease.status === 'offered'), lease => lease.unitId)) > LIMITS.offersPerUnit
      || most(count(openLeases, lease => lease.tenantId)) > LIMITS.leasesPerAccount
      || most(count(openLeases, lease => JSON.stringify([lease.unitId, lease.tenantId]))) > 1
      || most(count(openLeases.flatMap(lease => lease.guests), guest => guest.userId)) > LIMITS.guestOfPerAccount
      || most(count(waiting, item => item.userId)) > LIMITS.requestsPerAccount || waiting.length > LIMITS.pendingRequests
      || most(count(waiting, item => JSON.stringify([item.userId, item.unitId]))) > 1
      || nextLeases.size - openLeases.length > LIMITS.endedRetained || nextRequests.size - waiting.length > LIMITS.endedRetained) throw new Error('Invalid campus bounds');
    const keys = new Set();
    for (const item of saved.receipts) {
      if (!exactly(item, ['key', 'digest', 'kind', 'id']) || typeof item.key !== 'string' || item.key.length > 320 || keys.has(item.key)
        || typeof item.digest !== 'string' || !/^[a-f0-9]{64}$/.test(item.digest) || !['lease', 'request'].includes(item.kind)
        || typeof item.id !== 'string' || !(item.kind === 'lease' ? CAMPUS_LEASE_ID : CAMPUS_REQUEST_ID).test(item.id) || serialOf(item.id) > saved.serial) throw new Error('Invalid campus receipt');
      keys.add(item.key);
    }
    // An inert campus keeps every record exactly as saved; retirement waits until it is served.
    if (!enabled) return { serial: saved.serial, leases: nextLeases, requests: nextRequests, receipts: structuredClone(saved.receipts) };
    for (const lease of openLeases) if (!UNITS.has(lease.unitId) || !compatible(lease.contract))
      Object.assign(lease, { status: 'ended', endedAt: time, endedReason: 'retired', guests: [], version: lease.version + 1, updatedAt: Math.max(lease.updatedAt, time) });
    for (const item of waiting) if (!UNITS.has(item.unitId) || !compatible(item.contract)) close(item, 'retired', time);
    trim(nextLeases, nextRequests);
    return { serial: saved.serial, leases: nextLeases, requests: nextRequests, receipts: structuredClone(saved.receipts) };
  }
  const load = state => { ({ serial, leases, requests, receipts } = state); };
  return { enabled, command, prune, suiteAccess, entitlements, snapshot, checkpoint, validate, blank, load, units: () => [...UNITS.values()] };
}
