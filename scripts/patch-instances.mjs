#!/usr/bin/env node
/**
 * Patch the `instances` collection:
 *  - Add `created` / `updated` autodate fields (PB does not auto-add
 *    these to collections created via the API).
 *  - Make sure `passion_group` is a relation to the `passion_group`
 *    collection.
 *
 * Idempotent — safe to re-run.
 */

import PocketBase from 'pocketbase';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadDotEnv(path) {
	if (!existsSync(path)) return;
	for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		let val = line.slice(eq + 1).trim();
		if (
			(val.startsWith('"') && val.endsWith('"')) ||
			(val.startsWith("'") && val.endsWith("'"))
		)
			val = val.slice(1, -1);
		if (!(key in process.env)) process.env[key] = val;
	}
}
loadDotEnv(resolve(ROOT, '.env'));

const REQUIRED = ['POCKETBASE_URL', 'PB_ADMIN_EMAIL', 'PB_ADMIN_PASSWORD'];
for (const k of REQUIRED) {
	if (!process.env[k]) {
		console.error(`Missing required env var: ${k}`);
		process.exit(1);
	}
}

const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);

await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);

const collection = await pb.collections.getOne('instances');
const pgCollection = await pb.collections.getOne('passion_group').catch(() => null);

const fields = [...collection.fields];
const hasCreated = fields.some((f) => f.name === 'created');
const hasUpdated = fields.some((f) => f.name === 'updated');
const hasAdminReply = fields.some((f) => f.name === 'admin_reply');
const hasAdminReplyAt = fields.some((f) => f.name === 'admin_reply_at');
const pgField = fields.find((f) => f.name === 'passion_group');

if (!hasCreated) {
	fields.push({
		name: 'created',
		type: 'autodate',
		onCreate: true,
		onUpdate: false
	});
	console.log('[add] created');
}
if (!hasUpdated) {
	fields.push({
		name: 'updated',
		type: 'autodate',
		onCreate: true,
		onUpdate: true
	});
	console.log('[add] updated');
}
if (!hasAdminReply) {
	fields.push({
		name: 'admin_reply',
		type: 'text',
		required: false,
		options: { max: 4096 }
	});
	console.log('[add] admin_reply');
}
if (!hasAdminReplyAt) {
	fields.push({
		name: 'admin_reply_at',
		type: 'date',
		required: false
	});
	console.log('[add] admin_reply_at');
}
const hasVmid = fields.some((f) => f.name === 'vmid');
const hasNode = fields.some((f) => f.name === 'node');

if (!hasVmid) {
	fields.push({
		name: 'vmid',
		type: 'number',
		required: false,
		options: { noDecimal: true }
	});
	console.log('[add] vmid');
}
if (!hasNode) {
	fields.push({
		name: 'node',
		type: 'text',
		required: false,
		options: { max: 128 }
	});
	console.log('[add] node');
}

if (pgField && pgField.type !== 'relation' && pgCollection) {
	pgField.type = 'relation';
	pgField.collectionId = pgCollection.id;
	pgField.cascadeDelete = false;
	pgField.maxSelect = 1;
	pgField.minSelect = 1;
	console.log('[fix] passion_group → relation');
}

await pb.collections.update(collection.id, { fields });
console.log('[ok] patched instances');
