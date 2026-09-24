import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { getProxmoxTermTicket, getProxmoxVncTicket } from '$lib/proxmox';
import type { LeaseInstance } from '$lib/types';
import { canAccessInstance } from '$lib/server/instance-owners';
import { resolveProxmoxGuest, ProxmoxGuestNotFoundError } from '$lib/server/proxmox-guest';
import { createConsoleGrant } from '$lib/server/console-grant.mjs';

export const POST: RequestHandler = async ({ request, locals, cookies, url }) => {
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

		// Owner check: email (relation user ID) matches currently authenticated user's ID (admins bypass)
		if (!canAccessInstance(record, locals.user.id, locals.user.role === 'admin')) {
			return json({ error: 'Forbidden. You do not own this instance.' }, { status: 403 });
		}

		// 4. Extract vmid, node, and type
		const { vmid, hostname } = record;
		if (!vmid) {
			return json(
				{ error: 'Instance is not fully provisioned yet (missing VMID).' },
				{ status: 409 }
			);
		}

		const guest = await resolveProxmoxGuest(record);
		const node = guest.node;
		const typePath = guest.type;

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

		// VMs expose a graphical display; CTs expose a PTY terminal.
		const ticketResponse = await (typePath === 'qemu' ? getProxmoxVncTicket : getProxmoxTermTicket)({
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

		// Proxmox uses /vncwebsocket for both RFB and PTY tickets.
		// Keep the Proxmox session in a same-origin, HTTP-only cookie for the WS proxy.
		if (!ticketResponse.pveAuthCookie) {
			return json({ error: 'Console requires a Proxmox session. Configure PROXMOX_PASSWORD.' }, { status: 503 });
		}
		cookies.set('PVEAuthCookie', ticketResponse.pveAuthCookie, {
			path: '/proxmox-ws',
			secure: url.protocol === 'https:',
			httpOnly: true,
			sameSite: 'strict'
		});
		const wsPath = `/proxmox-ws/api2/json/nodes/${encodeURIComponent(node)}/${typePath}/${encodeURIComponent(vmid)}/vncwebsocket?port=${ticketResponse.port}&vncticket=${encodeURIComponent(ticketResponse.ticket)}`;
		const grant = createConsoleGrant(env.CONSOLE_GRANT_SECRET || env.PROXMOX_TOKEN_SECRET, {
			instanceId,
			userId: locals.user.id,
			path: wsPath
		});
		const wsUrl = `${wsPath}&grant=${encodeURIComponent(grant)}`;

		return json({
			success: true,
			consoleType: typePath === 'qemu' ? 'vnc' : 'terminal',
			wsUrl,
			ticket: ticketResponse.ticket,
			vncPassword: typePath === 'qemu' ? ticketResponse.password || ticketResponse.ticket : undefined,
			port: ticketResponse.port,
			vmid,
			node,
			hostname,
			user: ticketResponse.user
		}, { headers: { 'Cache-Control': 'no-store' } });

	} catch (e: any) {
		if (e instanceof ProxmoxGuestNotFoundError) {
			return json({ error: e.message }, { status: 404 });
		}
		console.error('[API Console Error]:', e.message);

		if (e.status === 404) {
			return json({ error: 'Instance not found in database.' }, { status: 404 });
		}

		return json(
			{ error: e.message || 'Failed to communicate with Proxmox hypervisor.' },
			{ status: 500 }
		);
	}
};
