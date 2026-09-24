#!/usr/bin/env node
// Idempotent live PocketBase schema update. Existing requests keep their creator.
import 'dotenv/config';
import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);
await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
const instances = await pb.collections.getOne('instances');
const users = await pb.collections.getOne('users');
const fields = [...instances.fields];
if (!fields.some((field) => field.name === 'owners')) {
	fields.push({ name: 'owners', type: 'relation', collectionId: users.id, cascadeDelete: false, minSelect: 0, maxSelect: 10, required: false });
}
await pb.collections.update(instances.id, {
	fields,
	listRule: '(email = @request.auth.id || owners.id ?= @request.auth.id || @request.auth.user_type.type = "admin")',
	viewRule: '(email = @request.auth.id || owners.id ?= @request.auth.id || @request.auth.user_type.type = "admin")',
	createRule: '@request.auth.id != "" && @request.auth.user_type != "" && @request.body.email = @request.auth.id',
	updateRule: '@request.auth.user_type.type = "admin"'
});
console.log('instances owners relation and access rules updated');
