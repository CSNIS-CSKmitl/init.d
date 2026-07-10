import proxmoxApi from 'proxmox-api';
import * as dotenv from 'dotenv';

dotenv.config();

if (process.env.PROXMOX_SKIP_TLS_VERIFY === 'true') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Throw an error if the connection details are missing to prevent silent failures
if (!process.env.PROXMOX_HOST || !process.env.PROXMOX_USER || !process.env.PROXMOX_TOKEN_SECRET) {
    console.warn("Proxmox API credentials not fully configured in environment variables.");
}

export const proxmox = proxmoxApi(process.env.PROXMOX_TOKEN ? {
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
}

export const getProxmoxVncTicket = async (params: ProxmoxVncTicketParams): Promise<ProxmoxVncTicketResponse> => {
	const { node, typePath, vmid } = params;
	const numericVmid = typeof vmid === 'string' ? Number.parseInt(vmid, 10) : vmid;

	if (typePath === 'qemu') {
		const response = await proxmox.nodes.$(node).qemu.$(numericVmid).vncproxy.$post({
			websocket: true,
			'generate-password': true
		});
		return response as unknown as ProxmoxVncTicketResponse;
	} else {
		const response = await proxmox.nodes.$(node).lxc.$(numericVmid).vncproxy.$post({
			websocket: true
		});
		return response as unknown as ProxmoxVncTicketResponse;
	}
};

