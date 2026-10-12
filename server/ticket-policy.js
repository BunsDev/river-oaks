// Town join tickets, shared by the single-process and Redis servers. A ticket is
// single-use and bound to the session that asked for it. It lives long enough
// for a slow page (a busy main thread on a low-end device or CPU-only rendering)
// to open the socket. Each user holds at most TICKETS_PER_USER: a new request
// retires that user's oldest, so retries keep working but a few hundred
// accounts cannot fill a shared table and lock everyone else out.
export const TICKET_TTL_MS = 60_000;
export const TICKETS_PER_USER = 3;
