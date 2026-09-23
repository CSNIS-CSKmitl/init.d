#!/usr/bin/env node
// Read-only smoke test against a locally running production server.
import assert from 'node:assert/strict';
import 'dotenv/config';
import PocketBase from 'pocketbase';

const base = process.env.TEST_APP_URL ?? 'http://127.0.0.1:3001';
const password = process.env.TEST_USER_PASSWORD;
if (!password) throw new Error('Set TEST_USER_PASSWORD.');

async function signIn(email) {
	const response = await fetch(`${base}/login`, {
		method: 'POST', redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base, accept: 'text/html' },
		body: new URLSearchParams({ identity: email, password })
	});
	assert.equal(response.status, 303, `${email} login failed: ${(await response.clone().text()).slice(0, 180)}`);
	const cookie = response.headers.getSetCookie().find((value) => value.startsWith('pb_auth='))?.split(';')[0];
	assert.ok(cookie, 'login did not set pb_auth cookie');
	return cookie;
}

async function page(path, cookie) {
	const response = await fetch(`${base}${path}`, { headers: { cookie }, redirect: 'manual' });
	return { status: response.status, html: await response.text() };
}

const userCookie = await signIn(process.env.TEST_USER_EMAIL);
const request = await page('/request', userCookie);
assert.equal(request.status, 200);
assert.ok(request.html.includes('Co-owner emails'));
assert.equal((await page('/status', userCookie)).status, 200);
assert.equal((await page('/admin', userCookie)).status, 403);

const adminCookie = await signIn(process.env.TEST_ADMIN_USER_EMAIL);
assert.equal((await page('/admin', adminCookie)).status, 200);

const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);
await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
const requester = await pb.collection('users').getFirstListItem(pb.filter('email = {:email}', { email: process.env.TEST_USER_EMAIL }));
const coOwner = await pb.collection('users').getFirstListItem(pb.filter('email = {:email}', { email: process.env.TEST_ADMIN_USER_EMAIL }));
const group = await pb.collection('passion_group').getFirstListItem('');
let record;
try {
	const start = new Date();
	record = await pb.collection('instances').create({
		email: requester.id, owners: [], passion_group: group.id, type: 'vm',
		hostname: `codex-web-owners-${Date.now()}`, os_template: 'ubuntu-24.04',
		specs: { cpu: 1, ram: 2, disk: 20 }, network_type: 'local',
		purpose_notes: 'Temporary owner form test', start_date: start.toISOString(),
		end_date: new Date(start.getTime() + 86400000).toISOString(), quantity: 1, status: 'pending'
	});
	async function saveOwners(emails) {
		const response = await fetch(`${base}/status?/owners`, {
			method: 'POST', redirect: 'manual',
			headers: { cookie: userCookie, origin: base, accept: 'text/html', 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ id: record.id, owner_emails: emails })
		});
		assert.equal(response.status, 303, `owner action failed: ${(await response.text()).slice(0, 180)}`);
	}
	await saveOwners(process.env.TEST_ADMIN_USER_EMAIL);
	assert.deepEqual((await pb.collection('instances').getOne(record.id)).owners, [coOwner.id]);
	await pb.collection('instances').update(record.id, { status: 'completed' });
	await saveOwners('');
	assert.deepEqual((await pb.collection('instances').getOne(record.id)).owners, []);
	console.log('PASS: user request/status pages, admin access, and owner form before/after completion');
} finally {
	if (record) await pb.collection('instances').delete(record.id);
}
