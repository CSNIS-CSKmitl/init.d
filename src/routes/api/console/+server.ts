import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getProxmoxTermTicket } from '$lib/proxmox';
import type { LeaseInstance } from '$lib/types';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
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
		const { vmid, type, hostname } = record;
		// DB stores node as a bare number (e.g. "3"); Proxmox expects "pve3"
		const node = /^\d+$/.test(String(record.node ?? ''))
			? `pve${record.node}`
			: String(record.node ?? '');
		if (!vmid || !node) {
			return json(
				{ error: 'Instance is not fully provisioned yet (missing vmid or node assignment).' },
				{ status: 409 }
			);
		}

		// 5. Map the 'type' value (case-insensitive and supports lxc/ct/container)
		const typeLower = String(type || '').trim().toLowerCase();
		const typePath = (typeLower === 'container' || typeLower === 'lxc' || typeLower === 'ct') ? 'lxc' : 'qemu';
		console.log('[API Console Debug] ID:', instanceId, 'vmid:', vmid, 'node:', node, 'db type:', type, 'typeLower:', typeLower, 'typePath:', typePath);

		// Read Proxmox credentials from environment
		const host = env.PROXMOX_HOST;
		const port = env.PROXMOX_PORT || '8006';
		const user = env.PROXMOX_USER;
		const token = env.PROXMOX_TOKEN;
		const secret = env.PROXMOX_TOKEN_SECRET;
		const password = env.PROXMOX_PASSWORD;
		const skipTls = env.PROXMOX_SKIP_TLS_VERIFY === 'true';

		if (!host || !user) {
			return json(
				{ error: 'Proxmox integration credentials are not configured on the server.' },
				{ status: 500 }
			);
		}

		// 6. Call Proxmox termproxy to get a PTY ticket (xterm.js compatible)
		const ticketResponse = await getProxmoxTermTicket({
			host,
			port,
			user,
			token,
			secret,
			password,
			node,
			typePath,
			vmid,
			skipTls
		});

		// 8. Build WebSocket URL routed through the Vite /proxmox-ws proxy.
		//    Proxmox uses /vncwebsocket for BOTH vncproxy and termproxy tickets.
		//    The ticket type determines what protocol the server uses (RFB vs PTY).
		let wsUrl: string;
		if (ticketResponse.pveAuthCookie) {
			cookies.set('PVEAuthCookie', ticketResponse.pveAuthCookie, {
				path: '/',
				secure: true,
				httpOnly: true,
				sameSite: 'lax',
				encode: (val) => val
			});
			wsUrl = `/proxmox-ws/cookie/${encodeURIComponent(ticketResponse.pveAuthCookie)}/api2/json/nodes/${node}/${typePath}/${vmid}/vncwebsocket?port=${ticketResponse.port}&vncticket=${encodeURIComponent(ticketResponse.ticket)}`;
		} else {
			wsUrl = `/proxmox-ws/api2/json/nodes/${node}/${typePath}/${vmid}/vncwebsocket?port=${ticketResponse.port}&vncticket=${encodeURIComponent(ticketResponse.ticket)}`;
		}

		return json({
			success: true,
			wsUrl,
			ticket: ticketResponse.ticket,
			port: ticketResponse.port,
			vmid,
			node,
			hostname,
			user: ticketResponse.user,
			pveAuthCookie: ticketResponse.pveAuthCookie
		});

	} catch (e: any) {
		console.error('[API Console Error]:', e);

		if (e.status === 404) {
			return json({ error: 'Instance not found in database.' }, { status: 404 });
		}

		return json(
			{ error: e.message || 'Failed to communicate with Proxmox hypervisor.' },
			{ status: 500 }
		);
	}
};
