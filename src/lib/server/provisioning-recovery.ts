import { isIP } from 'node:net';
import type PocketBase from 'pocketbase';
import type { LeaseInstance } from '../types';
import { timedOutTask } from './proxmox-tasks.mjs';

export interface MigrationSnapshot {
	taskStatus: { status?: string; exitstatus?: string };
	vmid: number;
	node: string;
	type: string;
	hostname: string;
	locked: boolean;
	template: boolean;
	cores: number;
	memoryMiB: number;
	disk: string;
	network: string;
	ipv4: string[];
}

export function verifiedMigrationPatch(item: LeaseInstance, snapshot: MigrationSnapshot) {
	const task = timedOutTask(item);
	if (item.type !== 'vm' || task?.type !== 'qmigrate') {
		return { reason: 'This task needs its remaining provisioning steps checked.' };
	}
	if (snapshot.taskStatus.status !== 'stopped' || snapshot.taskStatus.exitstatus !== 'OK') {
		return { reason: 'The Proxmox migration has not completed successfully.' };
	}
	const target = String(item.node ?? '').replace(/^pve/, '');
	if (!/^\d+$/.test(target) || snapshot.node !== `pve${Number(target)}` ||
		snapshot.vmid !== item.vmid || snapshot.type !== 'qemu' || snapshot.hostname !== item.hostname) {
		return { reason: 'The existing VM identity or destination does not match this request.' };
	}
	if (snapshot.locked || snapshot.template) return { reason: 'The existing VM is locked or is a template.' };
	if (!(item.specs.cpu > 0 && item.specs.ram > 0 && item.specs.disk > 0) ||
		snapshot.cores !== item.specs.cpu || snapshot.memoryMiB !== item.specs.ram * 1024) {
		return { reason: 'The existing VM CPU or memory does not match this request.' };
	}
	const size = /(?:^|,)size=([\d.]+)([KMGT])(?:,|$)/i.exec(snapshot.disk);
	const units: Record<string, number> = { K: 1 / (1024 * 1024), M: 1 / 1024, G: 1, T: 1024 };
	const diskGiB = size ? Number(size[1]) * units[size[2].toUpperCase()] : NaN;
	if (!Number.isFinite(diskGiB) || diskGiB < item.specs.disk) {
		return { reason: 'The existing VM disk is smaller than requested or its size cannot be verified.' };
	}
	// Matches the network applied by startProvisioning/createVM before migration.
	if (!/(?:^|,)bridge=vmbr1(?:,|$)/.test(snapshot.network) || !/(?:^|,)tag=15(?:,|$)/.test(snapshot.network)) {
		return { reason: 'The existing VM network does not match the provisioning configuration.' };
	}
	const addresses = snapshot.ipv4.filter(ip => isIP(ip) === 4 &&
		!ip.startsWith('127.') && !ip.startsWith('169.254.') && Number(ip.split('.')[0]) > 0 && Number(ip.split('.')[0]) < 224);
	const ip = addresses.includes(item.IP || '') ? item.IP : addresses[0];
	if (!ip) return { reason: 'Waiting for a valid IPv4 address from the VM network interface.' };
	return { patch: {
		status: 'completed' as const, provision_state: 'completed', provision_error: '',
		IP: ip, node: Number(target),
	} };
}

/** Only reconcile lease metadata. Never create, restart, migrate or stop a guest. */
export async function commitVerifiedRecovery(
	pb: PocketBase,
	item: LeaseInstance,
	patch: NonNullable<ReturnType<typeof verifiedMigrationPatch>['patch']>,
): Promise<{ completed: boolean; changed: boolean; record?: LeaseInstance }> {
	const collection = pb.collection('instances');
	const fresh = await collection.getOne<LeaseInstance>(item.id);
	if (fresh.status === 'completed') return { completed: true, changed: false, record: fresh };
	if (fresh.updated !== item.updated || fresh.status !== 'failed' ||
		fresh.provision_error !== item.provision_error || fresh.vmid !== item.vmid) {
		return { completed: false, changed: false };
	}
	try { await collection.update(item.id, patch); }
	catch { /* A response can fail after committing; verify before deciding the result. */ }
	const saved = await collection.getOne<LeaseInstance>(item.id);
	const completed = saved.status === patch.status && saved.provision_state === patch.provision_state &&
		saved.provision_error === '' && saved.IP === patch.IP && saved.node === patch.node;
	return { completed, changed: completed, record: saved };
}
