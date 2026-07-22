import proxmoxApi from 'proxmox-api';
import * as dotenv from 'dotenv';
import { CT_ID, VM_ID } from '$static/constant';
import { sendDiscordNotification } from './discord';

dotenv.config();

if (process.env.PROXMOX_SKIP_TLS_VERIFY === 'true') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const customFetch = (url: any, init: any) => {
    if (init && init.headers) {
        delete init.headers['Content-Length'];
        delete init.headers['content-length'];
    }
    return fetch(url, init);
};

// Lazy getter — avoids UUID-format validation at module load time.
// createCT / createVM use this; getProxmoxVncTicket creates its own client.
function getProxmox() {
    return proxmoxApi(process.env.PROXMOX_TOKEN ? {
        host: process.env.PROXMOX_HOST || '',
        port: process.env.PROXMOX_PORT ? Number.parseInt(process.env.PROXMOX_PORT, 10) : 8006,
        tokenID: `${process.env.PROXMOX_USER}!${process.env.PROXMOX_TOKEN}`,
        tokenSecret: process.env.PROXMOX_TOKEN_SECRET || '',
        fetch: customFetch as any,
    } : {
        host: process.env.PROXMOX_HOST || '',
        port: process.env.PROXMOX_PORT ? Number.parseInt(process.env.PROXMOX_PORT, 10) : 8006,
        username: process.env.PROXMOX_USER || '',
        password: process.env.PROXMOX_TOKEN_SECRET || '',
        fetch: customFetch as any,
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

async function waitForTask(node: string, upid: string): Promise<void> {
    console.log(`Waiting for task ${upid} on node ${node} to complete...`);
    while (true) {
        const statusObj = await proxmox.nodes.$(node).tasks.$(upid).status.$get() as any;
        if (statusObj.status === 'stopped') {
            if (statusObj.exitstatus === 'OK') {
                console.log(`Task ${upid} completed successfully.`);
                return;
            } else {
                throw new Error(`Task ${upid} failed with exit status: ${statusObj.exitstatus}`);
            }
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

export const createCT = async (
    detail: any,
    network: string,
    disk: string,
    node: string,
    id: number,
    onProgress?: (msg: string) => Promise<void>,
    pb?: any,
    recordId?: string
) => {
    console.log('Finding CT template ID for OS:', detail.os_template);
    const baseCTId = CT_ID.get(detail.os_template.toLowerCase());
    if (baseCTId == undefined) {
        return Promise.reject(new Error(`Template for ${detail.os_template} not found.`));
    }
    try {
        if (onProgress) await onProgress('Cloning container from template...');
        console.log('Cloning container');
        const baseNode = process.env.TEMPLATE_NODE || 'pve6';
        const needsMigration = node !== baseNode;

        const cloneParams: any = {
            newid: id,
            hostname: detail.hostname,
        };

        if (!needsMigration) {
            cloneParams.target = node;
            cloneParams.storage = disk;
        }

        const cloneRespond = await proxmox.nodes.$(baseNode).lxc.$(baseCTId).clone.$post(cloneParams);
        console.log('Clone response:', cloneRespond);

        // Wait for clone task to finish
        await waitForTask(baseNode, cloneRespond);

        if (needsMigration) {
            if (onProgress) await onProgress(`Migrating container to target node ${node}...`);
            console.log(`Migrating container ${id} from ${baseNode} to ${node}`);
            const migrateRespond = await proxmox.nodes.$(baseNode).lxc.$(id).migrate.$post({
                target: node,
                "target-storage": disk,
            });
            console.log('Migration response:', migrateRespond);
            await waitForTask(baseNode, migrateRespond);
        }

        if (onProgress) await onProgress('Configuring container...');
        console.log('Configuring container with details:', { detail, network, disk, node, id });

        const configRespond = await proxmox.nodes.$(node).lxc.$(id).config.$put({
            cores: detail.cores,
            memory: detail.memory * 1024,
            net0: buildLxcNet0(network),
        })

        console.log('Config response:', configRespond);

        if (detail.specs?.disk && detail.specs.disk > 2) {
            if (onProgress) await onProgress(`Resizing container disk to ${detail.specs.disk}G...`);
            console.log(`Resizing CT disk to ${detail.specs.disk}G on ${node}`);
            const resizeResponse = await proxmox.nodes.$(node).lxc.$(id).resize.$put({
                disk: 'rootfs',
                size: `${detail.specs.disk}G`,
            } as any);
            await waitForTask(node, resizeResponse)
            console.log('Resize response:', resizeResponse);
        }

        if (onProgress) await onProgress('Starting container to retrieve IP address...');
        console.log('Starting container on target node');
        await proxmox.nodes.$(node).lxc.$(id).status.start.$post();

        // Restart container to ensure it not used IP from template
        await proxmox.nodes.$(node).lxc.$(id).status.stop.$post();
        await waitForTask(node, `lxc/${id}/status/stop`);
        await proxmox.nodes.$(node).lxc.$(id).status.start.$post();
        await waitForTask(node, `lxc/${id}/status/start`);

        // Wait a few seconds for DHCP to allocate an IP
        await new Promise(resolve => setTimeout(resolve, 15000));

        console.log('Get container IP address');
        let ipAddress = '';
        try {
            const interfaces = await proxmox.nodes.$(node).lxc.$(id).interfaces.$get() as any;
            const list = Array.isArray(interfaces) ? interfaces : (interfaces?.data || interfaces?.result || []);
            for (const iface of list) {
                if (iface.name === 'lo') continue;
                if (iface.inet) {
                    const cleanIp = iface.inet.split('/')[0].trim();
                    if (cleanIp) {
                        ipAddress = cleanIp;
                        break;
                    }
                }
            }
        } catch (err: any) {
            console.error('Failed to retrieve CT IP address from interfaces:', err);
        }
        console.log('Retrieved CT IP address:', ipAddress);

        if (ipAddress && pb && recordId) {
            try {
                await pb.collection('instances').update(recordId, { IP: ipAddress });
                console.log(`Updated PocketBase record ${recordId} with IP: ${ipAddress}`);
            } catch (pbErr) {
                console.error('Failed to update PocketBase with IP address:', pbErr);
            }
        }

        if (onProgress) await onProgress('Shutting down container...');
        await proxmox.nodes.$(node).lxc.$(id).status.shutdown.$post();

        if (onProgress) await onProgress('Configuration done');
        return { message: "Container created successfully", ipAddress };
    } catch (error) {
        console.error('Error creating container:', error);
        throw error;
    }
}

export const createVM = async (
    detail: any,
    network: string,
    disk: string,
    node: string,
    id: number,
    onProgress?: (msg: string) => Promise<void>,
    pb?: any,
    recordId?: string
) => {
    try {
        console.log('Create VM with spec: ', { detail, network, disk, node, id });
        console.log('Finding VM from template');
        const baseNode = process.env.TEMPLATE_NODE || 'pve6';
        const baseVMID = VM_ID.get(detail.os_template.toLowerCase());
        if (baseVMID == undefined) {
            return Promise.reject(new Error(`Template for ${detail.os_template} not found.`));
        }

        const needsMigration = node !== baseNode;

        if (onProgress) await onProgress('Cloning VM from template...');
        console.log('Cloning VM');
        const cloneParams: any = {
            newid: id,
            name: detail.hostname,
            full: 1, // Must be a full clone to allow migration across nodes without shared storage
        };

        if (!needsMigration) {
            cloneParams.storage = disk;
        }

        const cloneResponse = await proxmox.nodes.$(baseNode).qemu.$(baseVMID).clone.$post(cloneParams);
        await waitForTask(baseNode, cloneResponse);
        console.log('Clone response:', cloneResponse);

        if (onProgress) await onProgress('Configuring VM...');
        console.log('Configuring VM with details:', { detail, network, disk, node: baseNode, id });
        const configResponse = await proxmox.nodes.$(baseNode).qemu.$(id).config.$put({
            cores: detail.cores,
            memory: String(detail.memory * 1024),
            net0: buildVmNet0(network),
            scsihw: 'virtio-scsi-pci',
            bios: 'ovmf',
            ostype: 'l26',
            boot: 'order=scsi0',
            ciuser: 'ubuntu',
            cipassword: 'ubuntu',
            ipconfig0: 'ip=dhcp',
        });

        if (detail.specs?.disk && detail.specs.disk > 4) {
            if (onProgress) await onProgress(`Resizing VM disk to ${detail.specs.disk}G...`);
            console.log(`Resizing VM disk to ${detail.specs.disk}G on ${baseNode}`);
            const resizeResponse = await proxmox.nodes.$(baseNode).qemu.$(id).resize.$put({
                disk: 'scsi0',
                size: `+${detail.specs.disk - 4}G`,
            });
            await waitForTask(baseNode, resizeResponse)
            console.log('Resize response:', resizeResponse);
        }

        let ipAddress = '';
        if (needsMigration) {
            if (onProgress) await onProgress('Starting VM for online migration...');
            console.log('Starting VM on baseNode for online migration');
            await proxmox.nodes.$(baseNode).qemu.$(id).status.start.$post();

            // Wait a few seconds for the VM process to initialize
            await new Promise(resolve => setTimeout(resolve, 5000));

            if (onProgress) await onProgress(`Migrating VM online to target node ${node}...`);
            console.log(`Migrating VM ${id} online from ${baseNode} to ${node}`);
            const migrateResponse = await proxmox.nodes.$(baseNode).qemu.$(id).migrate.$post({
                target: node,
                targetstorage: disk,
                "with-local-disks": 1,
                online: 1,
                "with-conntrack-state": 1,
            } as any);
            await waitForTask(baseNode, migrateResponse);
            console.log('Migration response:', migrateResponse);

            // Restart Virtual machine to ensure it not used IP from template
            await proxmox.nodes.$(node).qemu.$(id).status.stop.$post();
            await waitForTask(node, `qemu/${id}/status/stop`);
            await proxmox.nodes.$(node).qemu.$(id).status.start.$post();
            await waitForTask(node, `qemu/${id}/status/start`);

            console.log('Get VM IP address');
            ipAddress = await proxmox.nodes.$(node).qemu.$(id).agent['network-get-interfaces'].$get().then((res: any) => {
                let ip = '';
                if (Array.isArray(res?.result)) {
                    for (const iface of res.result) {
                        if (iface.name === 'lo') continue;
                        const ipv4Obj = iface['ip-addresses']?.find((a: any) => a['ip-address-type'] === 'ipv4');
                        if (ipv4Obj?.['ip-address']) {
                            ip = ipv4Obj['ip-address'];
                            break;
                        }
                    }
                }
                if (!ip && res?.result?.[1]?.['ip-addresses']?.[0]?.['ip-address']) {
                    ip = res.result[1]['ip-addresses'][0]['ip-address'];
                }
                return ip;
            }).catch((err: any) => {
                console.error('Failed to retrieve VM IP address from agent:', err);
                return '';
            });
            console.log('Retrieved IP address:', ipAddress);

            if (ipAddress && pb && recordId) {
                try {
                    await pb.collection('instances').update(recordId, { IP: ipAddress });
                    console.log(`Updated PocketBase record ${recordId} with IP: ${ipAddress}`);
                } catch (pbErr) {
                    console.error('Failed to update PocketBase with IP address:', pbErr);
                }
            }

            if (onProgress) await onProgress('Shutting down VM on destination node...');
            await proxmox.nodes.$(node).qemu.$(id).status.shutdown.$post();
        }
        return { message: "VM created successfully", ipAddress };
    } catch (error) {
        console.error('Error creating VM:', error);
        throw error;
    }
}

export const provisioningProgress = new Map<string, { status: string; error?: string }>();

export const startProvisioning = (
    pb: any,
    recordId: string,
    detail: any,
    network: string,
    disk: string,
    node: string,
    id: number,
    type: 'vm' | 'container'
) => {
    provisioningProgress.set(recordId, { status: 'Starting provisioning...' });

    // Run asynchronously without awaiting so the action returns immediately
    (async () => {
        try {
            sendDiscordNotification('provision_started', detail, { node, vmid: id }).catch(e =>
                console.error('[Discord Webhook] Failed to send provision_started alert:', e)
            );

            const onProgress = async (msg: string) => {
                provisioningProgress.set(recordId, { status: msg });
            };

            let ipAddress = '';
            if (type === 'container') {
                const ctRes = await createCT(detail, network, disk, node, id, onProgress, pb, recordId);
                if (ctRes?.ipAddress) {
                    ipAddress = ctRes.ipAddress;
                }
            } else {
                const vmRes = await createVM(detail, network, disk, node, id, onProgress, pb, recordId);
                if (vmRes?.ipAddress) {
                    ipAddress = vmRes.ipAddress;
                }
            }

            // Provision complete!
            provisioningProgress.set(recordId, { status: 'Complete' });

            // Parse node number (e.g. "pve3" -> 3)
            const nodeNum = Number.parseInt(node.replace(/[^\d]/g, ''), 10);

            const updateData: Record<string, any> = {
                status: 'completed',
                vmid: id,
                node: Number.isNaN(nodeNum) ? null : nodeNum
            };
            if (ipAddress) {
                updateData.IP = ipAddress;
            }

            // Update status in PocketBase. Make sure comments/replies are NOT modified!
            const updatedRecord = await pb.collection('instances').update(recordId, updateData);

            sendDiscordNotification('completed', updatedRecord, { node, vmid: id }).catch(e =>
                console.error('[Discord Webhook] Failed to send completed alert:', e)
            );

            // Clean up progress after 2 minutes
            setTimeout(() => {
                provisioningProgress.delete(recordId);
            }, 120000);

        } catch (err: any) {
            console.error(`Provisioning failed for ${recordId}:`, err);
            const errMsg = err?.message || String(err);
            provisioningProgress.set(recordId, { status: 'Failed', error: errMsg });

            sendDiscordNotification('failed', detail, { node, vmid: id, error: errMsg }).catch(e =>
                console.error('[Discord Webhook] Failed to send failure alert:', e)
            );
        }
    })();
};


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

    // termproxy for Qemu VMs requires specifying the serial port (e.g. serial0)
    // to output text-based PTY data compatible with xterm.js. Otherwise it
    // defaults to the graphical display console which outputs binary RFB/VNC.
    const body = new URLSearchParams();
    if (endpoint === 'termproxy') {
        if (typePath === 'qemu') {
            body.set('serial', 'serial0');
        }
    } else if (endpoint === 'vncproxy') {
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
