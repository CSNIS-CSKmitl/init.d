#!/usr/bin/env node
// Live integration check. Creates one temporary request and always removes it.
import 'dotenv/config';
import assert from 'node:assert/strict';
import PocketBase from 'pocketbase';

const { POCKETBASE_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, TEST_ADMIN_USER_EMAIL, TEST_USER_EMAIL, TEST_USER_PASSWORD } = process.env;
if (!TEST_ADMIN_USER_EMAIL || !TEST_USER_EMAIL || !TEST_USER_PASSWORD) throw new Error('Set TEST_ADMIN_USER_EMAIL, TEST_USER_EMAIL and TEST_USER_PASSWORD.');

function client() {
	const pb = new PocketBase(POCKETBASE_URL);
	pb.autoCancellation(false);
	return pb;
}
const superuser = client();
const requester = client();
const coOwner = client();
await superuser.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
await requester.collection('users').authWithPassword(TEST_ADMIN_USER_EMAIL, TEST_USER_PASSWORD);
await coOwner.collection('users').authWithPassword(TEST_USER_EMAIL, TEST_USER_PASSWORD);
const requesterId = requester.authStore.record.id;
const coOwnerId = coOwner.authStore.record.id;
const group = await superuser.collection('passion_group').getFirstListItem('');
let record;
try {
	const start = new Date();
	const end = new Date(start.getTime() + 86400000);
	record = await superuser.collection('instances').create({
		email: requesterId, owners: [], passion_group: group.id,
		type: 'vm', hostname: `codex-owners-${Date.now()}`, os_template: 'ubuntu-24.04',
		specs: { cpu: 1, ram: 2, disk: 20 }, network_type: 'local',
		purpose_notes: 'Temporary co-owner integration test',
		start_date: start.toISOString(), end_date: end.toISOString(), quantity: 1, status: 'pending'
	});
	console.log('temporary record created');
	await requester.collection('instances').getOne(record.id);
	console.log('requester read verified');
	await assert.rejects(coOwner.collection('instances').getOne(record.id));
	const updated = await superuser.collection('instances').update(record.id, { owners: [coOwnerId] });
	console.log('co-owner relation stored:', JSON.stringify(updated.owners), 'matches login:', updated.owners?.includes(coOwnerId));
	const shared = await coOwner.collection('instances').getOne(record.id);
	console.log('co-owner read verified');
	assert.deepEqual(shared.owners, [coOwnerId]);
	const list = await coOwner.collection('instances').getList(1, 1, {
		filter: coOwner.filter('id = {:id}', { id: record.id })
	});
	assert.equal(list.totalItems, 1);
	await assert.rejects(coOwner.collection('instances').update(record.id, { hostname: 'should-not-save' }));
	await superuser.collection('instances').update(record.id, { status: 'completed', owners: [] });
	console.log('co-owner removed');
	await assert.rejects(coOwner.collection('instances').getOne(record.id));
	await superuser.collection('instances').update(record.id, { owners: [coOwnerId] });
	await coOwner.collection('instances').getOne(record.id);
	console.log('PASS: requester access, co-owner add/remove after request and after completion, and write protection');
} finally {
	if (record) await superuser.collection('instances').delete(record.id);
}
