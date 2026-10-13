import { adminPb } from './instance-owners';
import { resolveProxmoxGuest } from './proxmox-guest';
import { readProxmoxIp } from './proxmox-ip';
import type { LeaseInstance } from '$lib/types';

let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;

async function refreshAll() {
	try {
		const pb = await adminPb();
		const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
		const expiredLogs = await pb.collection('instance_access_logs').getFullList<{ id: string }>({ filter: `created < "${cutoff}"` });
		for (const log of expiredLogs) await pb.collection('instance_access_logs').delete(log.id);
		try {
			const expiredServiceLogs = await pb.collection('service_access_logs').getFullList<{ id: string }>({ filter: `created < "${cutoff}"` });
			for (const log of expiredServiceLogs) await pb.collection('service_access_logs').delete(log.id);
		} catch (error) {
			// Older installations may not have the shared collection until migration runs.
			console.warn('[Nightly IP refresh] Shared service log cleanup skipped:', error instanceof Error ? error.message : error);
		}
		const records = await pb.collection('instances').getFullList<LeaseInstance>({ filter: 'status = "completed" && vmid > 0' });
		for (const record of records) {
			try {
				const guest = await resolveProxmoxGuest(record);
				const ip = await readProxmoxIp(record, guest);
				if (ip && ip !== (record.IP || '').trim()) {
					await pb.collection('instances').update(record.id, { IP: ip });
					console.log(`[Nightly IP refresh] Updated ${record.hostname} (${record.vmid}) to ${ip}.`);
				}
			} catch (error) {
				console.warn(`[Nightly IP refresh] Skipped ${record.hostname} (${record.vmid}):`, error instanceof Error ? error.message : error);
			}
		}
	} catch (error) {
		console.warn('[Nightly IP refresh] Could not read instances:', error instanceof Error ? error.message : error);
	}
}

export function startNightlyIpRefresh() {
	if (started) return;
	started = true;
	const next = new Date();
	next.setHours(24, 0, 0, 0);
	timer = setTimeout(() => {
		void refreshAll();
		timer = setInterval(() => { void refreshAll(); }, 24 * 60 * 60 * 1000) as unknown as ReturnType<typeof setTimeout>;
	}, Math.max(60_000, next.getTime() - Date.now()));
	timer.unref?.();
}
