import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { InstanceMetricPoint, InstanceMetrics, LeaseInstance } from '$lib/types';
import { proxmox } from '$lib/proxmox';
import { canAccessInstance } from '$lib/server/instance-owners';
import { resolveProxmoxGuest, ProxmoxGuestNotFoundError } from '$lib/server/proxmox-guest';

const timeframes = ['hour', 'day', 'week', 'month', 'year'] as const;

function numberOrNull(value: unknown): number | null {
	const number = Number(value);
	return value === null || value === undefined || !Number.isFinite(number) ? null : number;
}

function percentage(value: unknown): number | null {
	const number = numberOrNull(value);
	return number === null ? null : Math.max(0, number * 100);
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const instanceId = url.searchParams.get('instanceId');
	const timeframe = url.searchParams.get('timeframe') || 'hour';
	if (!instanceId) throw error(400, 'Missing instanceId');
	if (!timeframes.includes(timeframe as (typeof timeframes)[number])) throw error(400, 'Invalid timeframe');

	try {
		const record = await locals.pb.collection('instances').getOne<LeaseInstance>(instanceId);
		if (!canAccessInstance(record, locals.user.id, locals.user.role === 'admin')) throw error(403, 'Forbidden');
		if (record.status !== 'completed') throw error(409, 'Instance is not ready yet');

		const guest = await resolveProxmoxGuest(record);
		const target = (proxmox.nodes.$(guest.node) as any)[guest.type].$(record.vmid);
		const current = await target.status.current.$get() as Record<string, unknown>;
		let points: InstanceMetricPoint[] = [];
		let chartError: string | undefined;
		try {
			const raw = await target.rrddata.$get({ timeframe, cf: 'AVERAGE' }) as Record<string, unknown>[];
			points = (Array.isArray(raw) ? raw : []).slice(-200).flatMap((point) => {
				const time = numberOrNull(point.time);
				if (time === null) return [];
				return [{
					time,
					cpu: percentage(point.cpu),
					memory: numberOrNull(point.mem),
					netIn: numberOrNull(point.netin),
					netOut: numberOrNull(point.netout)
				}];
			});
		} catch (e) {
			console.error('Failed to get instance RRD data:', e);
			chartError = 'กราฟยังไม่พร้อมใช้งาน ลองรีเฟรชอีกครั้ง';
		}

		const result: InstanceMetrics = {
			status: String(current.status || guest.status || 'unknown'),
			qmpstatus: typeof current.qmpstatus === 'string' ? current.qmpstatus : null,
			node: guest.node,
			vmid: Number(record.vmid),
			current: {
				cpu: percentage(current.cpu),
				memory: numberOrNull(current.mem),
				maxMemory: numberOrNull(current.maxmem),
				disk: numberOrNull(current.disk),
				maxDisk: numberOrNull(current.maxdisk),
				cpus: numberOrNull(current.cpus),
				uptime: numberOrNull(current.uptime)
			},
			points,
			...(chartError ? { chartError } : {})
		};
		return json(result, { headers: { 'Cache-Control': 'no-store' } });
	} catch (e: unknown) {
		if (isHttpError(e)) throw e;
		if (e instanceof ProxmoxGuestNotFoundError) return json({ error: e.message }, { status: 404 });
		const message = e instanceof Error ? e.message : 'Proxmox communication failed';
		console.error('Failed to get instance metrics:', message);
		return json({ error: message }, { status: 502 });
	}
};
