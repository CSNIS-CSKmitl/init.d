#!/usr/bin/env node
import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://192.168.15.14:8080');
pb.autoCancellation(false);
await pb.admins.authWithPassword(
	process.env.PB_ADMIN_EMAIL || 'log@cskmitl.com',
	process.env.PB_ADMIN_PASSWORD || 'log@cskmitl.com'
);

console.log('Connected to PocketBase as admin.');

const users = await pb.collections.getOne('users');

// Check and create push_devices collection
try {
	await pb.collections.getOne('push_devices');
	console.log('Collection push_devices already exists.');
} catch (e) {
	console.log('Creating push_devices collection...');
	await pb.collections.create({
		name: 'push_devices',
		type: 'base',
		listRule: null,
		viewRule: null,
		createRule: null,
		updateRule: null,
		deleteRule: null,
		fields: [
			{
				name: 'user',
				type: 'relation',
				collectionId: users.id,
				maxSelect: 1,
				required: true,
				cascadeDelete: true
			},
			{
				name: 'installation_id',
				type: 'text',
				required: true,
				max: 64
			},
			{
				name: 'fcm_target_id',
				type: 'text',
				required: true,
				max: 256,
				hidden: true
			},
			{
				name: 'created',
				type: 'autodate',
				onCreate: true,
				onUpdate: false
			},
			{
				name: 'updated',
				type: 'autodate',
				onCreate: true,
				onUpdate: true
			}
		],
		indexes: [
			'CREATE UNIQUE INDEX idx_push_devices_installation ON push_devices (installation_id)'
		]
	});
	console.log('Collection push_devices created successfully.');
}

// Check and create push_notices collection
try {
	await pb.collections.getOne('push_notices');
	console.log('Collection push_notices already exists.');
} catch (e) {
	console.log('Creating push_notices collection...');
	await pb.collections.create({
		name: 'push_notices',
		type: 'base',
		listRule: 'user = @request.auth.id',
		viewRule: 'user = @request.auth.id',
		createRule: null,
		updateRule: null,
		deleteRule: null,
		fields: [
			{
				name: 'user',
				type: 'relation',
				collectionId: users.id,
				maxSelect: 1,
				required: true,
				cascadeDelete: true
			},
			{
				name: 'service',
				type: 'text',
				required: true,
				max: 16
			},
			{
				name: 'record_id',
				type: 'text',
				required: true,
				max: 32
			},
			{
				name: 'title',
				type: 'text',
				required: true,
				max: 120
			},
			{
				name: 'previous_status',
				type: 'text',
				max: 60
			},
			{
				name: 'status',
				type: 'text',
				required: true,
				max: 60
			},
			{
				name: 'delivered',
				type: 'bool'
			},
			{
				name: 'attempts',
				type: 'number',
				min: 0
			},
			{
				name: 'created',
				type: 'autodate',
				onCreate: true,
				onUpdate: false
			},
			{
				name: 'updated',
				type: 'autodate',
				onCreate: true,
				onUpdate: true
			}
		],
		indexes: [
			'CREATE INDEX idx_push_notices_user_created ON push_notices (user, created DESC)'
		]
	});
	console.log('Collection push_notices created successfully.');
}

console.log('Setup finished.');
