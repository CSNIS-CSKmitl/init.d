import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { proxmox } from '$lib/proxmox';
import type { LeaseInstance } from '$lib/types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const instanceId = url.searchParams.get('instanceId');
	if (!instanceId) throw error(400, 'Missing instanceId');

	try {
		const record = await locals.pb.collection('instances').getOne<LeaseInstance>(instanceId);
		if (record.creator_email !== locals.user.email && locals.user.role !== 'admin') {
			throw error(403, 'Forbidden');
		}

		const vmid = record.vmid;
		const nodeNum = record.node;
		if (!vmid || !nodeNum) throw error(409, 'Not provisioned');

		const node = `pve${nodeNum}`;
		const typePath = record.type === 'vm' ? 'qemu' : 'lxc';

		const statusRes = await proxmox.nodes.$(node).$(typePath).$(vmid).status.current.$get() as any;
		return json({ status: statusRes.status }); // 'running' or 'stopped'
	} catch (e: any) {
		console.error('Failed to get instance power status', e);
		throw error(500, e.message || 'Proxmox communication failed');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const { instanceId, action } = await request.json();
	if (!instanceId || !action) throw error(400, 'Missing params');
	if (action !== 'start' && action !== 'shutdown') throw error(400, 'Invalid action');

	try {
		const record = await locals.pb.collection('instances').getOne<LeaseInstance>(instanceId);
		if (record.creator_email !== locals.user.email && locals.user.role !== 'admin') {
			throw error(403, 'Forbidden');
		}

		const vmid = record.vmid;
		const nodeNum = record.node;
		if (!vmid || !nodeNum) throw error(409, 'Not provisioned');

		const node = `pve${nodeNum}`;
		const typePath = record.type === 'vm' ? 'qemu' : 'lxc';

		let upid: string;
		if (action === 'start') {
			upid = await proxmox.nodes.$(node).$(typePath).$(vmid).status.start.$post() as string;
		} else {
			upid = await proxmox.nodes.$(node).$(typePath).$(vmid).status.shutdown.$post() as string;
		}

		return json({ success: true, upid });
	} catch (e: any) {
		console.error('Failed to trigger power action', e);
		throw error(500, e.message || 'Proxmox action failed');
	}
};
