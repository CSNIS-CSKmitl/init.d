#!/usr/bin/env node
import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://192.168.15.14:8080');
pb.autoCancellation(false);

console.log('Testing PocketBase push collections accessibility...');

// 1. Authenticate as admin
await pb.admins.authWithPassword(
	process.env.PB_ADMIN_EMAIL || 'log@cskmitl.com',
	process.env.PB_ADMIN_PASSWORD || 'log@cskmitl.com'
);
console.log('1. Admin authenticated successfully.');

// 2. Verify push_devices collection
const pushDevicesCol = await pb.collections.getOne('push_devices');
console.log('2. push_devices collection verified:', pushDevicesCol.id);

// 3. Verify push_notices collection
const pushNoticesCol = await pb.collections.getOne('push_notices');
console.log('3. push_notices collection verified:', pushNoticesCol.id);

// 4. Test creating a dummy push_notice record via Admin
const firstUser = await pb.collection('users').getFirstListItem('');
console.log('4. Found test user:', firstUser.email || firstUser.id);

const dummyNotice = await pb.collection('push_notices').create({
	user: firstUser.id,
	service: 'INSTANCES',
	record_id: 'test_record_123',
	title: 'Test VM Notification',
	previous_status: 'pending',
	status: 'running',
	delivered: false,
	attempts: 0
});
console.log('5. Created test push_notice:', dummyNotice.id);

// Clean up dummy notice
await pb.collection('push_notices').delete(dummyNotice.id);
console.log('6. Cleaned up test push_notice successfully.');

console.log('ALL PUSH NOTIFICATION BACKEND TESTS PASSED!');
