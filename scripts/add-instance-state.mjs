#!/usr/bin/env node
// Idempotent upgrade of the existing schema. Dry run unless --apply is supplied.
import 'dotenv/config';
import PocketBase from 'pocketbase';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { instanceStateFields } from './instance-state-schema.mjs';

const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);
for (const key of ['POCKETBASE_URL', 'PB_ADMIN_EMAIL', 'PB_ADMIN_PASSWORD']) {
	if (!process.env[key]) throw new Error(`Missing ${key}`);
}
try {
	await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
} catch {
	await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
}
const collection = await pb.collections.getOne('instances');
const fields = instanceStateFields(collection.fields);
if (JSON.stringify(fields) === JSON.stringify(collection.fields)) {
	console.log('Instance state schema is already up to date.');
	process.exit(0);
}
console.log('Schema changes:', fields.filter(field => JSON.stringify(field) !== JSON.stringify(collection.fields.find(old => old.name === field.name))).map(field => field.name).join(', '));
if (!process.argv.includes('--apply')) {
	console.log('Dry run only. Pass --apply to update PocketBase.');
	process.exit(0);
}
const directory = resolve('.data');
mkdirSync(directory, { recursive: true });
const backup = resolve(directory, `instances-state-schema-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(backup, JSON.stringify(collection, null, 2), { flag: 'wx' });
await pb.collections.update(collection.id, { fields });
const saved = await pb.collections.getOne(collection.id);
for (const name of ['status', 'provision_state', 'provision_error', 'IP', 'vmid', 'node', 'datedelete']) {
	if (!saved.fields.some(field => field.name === name)) throw new Error(`Schema verification failed: ${name}`);
}
for (const state of ['failed', 'deleted']) {
	if (!saved.fields.find(field => field.name === 'status').values.includes(state)) throw new Error(`State ${state} was not saved.`);
}
console.log('Instance state schema updated and verified. Backup:', backup);
