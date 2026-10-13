import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { provisioningProgress, getTimedOutTaskProgress } from '$lib/proxmox';
import { adminPb } from '$lib/server/instance-owners';
import type { LeaseInstance } from '$lib/types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Access denine.');
	}

	const progressObj = Object.fromEntries(provisioningProgress.entries());
	const pb = await adminPb();
	const records = await pb.collection('instances').getFullList<LeaseInstance>({
		filter: 'status = "failed" && provision_error ~ "Timed out waiting for task UPID:"',
		fields: 'id,status,type,vmid,provision_error',
	});
	for (const record of records) {
		const progress = await getTimedOutTaskProgress(record);
		if (progress) progressObj[record.id] = progress;
	}
	return json(progressObj);
};
