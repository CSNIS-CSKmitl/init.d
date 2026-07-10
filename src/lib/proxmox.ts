import proxmoxApi from 'proxmox-api';
import * as dotenv from 'dotenv';

dotenv.config();

if (process.env.PROXMOX_SKIP_TLS_VERIFY === 'true') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Lazy getter — avoids UUID-format validation at module load time.
// createCT / createVM use this; getProxmoxVncTicket creates its own client.
function getProxmox() {
    return proxmoxApi(process.env.PROXMOX_TOKEN ? {
        host: process.env.PROXMOX_HOST || '',
        port: process.env.PROXMOX_PORT ? Number.parseInt(process.env.PROXMOX_PORT, 10) : 8006,
        tokenID: `${process.env.PROXMOX_USER}!${process.env.PROXMOX_TOKEN}`,
        tokenSecret: process.env.PROXMOX_TOKEN_SECRET || '',
    } : {
        host: process.env.PROXMOX_HOST || '',
        port: process.env.PROXMOX_PORT ? Number.parseInt(process.env.PROXMOX_PORT, 10) : 8006,
        username: process.env.PROXMOX_USER || '',
        password: process.env.PROXMOX_TOKEN_SECRET || '',
    });
}

// Keep the named export for backwards-compat with other callers.
export const proxmox = new Proxy({} as ReturnType<typeof proxmoxApi>, {
    get(_target, prop) {
        return (getProxmox() as any)[prop];
    }
});

function buildLxcNet0(network: string): string {
    const value = network.trim();
    return value.includes('=') ? value : `name=eth0,bridge=${value},ip=dhcp,tag=15`;
}

function buildVmNet0(network: string): string {
    const value = network.trim();
    return value.includes('=') ? value : `virtio,bridge=${value},tag=15`;
}

async function getISO(isoName: string): Promise<string | undefined> {
    const contents = await proxmox.nodes.$('pve6').storage.$('ct-vm-pool').content.$get();
    const matchedIso = contents
        .filter((item: any) => item.content === 'iso')
        .find((item: any) => item.volid.toLowerCase().includes(isoName.toLowerCase()));
    //Return the full Proxmox volume path (e.g., "ct-vm-pool:iso/ubuntu-24.04.iso")
    return matchedIso ? matchedIso.volid : undefined;
}

async function getTemplate(templateName: string): Promise<string | undefined> {
    const contents = await proxmox.nodes.$('pve6').storage.$('ct-vm-pool').content.$get();
    const matchedTemplate = contents
        .filter((item: any) => item.content === 'vztmpl')
        .find((item: any) => item.volid.toLowerCase().includes(templateName.toLowerCase()));
    //Return the full Proxmox volume path (e.g., "ct-vm-pool:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst")
    return matchedTemplate ? matchedTemplate.volid : undefined;
}


export const createCT = async ( detail: any, network: string, node: string, id: number,    ) => {
    try {
        const response = await proxmox.nodes.$(node).lxc.$post({
            vmid: id,
            ostemplate: await getTemplate(detail.os_template) as unknown as string,
            hostname: detail.hostname,
            cores: detail.cores,
            memory: detail.memory,
            net0: buildLxcNet0(network),
            rootfs: detail.rootfs, // ex. "volume=local-lvm:vm-100-disk-0,size=10G"
            password: 'ubuntu',
            start: true,
        });
        return response;
    } catch (error) {
        console.error('Error creating container:', error);
        throw error;
    }
}

export const createVM = async (detail: any, network: string, node: string, id: number) => {
    try {
        const response = await proxmox.nodes.$(node).qemu.$post({
            vmid: id,
            name: detail.hostname,
            cores: detail.cores,
            memory: detail.memory,
            cipassword: 'ubuntu',
            net0: buildVmNet0(network),
            ipconfig0: 'ip=dhcp',
            ide2: `${await getISO(detail.os_template)},media=cdrom`,
            start: true,
        });
        return response;
    } catch (error) {
        console.error('Error creating VM:', error);
        throw error;
    }
}

export interface ProxmoxVncTicketParams {
	host: string;
	port: string | number;
	user: string;
	token: string;
	secret: string;
	password?: string;
	node: string;
	typePath: 'qemu' | 'lxc';
	vmid: number | string;
	skipTls: boolean;
}

