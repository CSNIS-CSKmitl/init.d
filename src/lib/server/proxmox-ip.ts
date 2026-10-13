import { isIP } from 'node:net';
import { proxmox } from '$lib/proxmox';
import type { LeaseInstance } from '$lib/types';
import type { resolveProxmoxGuest } from './proxmox-guest';

type Guest = Awaited<ReturnType<typeof resolveProxmoxGuest>>;

function usableIpv4(value: unknown): string | null {
	const ip = typeof value === 'string' ? value.trim() : '';
	if (!ip || isIP(ip) !== 4 || ip.startsWith('127.') || ip.startsWith('169.254.')) return null;
	return ip;
}

function vmNetworkMac(config: Record<string, unknown>): string | null {
	return /(?:^|,)(?:virtio|e1000|e1000e|rtl8139|vmxnet3)=([0-9a-f:]+)/i.exec(String(config.net0 || ''))?.[1]?.toLowerCase() ?? null;
}

function qemuIp(response: any, mac: string | null): string | null {
	const interfaces = Array.isArray(response?.result) ? response.result : [];
	const addresses = (iface: any) => (Array.isArray(iface?.['ip-addresses']) ? iface['ip-addresses'] : [])
		.map((address: any) => usableIpv4(address?.['ip-address']))
		.filter((ip: string | null): ip is string => !!ip);
	const matching = interfaces.find((iface: any) => mac && String(iface?.['hardware-address'] || '').toLowerCase() === mac);
	return addresses(matching)[0] ?? interfaces.filter((iface: any) => iface?.name !== 'lo').flatMap(addresses)[0] ?? null;
}

function lxcIp(response: any): string | null {
	const interfaces = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : Array.isArray(response?.result) ? response.result : [];
	for (const iface of interfaces) {
		if (String(iface?.name || '') === 'lo') continue;
		const candidates = [iface?.inet, iface?.['ip-address'], iface?.address, ...(Array.isArray(iface?.['ip-addresses']) ? iface['ip-addresses'].map((a: any) => a?.['ip-address'] ?? a?.address) : [])];
		const ip = candidates.map(usableIpv4).find((value): value is string => !!value);
		if (ip) return ip;
	}
	return null;
}

export async function readProxmoxIp(record: LeaseInstance, guest: Guest): Promise<string | null> {
	const target = (proxmox.nodes.$(guest.node) as any)[guest.type].$(record.vmid);
	if (guest.type === 'qemu') {
		const config = await target.config.$get() as Record<string, unknown>;
		return qemuIp(await target.agent['network-get-interfaces'].$get(), vmNetworkMac(config));
	}
	return lxcIp(await target.interfaces.$get());
}
