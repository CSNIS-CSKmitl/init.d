import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { provisioningProgress } from '$lib/proxmox';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Access denine.');
	}

	const progressObj = Object.fromEntries(provisioningProgress.entries());
	return json(progressObj);
};