export interface ProxmoxVncTicketResponse {
	ticket: string;
	port: number;
	upid: string;
	cert: string;
	user: string;
	pveAuthCookie?: string;
}

// Helper to authenticate with Proxmox using password and obtain a session cookie + CSRF token
async function getProxmoxSession(params: {
	host: string;
	port: string | number;
	user: string;
	password?: string;
	skipTls: boolean;
}): Promise<{ ticket: string; CSRFPreventionToken: string }> {
	const { host, port, user, password, skipTls } = params;
	const url = `https://${host}:${port}/api2/json/access/ticket`;

	const fetchOpts: RequestInit = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			username: user,
			password: password || ''
		}).toString(),
		// @ts-expect-error — Node 18+ supports dispatcher via undici
		dispatcher: skipTls
			? new (await import('undici').then((m) => m.Agent))({ connect: { rejectUnauthorized: false } })
			: undefined
	};

	console.log(`[Proxmox Auth] Requesting session ticket for ${user} at ${url}`);
	const res = await fetch(url, fetchOpts);
	const responseText = await res.text();

	if (!res.ok) {
		throw new Error(`Proxmox session authentication failed (${res.status}): ${responseText}`);
	}

	const json = JSON.parse(responseText) as { data: { ticket: string; CSRFPreventionToken: string } };
	return json.data;
}

// Generic helper that POSTs to a Proxmox proxy endpoint (vncproxy or termproxy)
async function postProxmoxProxy(
	params: ProxmoxVncTicketParams,
	endpoint: 'vncproxy' | 'termproxy'
): Promise<ProxmoxVncTicketResponse> {
	const { host, port, user, token, secret, password, node, typePath, vmid, skipTls } = params;
	const numericVmid = typeof vmid === 'string' ? Number.parseInt(vmid, 10) : vmid;
	const baseUrl = `https://${host}:${port}/api2/json`;

	let headers: Record<string, string> = {
		'Content-Type': 'application/x-www-form-urlencoded'
	};

	let pveAuthCookie: string | undefined;

	// If password is provided, we perform session-based login (bypasses API Token constraints)
	if (password) {
		const session = await getProxmoxSession({ host, port, user, password, skipTls });
		headers['Cookie'] = `PVEAuthCookie=${session.ticket}`;
		headers['CSRFPreventionToken'] = session.CSRFPreventionToken;
		pveAuthCookie = session.ticket;
		console.log(`[Proxmox] Using session cookie authentication (User: ${user})`);
	} else {
		// Fallback to API Token header
		headers['Authorization'] = `PVEAPIToken=${user}!${token}=${secret}`;
		console.log(`[Proxmox] Using API Token authentication (User: ${user}!${token})`);
	}

	const fetchOpts: RequestInit = {
		method: 'POST',
		headers,
		// @ts-expect-error — Node 18+ supports this via undici
		dispatcher: skipTls
			? new (await import('undici').then((m) => m.Agent))({ connect: { rejectUnauthorized: false } })
			: undefined
	};

	const url = `${baseUrl}/nodes/${node}/${typePath}/${numericVmid}/${endpoint}`;

	console.log(`[Proxmox] POST ${url}`);

	// termproxy takes no body params; vncproxy needs websocket=1 (and generate-password for qemu)
	const body = new URLSearchParams();
	if (endpoint === 'vncproxy') {
		body.set('websocket', '1');
		if (typePath === 'qemu') {
			body.set('generate-password', '1');
		}
	}
	(fetchOpts as any).body = body.toString();

	const res = await fetch(url, fetchOpts);
	const responseText = await res.text();

	console.log(`[Proxmox] Response status: ${res.status}`);

	if (!res.ok) {
		throw new Error(`Proxmox API error ${res.status}: ${responseText}`);
	}

	const json = JSON.parse(responseText) as { data: ProxmoxVncTicketResponse };
	if (pveAuthCookie) {
		json.data.pveAuthCookie = pveAuthCookie;
	}
	return json.data;
}

// Uses /termproxy — returns PTY stream (plain text), compatible with xterm.js AttachAddon.
export const getProxmoxTermTicket = (params: ProxmoxVncTicketParams) =>
	postProxmoxProxy(params, 'termproxy');

// Uses /vncproxy — returns RFB/VNC binary stream, compatible with noVNC.
export const getProxmoxVncTicket = (params: ProxmoxVncTicketParams) =>
	postProxmoxProxy(params, 'vncproxy');

