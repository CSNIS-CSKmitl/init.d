#!/usr/bin/env node
// One-time PocketBase rule hardening. Dry run by default; --apply updates rules.
import 'dotenv/config';
import PocketBase from 'pocketbase';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const apply = process.argv.includes('--apply');
const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);
await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);

const users = await pb.collections.getOne('users');
const instances = await pb.collections.getOne('instances');
const original = {
	users: { listRule: users.listRule, viewRule: users.viewRule, createRule: users.createRule, updateRule: users.updateRule },
	instances: { createRule: instances.createRule }
};
const expected = {
	users: {
		listRule: '@request.auth.id != "" && (id = @request.auth.id || user_type.type = "teachers" || @request.auth.collectionName = "_superusers" || @request.auth.user_type.type = "admin" || @request.auth.user_type.type = "superadmin")',
		viewRule: '@request.auth.id = id || user_type.type = "teachers" || @request.auth.collectionName = "_superusers" || @request.auth.user_type.type = "admin" || @request.auth.user_type.type = "superadmin"',
		createRule: '@request.body.username = ""',
		updateRule: '@request.auth.id = id || @request.auth.collectionName = "_superusers"'
	},
	instances: { createRule: '@request.auth.id != "" && @request.body.email = @request.auth.id' }
};
const prior = {
	listRule: '@request.auth.id != "" && (id = @request.auth.id || user_type.type = "teachers" || @request.auth.collectionName = "_superusers" || @request.auth.user_type.type = "admin")',
	viewRule: '@request.auth.id = id || user_type.type = "teachers" || @request.auth.collectionName = "_superusers" || @request.auth.user_type.type = "admin"'
};
const strict = {
	listRule: '@request.auth.id != "" && (id = @request.auth.id || @request.auth.user_type.type = "admin")',
	viewRule: '@request.auth.id = id || @request.auth.user_type.type = "admin"'
};
const hardened = {
	users: {
		listRule: expected.users.listRule,
		viewRule: '@request.auth.id != "" && (' + expected.users.viewRule + ')',
		createRule: '@request.context = "oauth2" && @request.body.username = "" && @request.body.user_type:isset = false',
		updateRule: '@request.auth.id = id && @request.body.user_type:isset = false'
	},
	// The portal creates requests through its server-side superuser client.
	// Direct client creates could forge status, VMID, IP, and other server-owned fields.
	instances: { createRule: null }
};

for (const collection of ['users', 'instances']) {
	for (const field of Object.keys(hardened[collection])) {
		const allowed = [expected[collection][field], hardened[collection][field]];
		if (collection === 'users' && field in prior) allowed.push(prior[field], strict[field]);
		if (!allowed.includes(original[collection][field])) {
			throw new Error(`${collection}.${field} differs from the reviewed rule; inspect it manually before applying.`);
		}
	}
}
const pending = ['users', 'instances'].filter((name) =>
	Object.keys(hardened[name]).some((field) => original[name][field] !== hardened[name][field])
);
if (!pending.length) {
	console.log('PocketBase rules already hardened.');
	process.exit(0);
}
console.log(`Rules to update: ${pending.join(', ')}`);
if (!apply) {
	console.log('Dry run only. Pass --apply to update PocketBase.');
	process.exit(0);
}

const backup = resolve('.data', `pocketbase-rules-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
mkdirSync(dirname(backup), { recursive: true });
writeFileSync(backup, JSON.stringify(original, null, 2), { mode: 0o600, flag: 'wx' });
if (pending.includes('users')) await pb.collections.update(users.id, hardened.users);
if (pending.includes('instances')) await pb.collections.update(instances.id, hardened.instances);
for (const [name, id] of [['users', users.id], ['instances', instances.id]]) {
	const current = await pb.collections.getOne(id);
	for (const [field, rule] of Object.entries(hardened[name])) {
		if (current[field] !== rule) throw new Error(`Failed to verify ${name}.${field}`);
	}
}
console.log(`PocketBase rules hardened and verified. Backup: ${backup}`);
