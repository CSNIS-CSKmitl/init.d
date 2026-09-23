import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { proxmox } from '$lib/proxmox';
import { findPowerTask } from '$lib/server/power-tasks';
import type { LeaseInstance } from '$lib/types';
import { canAccessInstance } from '$lib/server/instance-owners';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const instanceId = url.searchParams.get('instanceId');
	const upid = url.searchParams.get('upid');
	if (!instanceId || !upid) throw error(400, 'Missing params');
	const task = findPowerTask(upid, instanceId, locals.user.id);
	if (!task) throw error(404, 'Power task is no longer available. Refresh the instance status.');
	const record = await locals.pb.collection('instances').getOne<LeaseInstance>(instanceId).catch(() => null);
	if (!record || !canAccessInstance(record, locals.user.id, locals.user.role === 'admin')) {
		throw error(403, 'Forbidden');
	}

	try {
		const statusObj = await proxmox.nodes.$(task.node).tasks.$(upid).status.$get() as any;
		return json({
			status: statusObj.status, // 'running' or 'stopped'
			exitstatus: statusObj.exitstatus // 'OK' or error message
		});
	} catch (e: any) {
		console.error('Failed to get task status', e);
		throw error(500, e.message || 'Proxmox task check failed');
	}
};
