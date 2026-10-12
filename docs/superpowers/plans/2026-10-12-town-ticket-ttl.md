# Town join tickets that outlast a slow page — 2026-10-12

**Objective:** a join ticket lived 15 s. Since #260, a busy page is allowed
12 s to open its socket and then 45 s for the first snapshot, restarting when
its timers are starved. A page that slow can present a ticket after it has
expired, get a 401 and back off, which is the reconnect cascade #260 set out to
remove. Approved by river-oaks-c2 (server hardening owner): one lifetime for
both servers.

**Branch / worktree:** `fix/town-ticket-ttl` in `../river-oaks-ticket-ttl-20261012`.

## Change

- `server/ticket-policy.js`: `TICKET_TTL_MS = 60_000` and `TICKETS_PER_USER = 3`,
  shared by both servers.
- The single-process server (`server/app.js`) issues tickets for
  `TICKET_TTL_MS`. Like the Redis path, it now holds at most
  `TICKETS_PER_USER` per user: a new request retires that user's oldest, so
  retries keep working but one account cannot fill the 512-ticket table.
- The Redis path (`server/redis-security.js`) passes the lifetime to its ISSUE
  script as `ARGV[7]`, in place of three hard-coded `15000`s (expiry score,
  ordering score and key expiry).
- `preview/e2e/email-access.test.js` records the town sockets a page opens. It
  asserts exactly one joins, and its failure dump now includes the socket
  count and `#canvas-host[data-multiplayer]`.
- The town-connect-deadline ledger is corrected: the email-access flake
  predates #253 (run 38153200219, attempt 1).
- Docs that #273 added now give the 60 s lifetime:
  - the "Join tickets" row in `docs/security-review.md`, which also notes
    that both servers cap three live tickets per user, and the
    single-process 512-ticket table;
  - the join-sequence prompts in `docs/multiplayer.md` and
    `docs/diagrams.md`.

  The plans index is regenerated with `pnpm run plans:index`.

## Verification

- Server tests with a local Redis cover tickets over both transports:
  - a ticket used 59 s after issue still joins, and one used after
    `TICKET_TTL_MS` is refused;
  - a fourth request retires a user's oldest ticket;
  - Redis keys expire with the ticket.
- `redis-security.test.js` "tickets expire after their lifetime" used to check
  the first ticket issued. Under the per-user cap that ticket was already
  retired, so expiry was never what refused it. Now the second-newest live
  ticket is accepted one second before the lifetime ends and the newest is
  refused one millisecond after. That positive control was river-oaks-c2's
  review suggestion.
- On `f662e93`:
  - `pnpm test`: 2664 pass, 1 skip.
  - `REDIS_URL=… pnpm run test:server` with a local Redis: 544/544.
  - `pnpm run build`: ok.
  - `pnpm run verify`: core passed.
  - `pnpm run test:security:e2e`: 2/2, twice. Email access joins with exactly
    one town socket.
- Rebased onto `c5f3b4f` (#273) with the docs and the positive control:
  - `pnpm test`: 2667 pass, 1 skip.
  - `test:server` with Redis: 546/546.
  - `pnpm run verify`: core passed.

## Next step

PR, the landing queue, the guard.
