import { json, error, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { proxmox } from '$lib/proxmox';
import type { LeaseInstance } from '$lib/types';
import { canAccessInstance } from '$lib/server/instance-owners';
import { resolveProxmoxGuest, ProxmoxGuestNotFoundError } from '$lib/server/proxmox-guest';
import { rememberPowerTask } from '$lib/server/power-tasks';

const actions = ['start', 'shutdown', 'reboot', 'stop', 'reset', 'suspend', 'resume', 'hibernate'] as const;
type PowerAction = (typeof actions)[number];

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const instanceId = url.searchParams.get('instanceId');
	if (!instanceId) throw error(400, 'Missing instanceId');

	try {
		const record = await locals.pb.collection('instances').getOne<LeaseInstance>(instanceId);
		if (!canAccessInstance(record, locals.user.id, locals.user.role === 'admin')) {
			throw error(403, 'Forbidden');
		}
		if (record.status !== 'completed') throw error(409, 'Instance is not ready yet');

		const guest = await resolveProxmoxGuest(record);
		const target = (proxmox.nodes.$(guest.node) as any)[guest.type].$(record.vmid);
		const statusRes = await target.status.current.$get() as any;
		return json({ status: statusRes.status, qmpstatus: statusRes.qmpstatus ?? null, node: guest.node });
	} catch (e: any) {
		if (isHttpError(e)) throw e;
		if (e instanceof ProxmoxGuestNotFoundError) return json({ error: e.message }, { status: 404 });
		console.error('Failed to get instance power status:', e.message);
		return json({ error: e.message || 'Proxmox communication failed' }, { status: 502 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	let body: { instanceId?: string; action?: string };
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Invalid JSON');
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Invalid JSON body');
	const { instanceId, action } = body;
	if (!instanceId || !action) throw error(400, 'Missing params');
	if (!actions.includes(action as PowerAction)) throw error(400, 'Invalid action');

	try {
		const record = await locals.pb.collection('instances').getOne<LeaseInstance>(instanceId);
		if (!canAccessInstance(record, locals.user.id, locals.user.role === 'admin')) {
			throw error(403, 'Forbidden');
		}
		if (record.status !== 'completed') throw error(409, 'Instance is not ready yet');

		const guest = await resolveProxmoxGuest(record);
		const target = (proxmox.nodes.$(guest.node) as any)[guest.type].$(record.vmid);
		if (action === 'reset' && guest.type !== 'qemu') throw error(400, 'Reset is only available for VMs');
		if ((action === 'suspend' || action === 'resume' || action === 'hibernate') && guest.type !== 'qemu') {
			throw error(400, 'Pause, resume and hibernate are only available for VMs');
		}
		const current = await target.status.current.$get() as { status: string; qmpstatus?: string };
		const running = current.status === 'running';
		const paused = guest.type === 'qemu' && current.qmpstatus === 'paused';
		if (action === 'start' && current.status !== 'stopped') throw error(409, 'Instance is already running');
		if (action === 'resume' && !paused) throw error(409, 'VM is not paused');
		if (action !== 'start' && action !== 'resume' && (!running || paused)) {
			throw error(409, paused ? 'Resume the VM first' : 'Instance is not running');
		}

		const upid = action === 'hibernate'
			? await target.status.suspend.$post({ todisk: true }) as string
			: await target.status[action].$post() as string;
		rememberPowerTask(upid, instanceId, locals.user.id, guest.node);

		return json({ success: true, upid, node: guest.node });
	} catch (e: any) {
		if (isHttpError(e)) throw e;
		if (e instanceof ProxmoxGuestNotFoundError) return json({ error: e.message }, { status: 404 });
		console.error('Failed to trigger power action:', e.message);
		return json({ error: e.message || 'Proxmox action failed' }, { status: 502 });
	}
};
