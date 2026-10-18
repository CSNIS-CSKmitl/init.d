import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClientIp, resolveClientIp } from '../src/lib/server/client-ip.mjs';
import { normalizeRequestTarget } from '../src/lib/server/request-target.mjs';

test('normalizes IPv4, IPv6, brackets, ports, and zones', () => {
	assert.equal(normalizeClientIp('203.0.113.4:443'), '203.0.113.4');
	assert.equal(normalizeClientIp('[2001:db8::7]:443'), '2001:db8::7');
	assert.equal(normalizeClientIp('fe80::1%eth0'), 'fe80::1');
	assert.equal(normalizeClientIp('not-an-ip'), '');
});

test('prefers the original Cloudflare IPv6 when proxy headers are trusted', () => {
	assert.equal(resolveClientIp({
		headers: {
			'cf-connecting-ip': '2001:db8::44',
			'x-forwarded-for': '198.51.100.2',
			'x-real-ip': '10.0.0.4'
		},
		remoteAddress: '127.0.0.1',
		trustProxy: true
	}), '2001:db8::44');
});

test('ignores forwarded headers when proxy trust is disabled', () => {
	assert.equal(resolveClientIp({
		headers: { 'cf-connecting-ip': '2001:db8::44' },
		remoteAddress: '::1',
		trustProxy: false
	}), '::1');
});

test('normalizes duplicate-leading-slash OAuth callback targets', () => {
	assert.equal(normalizeRequestTarget('//#/auth/oauth2-redirect-success'), '/#/auth/oauth2-redirect-success');
	assert.equal(normalizeRequestTarget('//?state=abc'), '/?state=abc');
	assert.equal(normalizeRequestTarget('/login'), '/login');
});
