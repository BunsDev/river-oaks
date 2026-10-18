// Garden campus leases (#509): the command and unit shapes shared by the server authority
// (server/campus-leases.js) and the campus UI (#510). Leases are owner-managed and never
// charge: no price, currency or payment field exists, and a command carrying one is refused.
// The operator is server configuration (RIVER_OAKS_CAMPUS_OPERATOR_IDS), never a field.
// Pure data and validation: no DOM, no server state. See docs/garden-campus-leases.md.
import { GARDEN_CAMPUS_ID, GARDEN_CAMPUS_LAYOUT, GARDEN_CAMPUS_VERSIONS, campusLevelId, campusUnitInventory } from './garden-campus-layout.js';

export const CAMPUS_LEASE_MODE = 'owner-managed', CAMPUS_LEASE_CHARGE = 'none';
export const CAMPUS_LEASE_LABEL = 'No charge — owner-managed';
// The contract a lease is written against. A command names it; a restored lease on an
// incompatible major version ends instead of granting access (checkCampusCompatibility).
export const CAMPUS_LEASE_CONTRACT = Object.freeze({ id: GARDEN_CAMPUS_ID, layout: GARDEN_CAMPUS_VERSIONS.layout, units: GARDEN_CAMPUS_VERSIONS.units });
const HOUR = 3_600_000, DAY = 24 * HOUR;
export const CAMPUS_LEASE_LIMITS = Object.freeze({
  leasesPerAccount: 2, // offered or active, as tenant
  requestsPerAccount: 2, guestsPerLease: 8, guestOfPerAccount: 8, offersPerUnit: 4, pendingRequests: 128,
  endedRetained: 128, // ended leases and closed requests kept for truthful status, oldest dropped first
  receipts: 256, minTermMs: HOUR, maxTermMs: 366 * DAY, maxLeadMs: 90 * DAY, clockSkewMs: 5 * 60_000,
  offerTtlMs: 7 * DAY, requestTtlMs: 14 * DAY,
});

// Every error a campus command can return, with the sentence the UI shows.
export const CAMPUS_LEASE_ERRORS = Object.freeze({
  invalid_campus_command: 'That rental request is not valid.',
  campus_unavailable: 'Garden campus rentals are not available in this world.',
  campus_leasing_closed: 'Garden campus rentals are closed. Nobody manages leases right now.',
  campus_world_mismatch: 'That request was made for another world. Refresh and try again.',
  campus_contract_stale: 'The campus plan changed. Refresh the directory and try again.',
  campus_operation_conflict: 'That request was already used for something else.',
  campus_operator_required: 'Only the campus operator can do that.',
  campus_operator_retired: 'The operator who made this offer no longer manages the campus. Ask for a new offer.',
  campus_unknown_unit: 'There is no rentable suite with that number.',
  campus_invalid_terms: 'Those dates are outside the allowed lease terms.',
  campus_invalid_tenant: 'Campus operators cannot rent a suite they manage.',
  campus_unit_unavailable: 'That suite is already leased.',
  campus_request_exists: 'You already asked for this suite.',
  campus_request_limit: 'You have as many open requests as allowed.',
  campus_request_unknown: 'That request does not exist.',
  campus_request_closed: 'That request is no longer open.',
  campus_request_mismatch: 'That request is for another suite or resident.',
  campus_lease_limit: 'That account has as many leases as allowed.',
  campus_offer_exists: 'That resident already has an offer for this suite.',
  campus_offer_limit: 'This suite has as many open offers as allowed.',
  campus_lease_unknown: 'That lease does not exist.',
  campus_lease_stale: 'The lease changed. Refresh and try again.',
  campus_lease_ended: 'That lease has ended.',
  campus_lease_not_offered: 'That lease is not waiting for acceptance.',
  campus_lease_not_active: 'That lease is not active.',
  campus_tenant_required: 'Only the tenant can do that.',
  campus_invalid_guest: 'That resident cannot be a guest of this suite.',
  campus_guest_exists: 'That resident is already a guest.',
  campus_guest_unknown: 'That resident is not a guest of this suite.',
  campus_guest_limit: 'No more guests can be added.',
  campus_busy: 'The campus has too many open requests. Try again later.',
});

