import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getProxmoxVncTicket } from '$lib/proxmox';
import type { LeaseInstance } from '$lib/types';

export const POST: RequestHandler = async ({ request, locals }) => {
	// 1. Verify user is logged in
	if (!locals.user) {
		return json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
	}

	// 2. Receive the instanceId from the Client request
	let instanceId: string;
	try {
		const payload = await request.json();
		instanceId = String(payload?.instanceId || '').trim();
	} catch {
		return json({ error: 'Invalid JSON request body.' }, { status: 400 });
	}

	if (!instanceId) {
		return json({ error: 'Missing instanceId parameter.' }, { status: 400 });
	}

	try {
		// 3. Query the PocketBase instances collection to verify ownership
		const record = await locals.pb.collection('instances').getOne<LeaseInstance>(instanceId);
		if (!record) {
			return json({ error: 'Instance not found.' }, { status: 404 });
		}

		// Owner check: creator_email matches currently authenticated user's email (admins bypass)
		if (record.creator_email !== locals.user.email && locals.user.role !== 'admin') {
			return json({ error: 'Forbidden. You do not own this instance.' }, { status: 403 });
		}

		// 4. Extract vmid, node, and type
		const { vmid, node, type, hostname } = record;
		if (!vmid || !node) {
			return json(
				{ error: 'Instance is not fully provisioned yet (missing vmid or node assignment).' },
				{ status: 409 }
			);
		}

		// 5. Map the 'type' value appropriately
		// 'container' maps to 'lxc' and 'vm' maps to 'qemu' in the Proxmox API path
		const typePath = type === 'container' ? 'lxc' : 'qemu';
		const consoleType = type === 'container' ? 'lxc' : 'kvm';

		// Act as a secure proxy and make authenticated POST request to Proxmox API
		const host = env.PROXMOX_HOST;
		const port = env.PROXMOX_PORT || '8006';
		const user = env.PROXMOX_USER;
		const token = env.PROXMOX_TOKEN;
		const secret = env.PROXMOX_TOKEN_SECRET;
		const skipTls = env.PROXMOX_SKIP_TLS_VERIFY === 'true';

		if (!host || !user || !token || !secret) {
			return json(
				{ error: 'Proxmox integration credentials are not configured on the server.' },
				{ status: 500 }
			);
		}

		// Call Proxmox API vncproxy endpoint
		const ticketResponse = await getProxmoxVncTicket({
			host,
			port,
			user,
			token,
			secret,
			node,
			typePath,
			vmid,
			skipTls
		});

		// 6. Return the full Proxmox console URL containing the generated ticket parameters
		const consoleUrl = `https://${host}:${port}/?console=${consoleType}&xtermjs=1&vmid=${vmid}&vmname=${encodeURIComponent(hostname)}&node=${node}&vncticket=${encodeURIComponent(ticketResponse.ticket)}&port=${ticketResponse.port}&path=api2/json/nodes/${node}/${typePath}/${vmid}/vncwebsocket/port/${ticketResponse.port}/vncticket/${encodeURIComponent(ticketResponse.ticket)}`;

		return json({
			success: true,
			url: consoleUrl,
			ticket: ticketResponse.ticket,
			port: ticketResponse.port,
			vmid,
			node
		});

	} catch (e: any) {
		console.error('[API Console Error]:', e);
		
		// PocketBase getOne throws 404 if record doesn't exist
		if (e.status === 404) {
			return json({ error: 'Instance not found in database.' }, { status: 404 });
		}
		
		return json(
			{ error: e.message || 'Failed to communicate with Proxmox hypervisor.' },
			{ status: 500 }
		);
	}
};
