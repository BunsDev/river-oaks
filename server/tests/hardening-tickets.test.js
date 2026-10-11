// Hardening: join tickets are bounded per user, so a few hundred approved
// accounts cannot fill the shared ticket table and lock every player out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createRedisSecurity } from '../redis-security.js';

test('each user holds at most 3 live tickets, and the table does not fill from 171 accounts', {skip: !process.env.REDIS_URL, timeout: 60_000}, async t => {
  const redis = new Redis(process.env.REDIS_URL);redis.on('error', () => {});
  const prefix = `{river-oaks:hardening-tickets:${randomUUID()}}`;
  let time = 1_000_000;
  const security = createRedisSecurity({redis, prefix, now: () => time});
  t.after(async () => { security.close?.();const keys = await redis.keys(`${prefix}*`);if (keys.length) await redis.del(...keys);await redis.quit(); });
  const user = id => ({userId: id, sessionId: `${id}-session`, name: id, expiresAt: time + 600_000});
  // One user asks ten times in a minute: only the newest three still work.
  const tickets = [];
  for (let i = 0; i < 10; i++) tickets.push(await security.issueTicket(user('hoarder')));
  assert.ok(tickets.every(Boolean), 'each request still gets a fresh ticket');
  const usable = [];
  for (const ticket of tickets) usable.push(await security.consumeTicket(ticket, user('hoarder')));
  assert.deepEqual(usable, [false, false, false, false, false, false, false, true, true, true]);
  // The old global table refused everyone once 512 tickets were live: 171 accounts x 3.
  for (let i = 0; i < 171; i++) for (let j = 0; j < 3; j++) assert.ok(await security.issueTicket(user(`account-${i}`)), `account-${i} #${j}`);
  assert.ok(await security.issueTicket(user('newcomer')), 'a real player can still get a ticket');
  assert.equal(await security.consumeTicket(await security.issueTicket(user('newcomer')), user('newcomer')), true);
});
