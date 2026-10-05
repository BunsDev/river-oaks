import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientAddress as create, rateLimitKey } from '../client-address.js';
const request = (peer, forwarded) => ({ socket: { remoteAddress: peer }, headers: { 'x-forwarded-for': forwarded } });

test('ignores spoofed forwarding headers by default and for untrusted peers', () => {
  assert.equal(create()(request('203.0.113.1', '198.51.100.1')), '203.0.113.1');
  assert.equal(create(['127.0.0.1'])(request('203.0.113.1', '198.51.100.1')), '203.0.113.1');
});

test('trusted proxy separates visitors and stops at the nearest untrusted hop', () => {
  const address = create(['127.0.0.1', '10.0.0.2']);
  assert.equal(address(request('127.0.0.1', '198.51.100.1')), '198.51.100.1');
  assert.equal(address(request('127.0.0.1', '198.51.100.2')), '198.51.100.2');
  assert.equal(address(request('127.0.0.1', '192.0.2.99, 198.51.100.1, 10.0.0.2')), '198.51.100.1');
  assert.equal(address(request('127.0.0.1', '10.0.0.2')), '10.0.0.2');
});

test('canonicalizes IPv6 and IPv4-mapped peers and forwarded addresses', () => {
  const address = create(['127.0.0.1', '2001:db8::1']);
  assert.equal(address(request('::ffff:127.0.0.1', '::ffff:c633:6401')), '198.51.100.1');
  assert.equal(address(request('2001:0db8:0000::1', '2001:0db8:0000::2')), '2001:db8::2');
});

test('malformed or oversized forwarding chains fall back to the direct peer', () => {
  const address = create(['127.0.0.1']);
  for (const header of [undefined, '', ['198.51.100.1'], 'unknown', '198.51.100.1:443', '[2001:db8::2]', '198.51.100.1,', 'garbage, 198.51.100.1', 'fe80::1%eth0', ' '.repeat(1025), Array(17).fill('198.51.100.1').join(',')]) {
    assert.equal(address(request('127.0.0.1', header)), '127.0.0.1');
  }
});

test('invalid trust configuration fails rather than granting broad trust', () => {
  for (const ip of ['*', 'localhost', '127.0.0.0/8', 'bad', 'fe80::1%eth0']) assert.throws(() => create([ip]), /Invalid trusted proxy IP/);
});

test('missing peer information never trusts a forwarding header', () => {
  assert.equal(create(['127.0.0.1'])(request(undefined, '198.51.100.1')), 'unknown');
});

test('IPv6 addresses are rate limited per /64, IPv4 per address', () => {
  assert.equal(rateLimitKey('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64');
  assert.equal(rateLimitKey('2001:db8:1:2:ffff:ffff:ffff:ffff'), '2001:db8:1:2::/64');
  assert.equal(rateLimitKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(rateLimitKey('2001:DB8:a:b::'), '2001:db8:a:b::/64');
  assert.notEqual(rateLimitKey('2001:db8:1:3::1'), rateLimitKey('2001:db8:1:2::1'));
  assert.equal(rateLimitKey('203.0.113.7'), '203.0.113.7');
  assert.equal(rateLimitKey('unknown'), 'unknown');
});
