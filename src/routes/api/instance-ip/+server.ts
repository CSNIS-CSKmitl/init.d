import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminPb, canAccessInstance } from '$lib/server/instance-owners';
import type { LeaseInstance } from '$lib/types';
import { resolveProxmoxGuest, ProxmoxGuestNotFoundError } from '$lib/server/proxmox-guest';
import { readProxmoxIp } from '$lib/server/proxmox-ip';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const instanceId = url.searchParams.get('instanceId');
	if (!instanceId) throw error(400, 'Missing instanceId');
	try {
		const record = await locals.pb.collection('instances').getOne<LeaseInstance>(instanceId);
		if (!canAccessInstance(record, locals.user.id, locals.user.role === 'admin')) throw error(403, 'Forbidden');
		if (record.status !== 'completed') throw error(409, 'Instance is not ready yet');
		const guest = await resolveProxmoxGuest(record);
		let observed: string | null = null;
		let available = true;
		try { observed = await readProxmoxIp(record, guest); }
		catch (guestError) {
			available = false;
			console.warn(`Unable to read IP for ${guest.type} ${record.vmid}:`, guestError instanceof Error ? guestError.message : guestError);
		}
		const previous = record.IP?.trim() || null;
		const changed = !!observed && observed !== previous;
		if (changed) {
			const pb = await adminPb();
			await pb.collection('instances').update(record.id, { IP: observed });
		}
		return json({ ip: observed ?? previous, observed, changed, available, source: guest.type === 'qemu' ? 'qemu-guest-agent' : 'lxc-interfaces' }, { headers: { 'Cache-Control': 'no-store' } });
	} catch (e: unknown) {
		if (isHttpError(e)) throw e;
		if (e instanceof ProxmoxGuestNotFoundError) return json({ error: e.message }, { status: 404 });
		const message = e instanceof Error ? e.message : 'Proxmox communication failed';
		console.error('Failed to get instance IP:', message);
		return json({ error: message }, { status: 502 });
	}
};
