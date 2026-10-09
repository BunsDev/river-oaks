# Authoritative multiplayer service

Read `docs/multiplayer.md` and the endpoint's callers before editing. `api/server.js`,
`middleware.js`, and `vercel.json` are also part of the hosted boundary.

- Preserve GitHub/WorkOS identity, waitlist, ownership, CSRF, rate limits, and server
  authority. Development fixture identities must never reach production routes.
- Cover HTTP and WebSocket behavior together when changing tickets, sessions or
  shared commands. Keep Redis and in-memory implementations contract-compatible.
- Run `pnpm run test:server` from the root. Redis cases skip without `REDIS_URL`;
  use an isolated test database and verify zero unexpected skips for Redis work.
  Tests own random namespaces; never FLUSHDB or use production Redis.
- Run `pnpm run test:shared` for browser-visible transport/account changes.
  Synthetic identity tests do not establish real WorkOS or hosted routing acceptance.
- Never log credentials, session cookies, raw provider tokens or private profile data.

See root AGENTS.md and `docs/testing.md` for delivery requirements.
