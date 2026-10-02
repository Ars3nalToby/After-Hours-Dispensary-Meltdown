'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isPublicIp, parseTarget, resolvePublic, GuardError } = require('../netguard');

test('private, loopback, link-local and reserved IPv4 are blocked', () => {
  for (const ip of ['127.0.0.1', '127.255.255.254', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '100.127.255.255', '0.0.0.0', '0.1.2.3', '192.0.0.1', '198.18.0.1', '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255', '192.0.2.5'])
    assert.equal(isPublicIp(ip), false, ip);
});
test('ordinary public IPv4 is allowed, including edges next to private ranges', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '11.0.0.1', '169.253.1.1', '192.169.0.1'])
    assert.equal(isPublicIp(ip), true, ip);
});
test('IPv6 loopback, link-local, unique-local, multicast and unspecified are blocked', () => {
  for (const ip of ['::1', '::', 'fe80::1', 'febf::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1', '100::1', 'fec0::1'])
    assert.equal(isPublicIp(ip), false, ip);
});
test('IPv6 forms that smuggle a private IPv4 address are blocked', () => {
  for (const ip of ['::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '0:0:0:0:0:ffff:192.168.0.1', '64:ff9b::7f00:1', '64:ff9b::a00:1', '2002:7f00:1::', '2002:c0a8:101::1', '::127.0.0.1'])
    assert.equal(isPublicIp(ip), false, ip);
});
test('public IPv6 and public embedded IPv4 are allowed', () => {
  for (const ip of ['2606:4700:4700::1111', '2a00:1450:4001:81b::200e', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1'])
    assert.equal(isPublicIp(ip), true, ip);
});
test('garbage is never public', () => {
  for (const ip of ['', 'not-an-ip', '999.1.1.1', '1.2.3', null, undefined, 42]) assert.equal(isPublicIp(ip), false, String(ip));
});

test('parseTarget accepts http(s) and adds https to bare hosts', () => {
  assert.equal(parseTarget('example.com').href, 'https://example.com/');
  assert.equal(parseTarget('  http://example.com/a?b=1#frag ').href, 'http://example.com/a?b=1');
  assert.equal(parseTarget('https://example.com:8443/').port, '8443');
});
test('parseTarget rejects other schemes and tricks', () => {
  for (const bad of ['file:///etc/passwd', 'ftp://example.com', 'javascript:alert(1)', 'data:text/html,hi', 'gopher://example.com', 'ws://example.com', 'chrome://settings', 'view-source:http://example.com'])
    assert.throws(() => parseTarget(bad), e => e instanceof GuardError && /scheme|url/.test(e.code), bad);
  assert.throws(() => parseTarget('http://user:pass@example.com'), GuardError);
  assert.throws(() => parseTarget('http://example.com:22'), e => e.code === 'bad_port');
  assert.throws(() => parseTarget('http://example.com:25/'), e => e.code === 'bad_port');
  assert.throws(() => parseTarget(''), GuardError);
  assert.throws(() => parseTarget('http://' + 'a'.repeat(3000)), GuardError);
  assert.throws(() => parseTarget({}), GuardError);
});
test('numeric host tricks normalise to a blocked address', async () => {
  // WHATWG URL turns these into dotted quads, which resolvePublic then refuses.
  for (const raw of ['http://2130706433/', 'http://0x7f.1/', 'http://0177.0.0.1/', 'http://127.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://0/'])
    await assert.rejects(resolvePublic(parseTarget(raw).hostname), e => e.code === 'blocked', raw);
});
test('resolvePublic blocks a host if ANY of its addresses is private (rebinding style answers)', async () => {
  const mixed = async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }];
  await assert.rejects(resolvePublic('evil.test', mixed), e => e.code === 'blocked');
  const ok = async () => [{ address: '93.184.216.34', family: 4 }];
  assert.equal((await resolvePublic('good.test', ok)).address, '93.184.216.34');
  const none = async () => { throw new Error('ENOTFOUND'); };
  await assert.rejects(resolvePublic('nowhere.test', none), e => e.code === 'dns');
  await assert.rejects(resolvePublic('localhost', async () => [{ address: '::1', family: 6 }, { address: '127.0.0.1', family: 4 }]), e => e.code === 'blocked');
});
