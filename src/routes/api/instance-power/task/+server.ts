import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { proxmox } from '$lib/proxmox';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const node = url.searchParams.get('node');
	const upid = url.searchParams.get('upid');
	if (!node || !upid) throw error(400, 'Missing params');

	try {
		const statusObj = await proxmox.nodes.$(node).tasks.$(upid).status.$get() as any;
		return json({
			status: statusObj.status, // 'running' or 'stopped'
			exitstatus: statusObj.exitstatus // 'OK' or error message
		});
	} catch (e: any) {
		console.error('Failed to get task status', e);
		throw error(500, e.message || 'Proxmox task check failed');
	}
};
