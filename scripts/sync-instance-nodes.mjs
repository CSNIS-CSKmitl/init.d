#!/usr/bin/env node
// Reconcile PocketBase node assignments with Proxmox's current cluster inventory.
// Apply only unique matches with the same VMID and guest type.
import 'dotenv/config';
import PocketBase from 'pocketbase';
import { fetch, Agent } from 'undici';

const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);
await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);

const response = await fetch(
	`https://${process.env.PROXMOX_HOST}:${process.env.PROXMOX_PORT || 8006}/api2/json/cluster/resources?type=vm`,
	{
		headers: {
			Authorization: `PVEAPIToken=${process.env.PROXMOX_USER}!${process.env.PROXMOX_TOKEN}=${process.env.PROXMOX_TOKEN_SECRET}`
		},
		dispatcher: new Agent({ connect: { rejectUnauthorized: process.env.PROXMOX_SKIP_TLS_VERIFY !== 'true' } })
	}
);
if (!response.ok) throw new Error(`Proxmox inventory failed: HTTP ${response.status}`);
const inventory = (await response.json()).data;
const records = await pb.collection('instances').getFullList({ filter: 'vmid > 0', fields: 'id,type,node,vmid' });
let changed = 0;
let missing = 0;
for (const record of records) {
	const type = record.type === 'vm' ? 'qemu' : 'lxc';
	const matches = inventory.filter((guest) => Number(guest.vmid) === Number(record.vmid) && guest.type === type);
	if (matches.length !== 1) {
		console.log(`${matches.length === 0 ? 'MISSING' : 'AMBIGUOUS'} ${record.id} ${type}/${record.vmid}`);
		missing++;
		continue;
	}
	const actual = matches[0].node;
	const stored = /^\d+$/.test(String(record.node)) ? `pve${record.node}` : String(record.node);
	if (stored === actual) continue;
	console.log(`${process.argv.includes('--apply') ? 'UPDATE' : 'WOULD UPDATE'} ${record.id} ${type}/${record.vmid}: ${stored} -> ${actual}`);
	if (process.argv.includes('--apply')) {
		const node = /^pve\d+$/.test(actual) ? Number(actual.slice(3)) : actual;
		await pb.collection('instances').update(record.id, { node });
	}
	changed++;
}
console.log(`${process.argv.includes('--apply') ? 'Updated' : 'Would update'} ${changed}; missing or ambiguous ${missing}.`);
