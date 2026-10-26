import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProxmoxClusterNodes, getProxmoxNodeStorage } from '$lib/proxmox';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user || locals.user.role !== 'admin') {
		throw error(403, 'Admin access required.');
	}

	const nodeParam = url.searchParams.get('node');
	const typeParam = url.searchParams.get('type');
	const actionParam = url.searchParams.get('action');

	try {
		// If explicitly asking for nodes or node param is omitted, return cluster nodes
		if (actionParam === 'nodes' || !nodeParam) {
			const nodes = await getProxmoxClusterNodes();
			return json({ nodes });
		}

		// Otherwise fetch storage info for the specified node
		const result = await getProxmoxNodeStorage(nodeParam);

		// If a specific storage type is requested, filter the storages
		if (typeParam) {
			const filtered = result.storages.filter(
				(s) => s.type.toLowerCase() === typeParam.trim().toLowerCase()
			);
			return json({
				...result,
				selectedType: typeParam.trim(),
				storages: filtered
			});
		}

		return json(result);
	} catch (e: any) {
		console.error('Proxmox storage API error:', e?.message || e);
		return json(
			{ error: e?.message || 'Failed to fetch Proxmox storage information' },
			{ status: 502 }
		);
	}
};
