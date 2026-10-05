# Gatherings across shared worlds

Open **Places → Events** to find upcoming and active gatherings. The calendar
shows the host, named outdoor meeting point, world, dates in your local time
zone, and the number going. Filter to this world or events you have joined.
**Visit meeting point** opens that world's existing place link; travel uses
its usual server checks and never enters a private home.

With `VITE_CREATION_TOOLS=true`, approved residents can open **Host a gathering**
and choose a meeting point
in the world they are viewing. Use a start within 30 days and a duration from
15 minutes to eight hours. The RSVP capacity is 2–32 and includes the host,
who starts on the guest list. Each account may host five unexpired events;
the shared calendar holds 128 across all worlds. Ended events disappear and
free their storage on the next calendar operation.

**I'm going** adds a private RSVP; **Withdraw RSVP** removes it. Counts persist
across worlds, devices, reconnects, and server instances. Attendee account IDs
are stored only on the server. A repeated RSVP uses one place; concurrent
requests cannot exceed capacity. RSVPs describe intended attendance and do
not reserve a connection to a full world or admission to a private home.

Hosts can cancel their events. Jevica can cancel any event. Scheduling and
RSVP do not grant building, furnishing, publishing, or wish powers. Times,
venue, and description are fixed when scheduled; cancel and create a new event
to change them. Recurring gatherings and reminder notifications remain future
work. Venue names are captured when scheduled; if a region revision removes
the meeting point, its travel link reports that it is unavailable.

## Storage and verification

Production uses an account-wide Redis hash with bounded records and atomic
Lua operations. Calendar operations prune ended events and run only on HTTP
requests, outside room simulation ticks. Local development uses equivalent
in-memory rules. All routes require authentication, waitlist approval, an
unbanned account, the correct origin and CSRF token. Writes allow 12 operations
per minute per account. The visible directory refreshes every 30 seconds;
**Refresh events** retrieves it immediately.

`server/tests/events.test.js` checks capacity, idempotency, private attendance,
limits, expiration, and concurrent Redis requests. The API and gateway tests
cover forged host/admin fields, waitlist/CSRF checks, cross-world discovery,
and recovery after gateway replacement. `preview/e2e/world-events.js` drives
two accounts through scheduling, RSVP, reconnect, withdrawal, cancellation,
and the destination link while checking nonadmin permissions.

A local Redis 7 measurement on Apple M3 Max with 128 events and 32 RSVPs per
event produced a 44,592-byte public list. Across 100 reads, median latency was
1.97 ms, p95 2.86 ms, maximum 8.56 ms. This measures calendar storage/list
serialization on loopback, not hosted latency, GPU cost, or a global soak.