// Mutating commands all carry operationId (stable across retries and reconnects), the
// worldId and the contract they were made for. Lease commands also carry the version
// the client last saw, so a late command cannot overwrite a newer state.
const COMMON = ['type', 'action', 'operationId', 'worldId', 'contract'];
const ACTIONS = Object.freeze({
  request: ['unitId', 'startsAt', 'endsAt'], cancel: ['requestId'], decline: ['requestId'],
  issue: ['unitId', 'tenantId', 'startsAt', 'endsAt', 'requestId'], accept: ['leaseId', 'expectedVersion'],
  release: ['leaseId', 'expectedVersion'], renew: ['leaseId', 'expectedVersion', 'endsAt'], revoke: ['leaseId', 'expectedVersion'],
  grant: ['leaseId', 'expectedVersion', 'peerId'], ungrant: ['leaseId', 'expectedVersion', 'peerId'],
});
export const CAMPUS_LEASE_ACTIONS = Object.freeze(['list', ...Object.keys(ACTIONS)]);
export const CAMPUS_OPERATION_ID = /^[A-Za-z0-9_-]{8,64}$/;
export const CAMPUS_USER_ID = /^[A-Za-z0-9_-]{1,160}$/;
export const CAMPUS_LEASE_ID = /^lease-[1-9]\d{0,8}$/, CAMPUS_REQUEST_ID = /^request-[1-9]\d{0,8}$/;
const UNIT_ID = /^[A-Za-z0-9_-]{1,80}$/, RESERVED = ['__proto__', 'constructor', 'prototype'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactly = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export const campusUserId = value => typeof value === 'string' && CAMPUS_USER_ID.test(value) && !RESERVED.includes(value);
export const campusContract = value => exactly(value, ['id', 'layout', 'units']) && typeof value.id === 'string' && value.id.length <= 64
  && typeof value.layout === 'string' && value.layout.length <= 16 && Number.isSafeInteger(value.units) && value.units >= 0;
const instant = value => Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
const version = value => Number.isSafeInteger(value) && value >= 1 && value <= 1e9;
const CHECKS = {
  unitId: value => typeof value === 'string' && UNIT_ID.test(value) && !RESERVED.includes(value), tenantId: campusUserId, peerId: campusUserId,
  requestId: value => typeof value === 'string' && CAMPUS_REQUEST_ID.test(value), leaseId: value => typeof value === 'string' && CAMPUS_LEASE_ID.test(value),
  startsAt: instant, endsAt: instant, expectedVersion: version,
};
const invalid = { ok: false, error: 'invalid_campus_command', message: CAMPUS_LEASE_ERRORS.invalid_campus_command };

// Exact fields only: an owner, tenant, operator, price or terms field the action does not
// name is refused, never ignored. issue's requestId is optional (null or omitted).
export function parseCampusCommand(message) {
  if (!record(message) || message.type !== 'campus') return invalid;
  if (message.action === 'list') return exactly(message, ['type', 'action']) ? { ok: true, command: { action: 'list' } } : invalid;
  if (typeof message.action !== 'string' || !Object.hasOwn(ACTIONS, message.action)) return invalid;
  const fields = ACTIONS[message.action], keys = [...COMMON, ...fields], optional = message.action === 'issue' ? ['requestId'] : [];
  if (!Object.keys(message).every(key => keys.includes(key)) || !keys.every(key => optional.includes(key) || Object.hasOwn(message, key))) return invalid;
  if (typeof message.operationId !== 'string' || !CAMPUS_OPERATION_ID.test(message.operationId)
    || typeof message.worldId !== 'string' || message.worldId.length > 64 || !campusContract(message.contract)) return invalid;
  const command = { action: message.action, operationId: message.operationId, worldId: message.worldId,
    contract: { id: message.contract.id, layout: message.contract.layout, units: message.contract.units } };
  for (const field of fields) {
    const value = message[field] ?? null;
    if (!(field === 'requestId' && optional.length && value === null) && !CHECKS[field](value)) return invalid;
    command[field] = value;
  }
  return { ok: true, command };
}

// The rentable units: exactly #506's campusUnitInventory(), with the door each opens from
// and the public point outside it, where an occupant whose access ends is returned
// (mirroring the door's inside point across the door line onto the public spine).
export function campusLeaseUnits(layout = GARDEN_CAMPUS_LAYOUT) {
  const suites = new Map(layout.towers.flatMap(tower => tower.levels.flatMap(level => level.suites.map(suite => [suite.id, suite]))));
  return campusUnitInventory(layout).map(unit => {
    const suite = suites.get(unit.id), [du, dv] = suite.door.position, [iu, iv] = suite.door.inside, levelId = campusLevelId(unit.z);
    return Object.freeze({ unitId: unit.id, number: unit.number, tower: unit.tower, floor: unit.level, levelId, netArea: unit.netArea,
      door: Object.freeze({ position: [du, dv], inside: [iu, iv], opensTo: suite.door.opensTo }),
      landing: Object.freeze({ levelId, surfaceId: suite.door.opensTo, position: [du * 2 - iu, dv * 2 - iv] }), desk: [...unit.desk] });
  });
}
