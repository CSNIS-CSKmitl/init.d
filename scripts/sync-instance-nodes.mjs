#!/usr/bin/env node
// Keep PocketBase's node field aligned with Proxmox after VM/CT migrations.
// Only a unique match on (guest type, VMID/CTID) can update a record.
import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import PocketBase from 'pocketbase';
import { fetch, Agent } from 'undici';

/** @typedef {{ id: string, type: string, vmid: number, node: number | string }} Instance */
/** @typedef {{ type: string, vmid: number, node: string }} Guest */
/** @typedef {{ id: string, type: 'qemu' | 'lxc', vmid: number, from: string, to: string, node: number }} NodeUpdate */

/** @param {Instance[]} records @param {Guest[]} guests */
export function planNodeUpdates(records, guests) {
	/** @type {Map<string, Guest[]>} */
	const guestsById = new Map();
	for (const guest of guests) {
		if (!['qemu', 'lxc'].includes(guest.type) || !Number.isSafeInteger(Number(guest.vmid))) continue;
		const key = `${guest.type}/${Number(guest.vmid)}`;
		guestsById.set(key, [...(guestsById.get(key) ?? []), guest]);
	}
	/** @type {Map<string, number>} */
	const recordCounts = new Map();
	for (const record of records) {
		const type = record.type === 'vm' ? 'qemu' : record.type === 'container' ? 'lxc' : null;
		if (!type || !Number.isSafeInteger(Number(record.vmid)) || Number(record.vmid) <= 0) continue;
		const key = `${type}/${Number(record.vmid)}`;
		recordCounts.set(key, (recordCounts.get(key) ?? 0) + 1);
	}
	/** @type {NodeUpdate[]} */
	const updates = [];
	/** @type {string[]} */
	const skipped = [];
	for (const record of records) {
		const type = record.type === 'vm' ? 'qemu' : record.type === 'container' ? 'lxc' : null;
		if (!type || !Number.isSafeInteger(Number(record.vmid)) || Number(record.vmid) <= 0) continue;
		const key = `${type}/${Number(record.vmid)}`;
		const matches = guestsById.get(key) ?? [];
		if (recordCounts.get(key) !== 1 || matches.length !== 1) {
			skipped.push(`${record.id} ${key}: ${recordCounts.get(key) !== 1 ? 'duplicate database ID' : matches.length ? 'ambiguous Proxmox match' : 'missing from Proxmox'}`);
			continue;
		}
		const actual = matches[0].node;
		const node = /^pve\d+$/.test(actual) ? Number(actual.slice(3)) : NaN;
		if (!Number.isSafeInteger(node) || node <= 0) {
			skipped.push(`${record.id} ${key}: unsupported node ${actual}`);
			continue;
		}
		const stored = /^\d+$/.test(String(record.node)) ? `pve${record.node}` : String(record.node);
		const storedNode = /^pve\d+$/.test(stored) ? Number(stored.slice(3)) : NaN;
		if (storedNode !== node) {
			updates.push({ id: record.id, type, vmid: Number(record.vmid), from: stored, to: actual, node });
		}
	}
	return { updates, skipped };
}

/** @param {NodeJS.ProcessEnv} config @param {{ apply?: boolean, log?: (message: string) => void }} options */
export async function syncInstanceNodes(config = process.env, options = {}) {
	const { apply = false, log = console.log } = options;
	for (const name of ['POCKETBASE_URL', 'PB_ADMIN_EMAIL', 'PB_ADMIN_PASSWORD', 'PROXMOX_HOST', 'PROXMOX_USER', 'PROXMOX_TOKEN', 'PROXMOX_TOKEN_SECRET']) {
		if (!config[name]) throw new Error(`Missing ${name} for node synchronization.`);
	}
	const agent = new Agent({ connect: { rejectUnauthorized: config.PROXMOX_SKIP_TLS_VERIFY !== 'true' } });
	try {
		const pb = new PocketBase(config.POCKETBASE_URL);
		pb.autoCancellation(false);
		const response = await fetch(
			`https://${config.PROXMOX_HOST}:${config.PROXMOX_PORT || 8006}/api2/json/cluster/resources?type=vm`,
			{
				headers: { Authorization: `PVEAPIToken=${config.PROXMOX_USER}!${config.PROXMOX_TOKEN}=${config.PROXMOX_TOKEN_SECRET}` },
				dispatcher: agent
			}
		);
		if (!response.ok) throw new Error(`Proxmox inventory failed: HTTP ${response.status}`);
		const body = /** @type {{ data?: Guest[] }} */ (await response.json());
		if (!Array.isArray(body.data)) throw new Error('Proxmox inventory response is invalid.');
		await pb.admins.authWithPassword(config.PB_ADMIN_EMAIL ?? '', config.PB_ADMIN_PASSWORD ?? '');
		const records = /** @type {Instance[]} */ (await pb.collection('instances').getFullList({
			filter: 'vmid > 0', fields: 'id,type,node,vmid'
		}));
		const plan = planNodeUpdates(records, body.data);
		if (apply) {
			for (const update of plan.updates) {
				await pb.collection('instances').update(update.id, { node: update.node });
				log(`UPDATED ${update.id} ${update.type}/${update.vmid}: ${update.from} -> ${update.to}`);
			}
		} else {
			for (const update of plan.updates) log(`WOULD UPDATE ${update.id} ${update.type}/${update.vmid}: ${update.from} -> ${update.to}`);
		}
		return { ...plan, applied: apply ? plan.updates.length : 0 };
	} finally {
		await agent.close();
	}
}

/** @param {{ config?: NodeJS.ProcessEnv, intervalSeconds?: number, log?: (message: string) => void }} options */
export function startNodeSync(options = {}) {
	const { config = process.env, log = console.log } = options;
	const intervalSeconds = Number(options.intervalSeconds ?? config.NODE_SYNC_INTERVAL_SECONDS ?? 60);
	if (!Number.isInteger(intervalSeconds) || intervalSeconds < 30 || intervalSeconds > 3600) {
		throw new Error('NODE_SYNC_INTERVAL_SECONDS must be 30–3600.');
	}
	let running = false;
	let stopped = false;
	let lastSkipped = '';
	const tick = async () => {
		if (running || stopped) return;
		running = true;
		try {
			const result = await syncInstanceNodes(config, { apply: true, log });
			const skipped = result.skipped.join('\n');
			if (skipped !== lastSkipped) {
				for (const item of result.skipped) log(`SKIPPED ${item}`);
				lastSkipped = skipped;
			}
		} catch (error) {
			console.error('[Node Sync]', error instanceof Error ? error.message : error);
		} finally {
			running = false;
		}
	};
	log(`Node synchronization active (every ${intervalSeconds}s).`);
	void tick();
	const timer = setInterval(() => void tick(), intervalSeconds * 1000);
	return () => { stopped = true; clearInterval(timer); };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const watch = process.argv.includes('--watch');
	const apply = process.argv.includes('--apply');
	if (watch && !apply) throw new Error('Use --watch --apply to synchronize automatically.');
	if (watch) startNodeSync();
	else {
		const result = await syncInstanceNodes(process.env, { apply });
		for (const item of result.skipped) console.log(`SKIPPED ${item}`);
		console.log(`${apply ? 'Updated' : 'Would update'} ${apply ? result.applied : result.updates.length}; skipped ${result.skipped.length}.`);
	}
}
