# Garden campus leases

The Gardens (#505) rents its office suites through owner-managed leases. A campus
operator offers a suite on explicit dates, the resident accepts, and the server
admits that resident and the guests they name. **Nothing is charged.** Every lease
says so in its terms: mode `owner-managed`, charge `none`, label *No charge —
owner-managed*. Paid rentals do not exist yet; [Paid mode](#paid-mode-proposal)
lists the decisions they need.

This page covers the server authority from #509: `server/campus-leases.js`, the
shared command contract `shared/garden-campus-lease-contract.js`, and the world
checkpoint. The rental UI is #510. Entering a suite, standing in it and being moved
out of it is #508, which calls the access decision described below.

## Who can do what

- **Operators** are the accounts listed in `RIVER_OAKS_CAMPUS_OPERATOR_IDS`
  (comma-separated account ids, server only). None are configured by default, so
  leasing stays closed until someone sets it. No command carries an owner or
  operator field. Jevica's admin accounts are not operators unless listed, and an
  operator cannot rent a suite. Operators offer, renew and revoke leases and
  decline requests. They can see every lease's tenant, dates and guest count, but
  not who the guests are, and they cannot enter a suite unless a tenant names them
  as a guest.
- **Residents** can ask for a suite, accept or decline an offer, release their
  lease, and add or remove guests.
- **Guests** can enter the one suite they were named for while its lease is
  active, and can remove themselves.

Leasing exists only in the `river-oaks` world, and only on a district revision
that serves the campus. #507's `attachGardenCampus` marks one with
`worldData.gardenCampus` (`campusServed` in `server/campus-leases.js`). Everywhere
else the campus is **inert**:

- the snapshot has no `campus` field;
- every campus command answers `campus_unavailable`;
- `campusSuiteAccess` refuses, and `campusAccess` is empty;
- nothing expires;
- a restored campus section is validated and written back byte for byte.

So switching the district between the garage and the campus (#512) loses no lease.
When the campus is served again, its leases are honoured, and any lease past its end
expires on the first tick, dated at its end. Configuration comes from the running
application, not from a checkpoint: replace the processes to change it, and keep it
the same on every gateway.

## Suites

The rentable units are exactly #506's `campusUnitInventory()`: 43 suites,
3,279.7 m² net, on floors 2 and above of T1, T2 and T3 (layout 3.1 at this revision; leases check major versions only, units version
1). Ids look like `T1-F2-W-S`, with display numbers like `T1-201`.
`campusLeaseUnits()` adds each suite's level id (`garden-campus/l1`…), its door,
and its **landing**: the point on the public spine just outside the door. The world
returns an occupant to the landing when their access ends. A test checks that every
landing lies on public support and every door's inside point lies in its suite.

## Lifecycle

| Record | States | How it moves |
| --- | --- | --- |
| Request | `pending` → `offered`, `declined`, `cancelled`, `expired`, `retired` | A resident asks for a suite with dates. An operator answers by offering a lease (`requestId`) or declining. The resident can cancel. A request lapses after 14 days. |
| Lease | `offered` → `active`, or ended: `declined`, `withdrawn`, `superseded`, `offer_expired`, `retired` | An operator offers a lease to an account, with or without a request. The tenant accepts it or declines it (`release`). The operator can withdraw it (`revoke`). An offer lapses after 7 days, or at the end of its term if that comes first. When another offer for the suite is accepted, the rest are `superseded`. |
| Lease | `active` → ended: `released`, `revoked`, `expired`, `retired` | The tenant releases it, the operator revokes it, or the term ends. The operator can renew an active lease, which only extends its end. |

A pending request and an outstanding offer are **not** admission. Only an active
lease admits, and only between its `startsAt` and `endsAt`. An ended lease never
changes again. Another lease for the same suite and tenant gets a new id, and ids
are never reused.

**Terms.** `startsAt` and `endsAt` are server-clock milliseconds. A lease can start
from five minutes before now up to 90 days ahead. Its term is 1 hour to 366 days.
A renewal can end up to 366 days after the renewal. There is no price, deposit,
currency or period field. A command that adds one is refused.

**Exclusivity.** Accepting an offer is the acquisition. A suite has at most one
active lease. World commands are serialised: one process in the memory town, and
one leased writer with fenced commits in Redis. So of two acceptances for one suite,
from any number of gateways, exactly one succeeds. The other offer is `superseded`
and its acceptance answers `campus_lease_ended`.

## Commands

Send `{type: 'campus', action, …}` over the town WebSocket. It passes the same
ticket, origin, CSRF, waitlist, ban, session and rate-limit gates as every world
command.

| Action | Who | Fields besides the common ones |
| --- | --- | --- |
| `list` | anyone | none (and no common fields) |
| `request` | resident | `unitId, startsAt, endsAt` |
| `cancel` | requester | `requestId` |
| `decline` | operator | `requestId` |
| `issue` | operator | `unitId, tenantId, startsAt, endsAt`, optional `requestId` |
| `accept`, `release` | tenant | `leaseId, expectedVersion` |
| `renew` | operator | `leaseId, expectedVersion, endsAt` |
| `revoke` | operator | `leaseId, expectedVersion` |
| `grant` | tenant | `leaseId, expectedVersion, peerId` |
| `ungrant` | tenant, or the guest themselves | `leaseId, expectedVersion, peerId` |

Every action except `list` also carries the common fields:

- `operationId`: 8–64 characters, chosen by the client and kept for retries.
- `worldId`: the world the client believes it is in.
- `contract`: `{id, layout, units}` from `CAMPUS_LEASE_CONTRACT`.

Unknown or extra fields fail with `invalid_campus_command`. Checks run in this
order:

1. The world exists, and so does its campus.
2. The world id matches (`campus_world_mismatch`).
3. The contract major versions match (`campus_contract_stale`). The reply includes
   the current contract.
4. The operation receipt.
5. The caller's role.
6. The lease's state.
7. The version the client last saw.

`CAMPUS_LEASE_ERRORS` in the shared contract lists every error code with the
sentence to show for it. A lease that the caller has no part in answers
`campus_lease_unknown`, so nobody can probe another account's leases.

**Replies.** A successful mutation answers `{ok: true, lease | request, serverTimeMs}`.
The record is shown as the caller is allowed to see it, or `null` once they no
longer can, such as a guest who has just left. `list` answers `{ok: true, campus,
serverTimeMs}`. The `campus` object holds:

- the contract, mode, charge, label and `leasing` (`owner-managed` or `closed`);
- `operator`: whether the caller is one;
- `units`: each suite's id, number, tower, floor, net area and
  `available`/`leased` status;
- `access`: the suites the caller may enter now;
- `leases` and `requests`: the caller's own;
- for operators, `manage: {leases, requests}` with everything.

**Retries.** The server keeps one receipt per account and operation id, across
sessions and gateways. The newest 256 are kept and survive coordinator replacement.
A retry with the same content answers `replayed: true` with the record's current
view and changes nothing. A reused id with different content answers
`campus_operation_conflict`. Once a receipt has aged out, the lease version and its
terminal states still stop a late command from acquiring twice, reviving an ended
lease or overwriting a newer change (`campus_lease_stale`, `campus_lease_ended`,
`campus_lease_not_offered`).

## Access decision for #508 and #510

- `world.campusSuiteAccess(userId, unitId)` answers synchronously from the world's
  state and clock. It returns `{ok: true, role: 'tenant' | 'guest', unitId, leaseId,
  version, until, landing}`, or `{ok: false, reason}`. The reason is one of
  `campus_unavailable`, `campus_unknown_unit`, `campus_unit_not_leased`,
  `campus_lease_not_started`, `campus_lease_expired` and `campus_access_required`.
  Check it on every suite entry, desk open and desk write, inside the same
  serialised world command or route as the action. Don't cache it. Inside
  `world.restore`, check a restored occupant against the state about to be
  committed: `campus.suiteAccess(userId, unitId, now(), nextCampus)`.
- `world.campusAccess(userId)` lists the suites an account may enter now.
- When access ends, the module reports `{userId, role, unitId, leaseId, reason,
  landing}` for the tenant and every guest. The reason is `expired`, `revoked`,
  `released` or `guest_removed`. `landing` is `{levelId, surfaceId, position}` in
  campus metres. The world receives each report in `campusAccessEnded`, the seam
  where #508 moves an occupant of that suite to the landing. Until suite occupancy
  exists nobody can be inside a suite, so the seam does nothing yet. Expiry is
  checked against the clock, so an expired lease admits no one even before the next
  tick records it.
- Ending access never touches account-private desk work, which stays with each
  account (#510 extends the desk to campus suites).

## Public and private data

The shared snapshot carries `campus: {contract, leasing, leased}`. `leased` lists
the suite ids with an active lease. It names no tenant, guest, request, term or
desk, and has no clock. Private detail travels only in command replies to the
caller:

- a tenant sees their lease, dates, operator name and guests;
- a guest sees the suite, dates and the tenant's name;
- an operator sees tenants and dates, and a guest count.

## Bounds

| Limit | Value |
| --- | --- |
| Leases per account, as tenant (offered or active) | 2 |
| Pending requests per account; campus-wide | 2; 128 |
| Open offers per suite | 4 |
| Guests per lease; leases one account can be a guest of | 8; 8 |
| Ended leases and closed requests kept for status | 128 each, oldest dropped first |
| Operation receipts kept | 256 |

The commands refuse anything that would cross a bound. A checkpoint that crosses one
is refused on restore.

## Persistence and recovery

Leases, guests, requests and receipts live in the private world checkpoint's
`campus` section, version 13: `{serial, leases, requests, receipts}`. They are kept
apart from presence, so they survive disconnects, every player leaving, application
replacement and Redis coordinator takeover. A lease expires on time even if nobody
is in town. Region revisions carry the section over, and the district checkpoint
migrations re-sign it unchanged.

- A world that does not serve the campus restores the section unchanged and keeps
  it inert (see [Who can do what](#who-can-do-what)).
- Checkpoints from versions 2–12 restore with no campus. An empty section is the
  same as none. A version-12 checkpoint carrying lease data is refused, so campus
  state cannot pass itself off as an older version.
- Restore validates every record, id, bound and invariant, such as one active lease
  per suite, `charge: 'none'`, and a tenant who is not the operator. Anything else
  fails the whole restore, and the previous committed world stays authoritative.
- A well-formed lease or request for a suite or contract version this server no
  longer serves ends as `retired`. It is not moved, and it never grants access.
- The Redis writer generation is `v13:`, or `v14:` for rooms with the character
  store, which is how production runs. A newer writer fences an older one, and an
  older coordinator refuses a version 13 checkpoint without writing.

**Rollback and pause.** Don't deploy code from before #509 over version 13 state.
It fails closed, and old coordinators cannot take the lease. To pause leasing,
unset `RIVER_OAKS_CAMPUS_OPERATOR_IDS` and replace the processes. Leasing closes:
no new requests or acceptances, and no operator actions. Active leases keep their
access until they end, and tenants can still release them. Offers from an operator
who is no longer configured can't be accepted (`campus_operator_retired`).

## Limits of this delivery

- There is no UI (#510). Suite entry, occupancy and relocation are #508, and
  `campusAccessEnded` does nothing until then.
- The office desk API still admits only during a Jevica office visit. A campus
  desk context is #510's.
- The server does not notify tenants when an offer arrives or a lease ends. Clients
  learn from `list` and from the public frame.
- Names are recorded when a request, offer or grant is made.
- Verified locally with synthetic identities, in memory and against an isolated
  Redis. There is no hosted, production or real-account evidence.

## Paid mode proposal

Paid rentals are not built, and nothing collects money. Restore refuses any lease
whose mode is not `owner-managed`. That is deliberate: a paid lease needs a new
record shape and checkpoint version that older writers cannot misread.

### Decisions needed before any paid work

1. **Operator of record.** Which legal entity offers paid suites, and which accounts
   act for it.
2. **Currency.** One currency or several, and whether prices include tax. Sales tax
   or VAT collection follows from this.
3. **Prices.** Per suite, per net m², or per tower and floor tier, and for which
   periods. No price may be invented in code.
4. **Periods.** Monthly, weekly or a fixed term. Proration, minimum and maximum
   terms, and whether renewal is automatic.
5. **Cancellation and refunds.** Tenant cancellation before the start and during
   the term. Operator revocation for cause and for convenience. What a dispute or
   chargeback does to access.
6. **Payment provider** and its account. Who holds the credentials, how test and
   live modes are kept apart, and the customer terms and privacy notice it needs.
7. **Settlement source of truth.** Only the provider's verified server-side record
   (signed webhook, then server retrieval) activates or extends a paid lease.
8. **Failure and expiry.** How long an offer is held while payment is pending, the
   grace period for a failed renewal, retries and reminders, and when access ends.
9. **Eligibility.** Which accounts may rent (for example, approved waitlist members
   only) and how many paid suites each may hold.
10. **Records.** Receipts or invoices, and how long payment records are kept.

### Server-side settlement boundary

The extension stays narrow:

- A paid offer records server-held terms: price, currency and period, from a
  configured price table, never from a client.
- A client `accept` on a paid offer records intent only (`awaiting_payment`). It
  never activates.
- A separate settlement module verifies each provider event's signature, event id,
  amount, currency, account, lease id and version. It then enqueues a **trusted**
  world operation (like the room's trusted `revise`), never a client command. Only
  that operation moves a lease from `awaiting_payment` to `active` or extends its
  end.
- Durable settlement receipts (provider event ids and amounts) live outside the
  world checkpoint and are referenced from the lease by id, so a repeated or
  reordered webhook settles once.
- Refunds, disputes and failed renewals arrive the same way and end or keep access
  according to the policy above. Provider secrets stay server-side; nothing goes in
  `VITE_*`.

### Provider acceptance cases

Each case must pass through the real webhook endpoint, in the provider's test mode,
with an isolated Redis:

- A completed payment activates exactly once, including on duplicate and
  out-of-order webhook delivery and across two gateways.
- A browser success redirect, a client message, an unsigned or forged webhook, or a
  fixture receipt never activates a lease.
- A wrong amount, currency, account, lease or version is refused and flagged for
  refund.
- A payment for an offer that was withdrawn, superseded or expired grants no access
  and follows the refund policy.
- Two tenants paying for one suite end with one active lease, and the other payment
  is refunded.
- A payment arriving during coordinator replacement settles once.
- A provider outage releases the held offer on time.
- A failed renewal follows the grace period, then expiry.
- A refund or chargeback ends access per policy without deleting private desk work.
- Test-mode and live-mode credentials and events cannot cross.
- A reconciliation report matches provider records to leases.

### Readiness condition for paid mode

Paid mode may be enabled only when all five hold:

1. Val has recorded every decision above on this page.
2. The settlement extension, with its new checkpoint version, is reviewed and
   merged.
3. Every provider acceptance case passes in test mode, with recorded results.
4. One live-mode payment has been made, refunded and reconciled by Val or someone
   Val names.
5. Val has set the production provider configuration.

Until then the campus runs owner-managed, non-charging leases only, and no paid
milestone can close on fixture-only evidence.
