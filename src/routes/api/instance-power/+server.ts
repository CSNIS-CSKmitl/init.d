import { json, error, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { proxmox } from '$lib/proxmox';
import type { LeaseInstance } from '$lib/types';
import { canAccessInstance } from '$lib/server/instance-owners';
import { resolveProxmoxGuest, ProxmoxGuestNotFoundError } from '$lib/server/proxmox-guest';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const instanceId = url.searchParams.get('instanceId');
	if (!instanceId) throw error(400, 'Missing instanceId');

	try {
		const record = await locals.pb.collection('instances').getOne<LeaseInstance>(instanceId);
		if (!canAccessInstance(record, locals.user.id, locals.user.role === 'admin')) {
			throw error(403, 'Forbidden');
		}

		const guest = await resolveProxmoxGuest(record);
		const target = (proxmox.nodes.$(guest.node) as any)[guest.type].$(record.vmid);
		const statusRes = await target.status.current.$get() as any;
		return json({ status: statusRes.status, node: guest.node }); // 'running' or 'stopped'
	} catch (e: any) {
		if (isHttpError(e)) throw e;
		if (e instanceof ProxmoxGuestNotFoundError) return json({ error: e.message }, { status: 404 });
		console.error('Failed to get instance power status:', e.message);
		return json({ error: e.message || 'Proxmox communication failed' }, { status: 502 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const { instanceId, action } = await request.json();
	if (!instanceId || !action) throw error(400, 'Missing params');
	if (action !== 'start' && action !== 'shutdown') throw error(400, 'Invalid action');

	try {
		const record = await locals.pb.collection('instances').getOne<LeaseInstance>(instanceId);
		if (!canAccessInstance(record, locals.user.id, locals.user.role === 'admin')) {
			throw error(403, 'Forbidden');
		}

		const guest = await resolveProxmoxGuest(record);
		const target = (proxmox.nodes.$(guest.node) as any)[guest.type].$(record.vmid);

		let upid: string;
		if (action === 'start') {
			upid = await target.status.start.$post() as string;
		} else {
			upid = await target.status.shutdown.$post() as string;
		}

		return json({ success: true, upid, node: guest.node });
	} catch (e: any) {
		if (isHttpError(e)) throw e;
		if (e instanceof ProxmoxGuestNotFoundError) return json({ error: e.message }, { status: 404 });
		console.error('Failed to trigger power action:', e.message);
		return json({ error: e.message || 'Proxmox action failed' }, { status: 502 });
	}
};
