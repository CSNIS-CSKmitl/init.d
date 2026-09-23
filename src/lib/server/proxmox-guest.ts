import { env } from '$env/dynamic/private';
import { fetch, Agent } from 'undici';
import type { LeaseInstance } from '$lib/types';

type Guest = { vmid: number; type: 'qemu' | 'lxc'; node: string; status?: string };
export class ProxmoxGuestNotFoundError extends Error {}
let cached: { until: number; guests: Guest[] } | null = null;
let pending: Promise<Guest[]> | null = null;

async function inventory(): Promise<Guest[]> {
	if (cached && cached.until > Date.now()) return cached.guests;
	if (!pending) {
		pending = (async () => {
			const response = await fetch(
				`https://${env.PROXMOX_HOST}:${env.PROXMOX_PORT || '8006'}/api2/json/cluster/resources?type=vm`,
				{
					headers: {
						Authorization: `PVEAPIToken=${env.PROXMOX_USER}!${env.PROXMOX_TOKEN}=${env.PROXMOX_TOKEN_SECRET}`
					},
					dispatcher: env.PROXMOX_SKIP_TLS_VERIFY === 'true'
						? new Agent({ connect: { rejectUnauthorized: false } })
						: undefined
				}
			);
			if (!response.ok) throw new Error(`Proxmox inventory failed (HTTP ${response.status}).`);
			const data = (await response.json()) as { data: Guest[] };
			cached = { until: Date.now() + 5000, guests: data.data };
			return data.data;
		})();
	}
	try {
		return await pending;
	} finally {
		pending = null;
	}
}

export async function resolveProxmoxGuest(record: LeaseInstance): Promise<Guest> {
	if (!record.vmid) throw new ProxmoxGuestNotFoundError('Instance is not provisioned yet (missing VMID).');
	const expected = record.type === 'vm' ? 'qemu' : 'lxc';
	const matches = (await inventory()).filter((guest) => Number(guest.vmid) === Number(record.vmid));
	const match = matches.find((guest) => guest.type === expected);
	if (!match) {
		const label = expected === 'qemu' ? 'VM' : 'CT';
		const otherType = matches.length ? ` Proxmox lists VMID ${record.vmid} as ${matches[0].type}.` : '';
		throw new ProxmoxGuestNotFoundError(`${label} ${record.vmid} is not present in Proxmox.${otherType} Ask an admin to check the instance record.`);
	}
	return match;
}
