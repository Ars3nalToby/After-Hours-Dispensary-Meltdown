'use strict';
/* netguard.js: SSRF protection primitives.
 *   parseTarget(raw)   validates a user-supplied URL (scheme, credentials, port, length)
 *   isPublicIp(ip)     false for every private, loopback, link-local, reserved, multicast or
 *                      embedded-private address (IPv4, IPv6, IPv4-mapped, NAT64, 6to4, Teredo)
 *   resolvePublic(host) resolves a hostname ONCE and returns an address that passed the check,
 *                      so the caller can connect to that exact IP (no DNS rebinding window). */
const net = require('node:net');
const dns = require('node:dns').promises;

const v4 = new net.BlockList();
for (const [a, p] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) v4.addSubnet(a, p, 'ipv4');
const v6 = new net.BlockList();
for (const [a, p] of [
  ['::', 128], ['::1', 128], ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
]) v6.addSubnet(a, p, 'ipv6');

// Expand an IPv6 string to eight 16-bit groups (handles :: and a trailing dotted quad).
function groups6(ip) {
  let s = ip.toLowerCase().split('%')[0];
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) { const p = dotted[1].split('.').map(Number); s = s.slice(0, -dotted[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16); }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [], t = tail === undefined ? [] : (tail ? tail.split(':') : []);
  const fill = new Array(Math.max(0, 8 - h.length - t.length)).fill('0');
  return (tail === undefined ? h : h.concat(fill, t)).map(x => parseInt(x || '0', 16));
}
const v4from = (hi, lo) => [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');

function isPublicIp(ip) {
  if (typeof ip !== 'string') return false;
  const kind = net.isIP(ip.split('%')[0]);
  if (kind === 4) return !v4.check(ip, 'ipv4');
  if (kind !== 6) return false;
  const g = groups6(ip);
  if (g.length !== 8 || g.some(Number.isNaN)) return false;
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the embedded IPv4 address.
  if (g.slice(0, 5).every(x => x === 0) && (g[5] === 0xffff || g[5] === 0)) return !v4.check(v4from(g[6], g[7]), 'ipv4');
  // NAT64 64:ff9b::/96 embeds an IPv4 address in the last 32 bits.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(x => x === 0)) return !v4.check(v4from(g[6], g[7]), 'ipv4');
  // 6to4 2002:AABB:CCDD::/48 embeds an IPv4 address in bits 16..47.
  if (g[0] === 0x2002) return !v4.check(v4from(g[1], g[2]), 'ipv4');
  return !v6.check(g.map(x => x.toString(16)).join(':'), 'ipv6');
}

class GuardError extends Error { constructor(code, message) { super(message); this.code = code; } }

const MAX_URL = 2048;
// Ports a visitor may target. Anything below 1024 other than 80/443 is refused.
const portOk = p => p === 80 || p === 443 || (p >= 1024 && p <= 65535);

function parseTarget(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new GuardError('bad_url', 'Enter a web address.');
  let s = raw.trim();
  if (s.length > MAX_URL) throw new GuardError('bad_url', 'That address is too long.');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;   // "example.com" -> https://example.com
  let u;
  try { u = new URL(s); } catch { throw new GuardError('bad_url', 'That does not look like a web address.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new GuardError('bad_scheme', 'Only http and https addresses work.');
  if (u.username || u.password) throw new GuardError('bad_url', 'Addresses with a username or password are not allowed.');
  if (!u.hostname) throw new GuardError('bad_url', 'That address has no host name.');
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (!portOk(port)) throw new GuardError('bad_port', 'That port is not allowed.');
  u.hash = '';
  return u;
}

// Resolve a host once. Throws GuardError('blocked') if ANY returned address is non-public (strict on purpose).
// allowIp(ip, port, host) is an optional escape hatch used ONLY by tests (e.g. to let a fixture server on loopback through).
async function resolvePublic(host, lookup, allowIp, port) {
  host = host.replace(/^\[|\]$/g, '');
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host, family: net.isIP(host) }];
  else {
    try { addrs = await (lookup || (h => dns.lookup(h, { all: true, verbatim: true })))(host); }
    catch { throw new GuardError('dns', 'Could not find that site.'); }
  }
  if (!addrs || !addrs.length) throw new GuardError('dns', 'Could not find that site.');
  for (const a of addrs) if (!isPublicIp(a.address) && !(allowIp && allowIp(a.address, port, host))) throw new GuardError('blocked', 'That address points at a private or internal network, so it is blocked.');
  return addrs[0];
}

module.exports = { isPublicIp, parseTarget, resolvePublic, GuardError, portOk, MAX_URL };
