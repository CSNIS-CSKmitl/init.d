async function updateInfraIpSafely(pb: any, recordId: string, ip: string) {
    try {
        if (!pb || typeof pb.collection !== 'function') return;
        const coll = pb.collection('instance_infra');
        if (!coll || typeof coll.getFirstListItem !== 'function') return;
        const existing = await coll.getFirstListItem(`instance = "${recordId}" || instance_ref = "${recordId}"`).catch(() => null);
        if (existing && (existing as any).id) {
            await coll.update((existing as any).id, { ip });
        } else if (typeof coll.create === 'function') {
            await coll.create({ instance: recordId, instance_ref: recordId, ip });
        }
    } catch {
        // fallback
    }
}
import proxmoxApi from 'proxmox-api';
import { fetch as undiciFetch, Agent } from 'undici';
import * as dotenv from 'dotenv';
import { CT_ID, VM_ID } from '$static/constant';
import { sendDiscordNotification } from './discord';
import type PocketBase from 'pocketbase';
import type { LeaseInstance } from './types';
import { startInstanceProvisioning, instanceIsBusy } from './server/instance-lifecycle';
import { waitForProxmoxTask, timedOutTask, recoveredTaskProgress } from './server/proxmox-tasks.mjs';
import { verifiedMigrationPatch, commitVerifiedRecovery, type MigrationSnapshot } from './server/provisioning-recovery';
import { adminPb } from './server/instance-owners';

dotenv.config();

const insecureProxmoxAgent = new Agent({ connect: { rejectUnauthorized: false } });

const customFetch = (url: any, init: any) => {
    if (init && init.headers) {
        delete init.headers['Content-Length'];
        delete init.headers['content-length'];
    }
    return undiciFetch(url, {
        ...init,
        dispatcher: process.env.PROXMOX_SKIP_TLS_VERIFY === 'true' ? insecureProxmoxAgent : undefined
    });
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

/**
 * Monitors and waits for an asynchronous Proxmox VE task to finish executing.
 *
 * **How it works:**
 * 1. Accepts a target node name and task UPID (Unique Process ID string returned by Proxmox API actions).
 * 2. Polls `GET /api2/json/nodes/{node}/tasks/{upid}/status` every 2 seconds in a loop.
 * 3. When `status` becomes `'stopped'`, inspects `exitstatus`:
 *    - If `'OK'`, resolves successfully.
 *    - If not `'OK'`, throws an Error with details on why the task failed.
 *
 * @param node - Target Proxmox node name (e.g., `"pve6"`).
 * @param upid - Task UPID string returned by an asynchronous Proxmox API call (e.g., `UPID:pve1:000B25B9:0423BAD8:6A60BEBA:resize:1232:user@pve:token:`).
 * @returns {Promise<void>} Resolves when task finishes with exit status `OK`.
 * @throws {Error} Throws an error if task completes with a non-OK exit status.
 *
 * @example
 * const upid = await proxmox.nodes.$('pve6').qemu.$(706).status.stop.$post();
 * await waitForTask('pve6', upid);
 */
async function waitForTask(node: string, upid: string): Promise<void> {
    console.log(`Waiting for task ${upid} on node ${node} to complete...`);
    if (!upid) return; // Some synchronous resize endpoints return no task.
    await waitForProxmoxTask(
        () => proxmox.nodes.$(node).tasks.$(upid).status.$get() as Promise<any>,
        { onUnavailable: () => console.warn(`Cannot check task ${upid} on ${node}; keeping the operation pending and retrying.`) },
    );
    console.log(`Task ${upid} completed successfully.`);
}

const recoveredTasks = new Map<string, { expires: number; progress: ReturnType<typeof recoveredTaskProgress> }>();
const recoveryChecks = new Map<string, { expires: number; progress: ReturnType<typeof recoveredTaskProgress> }>();

export async function getTimedOutTaskProgress(record: LeaseInstance, fresh = false) {
    const task = timedOutTask(record);
    if (!task) return null;
    const check = recoveryChecks.get(record.id);
    if (!fresh && check && check.expires > Date.now()) return check.progress;
    const cached = recoveredTasks.get(task.upid);
    if (!fresh && cached && cached.expires > Date.now()) return cached.progress;
    let status = null;
    try { status = await proxmox.nodes.$(task.node).tasks.$(task.upid).status.$get(); }
    catch { /* An unavailable API cannot establish task failure. */ }
    let progress = recoveredTaskProgress(status);
    if (progress.taskState === 'stopped-ok' && (task.type !== 'qmigrate' || (record.type && record.type !== 'vm'))) {
        progress = { status: 'Proxmox task completed. The remaining setup for this task needs administrator verification.', taskState: 'needs-review' };
    }
    if (recoveredTasks.size >= 256) recoveredTasks.delete(recoveredTasks.keys().next().value!);
    recoveredTasks.set(task.upid, { progress, expires: Date.now() + 5000 });
    return progress;
}

export async function assertTimedOutTaskStopped(record: LeaseInstance) {
    const progress = await getTimedOutTaskProgress(record, true);
    if (progress && ['running', 'unknown'].includes(progress.taskState)) {
        throw new Error(progress.status);
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
            full: true // Must be a full clone to allow migration across nodes without shared storage
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

        console.log('Get container IP address');
        // Wait a few seconds for DHCP to allocate an IP
        await new Promise(resolve => setTimeout(resolve, 15000));
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
                await updateInfraIpSafely(pb, recordId, ipAddress);
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



        }

        // Resize only after a cross-node migration. This keeps the migration
        // small and ensures the requested disk is expanded on the final
        // target storage instead of the template node.
        if (detail.specs?.disk && detail.specs.disk > 4) {
            const resizeNode = needsMigration ? node : baseNode;
            if (onProgress) await onProgress(`Resizing VM disk to ${detail.specs.disk}G on ${resizeNode}...`);
            console.log(`Resizing VM disk to ${detail.specs.disk}G on ${resizeNode}`);
            const resizeResponse = await proxmox.nodes.$(resizeNode).qemu.$(id).resize.$put({
                disk: 'scsi0',
                size: `+${detail.specs.disk - 4}G`,
            });
            await waitForTask(resizeNode, resizeResponse)
            console.log('Resize response:', resizeResponse);
        }

        // Restart Virtual machine to ensure it not used IP from template
        if (onProgress) await onProgress('Restarting VM to ensure fresh IP allocation...');
        const stopTask = await proxmox.nodes.$(node).qemu.$(id).status.stop.$post();
        await waitForTask(node, stopTask);
        const startTask = await proxmox.nodes.$(node).qemu.$(id).status.start.$post();
        await waitForTask(node, startTask);

        console.log('Get VM IP address');
        if (onProgress) await onProgress('Retrieving IP address from QEMU Guest Agent...');
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait a few seconds for DHCP to allocate an IP
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
                await updateInfraIpSafely(pb, recordId, ipAddress);
                console.log(`Updated PocketBase record ${recordId} with IP: ${ipAddress}`);
            } catch (pbErr) {
                console.error('Failed to update PocketBase with IP address:', pbErr);
            }
        }

        if (onProgress) await onProgress('Shutting down VM on destination node...');
        await proxmox.nodes.$(node).qemu.$(id).status.shutdown.$post();

        return { message: "VM created successfully", ipAddress };
    } catch (error) {
        console.error('Error creating VM:', error);
        throw error;
    }
}

export const provisioningProgress = new Map<string, { status: string; error?: string }>();

let recoveryTimer: ReturnType<typeof setInterval> | undefined;
let recoveryRunning = false;

export function startProvisioningRecovery() {
    if (recoveryTimer || process.env.PROVISION_RECOVERY_ENABLED === 'false') return;
    const run = async () => {
        if (recoveryRunning) return;
        recoveryRunning = true;
        try {
            const pb = await adminPb();
            const records = await pb.collection('instances').getFullList<LeaseInstance>({
                filter: 'status = "failed" && provision_error ~ "Timed out waiting for task UPID:"',
                expand: 'email',
            });
            for (const item of records) {
                if (instanceIsBusy(item.id)) continue;
                try {
                    const task = timedOutTask(item);
                    if (item.type !== 'vm' || task?.type !== 'qmigrate') continue;
                    const taskStatus = await proxmox.nodes.$(task.node).tasks.$(task.upid).status.$get();
                    if (taskStatus.status !== 'stopped' || taskStatus.exitstatus !== 'OK') continue;
                    const guests = await proxmox.cluster.resources.$get({ type: 'vm' });
                    const guest = guests.find(value => Number(value.vmid) === item.vmid);
                    if (!guest || guest.type !== 'qemu' || !guest.node) continue;
                    const targetNode = guest.node;
                    const vm = proxmox.nodes.$(targetNode).qemu.$(item.vmid!);
                    const config = await vm.config.$get() as any;
                    const network = String(config.net0 || '');
                    const mac = /(?:^|,)(?:virtio|e1000|e1000e|rtl8139|vmxnet3)=([0-9a-f:]+)/i.exec(network)?.[1].toLowerCase();
                    const interfaces = await vm.agent['network-get-interfaces'].$get() as any;
                    const snapshot: MigrationSnapshot = {
                        taskStatus,
                        vmid: Number(guest.vmid), node: targetNode, type: guest.type,
                        hostname: config.name, locked: Boolean(config.lock), template: Boolean(config.template),
                        cores: Number(config.cores) * Number(config.sockets || 1), memoryMiB: Number(config.memory),
                        disk: String(config.scsi0 || ''), network,
                        ipv4: (interfaces.result || [])
                            .filter((iface: any) => mac && String(iface['hardware-address'] || '').toLowerCase() === mac)
                            .flatMap((iface: any) => iface['ip-addresses'] || [])
                            .filter((address: any) => address['ip-address-type'] === 'ipv4')
                            .map((address: any) => address['ip-address']),
                    };
                    const decision = verifiedMigrationPatch(item, snapshot);
                    if (!decision.patch) {
                        if (recoveryChecks.size >= 256) recoveryChecks.delete(recoveryChecks.keys().next().value!);
                        recoveryChecks.set(item.id, { expires: Date.now() + 35000, progress: {
                            status: decision.reason, taskState: 'needs-review',
                        } });
                        continue;
                    }
                    const result = await commitVerifiedRecovery(pb, item, decision.patch);
                    if (!result.completed) continue;
                    recoveryChecks.delete(item.id);
                    const terminal = { status: 'Complete' };
                    provisioningProgress.set(item.id, terminal);
                    setTimeout(() => {
                        if (provisioningProgress.get(item.id) === terminal) provisioningProgress.delete(item.id);
                    }, 120000).unref();
                    if (result.changed && result.record) {
                        console.log(`[Provisioning recovery] Completed verified VM ${item.vmid}.`);
                        await sendDiscordNotification('completed', { ...item, ...result.record }, { node: guest.node, vmid: item.vmid });
                    }
                } catch {
                    console.warn(`[Provisioning recovery] Could not verify instance ${item.id}; will retry without changing its VM.`);
                }
            }
        } catch {
            console.warn('[Provisioning recovery] Could not read the recovery queue; will retry.');
        } finally {
            recoveryRunning = false;
        }
    };
    recoveryTimer = setInterval(() => { void run(); }, 30000);
    recoveryTimer.unref();
    void run();
}

export const startProvisioning = async (
    pb: PocketBase,
    recordId: string,
    detail: LeaseInstance & { cores: number; memory: number },
    network: string,
    disk: string,
    node: string,
    id: number,
    type: 'vm' | 'container'
) => {
    // Read the original binding rather than the form's proposed new VMID.
    const record = await pb.collection('instances').getOne<LeaseInstance>(recordId);
    const onProgress = async (message: string) => {
        provisioningProgress.set(recordId, { status: message });
    };
    await startInstanceProvisioning(pb, record,
        { vmid: id, node: Number.parseInt(node.replace(/[^\d]/g, ''), 10) },
        async () => {
            const guests = await proxmox.cluster.resources.$get({ type: 'vm' });
            if (guests.some(guest => Number(guest.vmid) === id)) {
                throw new Error(`VMID ${id} already exists. Use an unused VMID or complete the lease manually.`);
            }
            if (record.vmid && guests.some(guest => Number(guest.vmid) === Number(record.vmid))) {
                throw new Error('This lease still has a VM/CT on Proxmox. Delete it or complete the lease manually before retrying.');
            }
        },
        async () => {
            sendDiscordNotification('provision_started', detail, { node, vmid: id }).catch(console.error);
            return type === 'container'
                ? createCT(detail, network, disk, node, id, onProgress, pb, recordId)
                : createVM(detail, network, disk, node, id, onProgress, pb, recordId);
        },
        (status, error) => {
            provisioningProgress.set(recordId, { status, ...(error ? { error } : {}) });
            if (status === 'Complete' || status === 'Failed') {
                const terminal = provisioningProgress.get(recordId);
                setTimeout(() => {
                    if (provisioningProgress.get(recordId) === terminal) provisioningProgress.delete(recordId);
                }, 120000).unref();
            }
        },
        updated => { sendDiscordNotification('completed', updated, { node, vmid: id }).catch(console.error); },
        error => { sendDiscordNotification('failed', detail, { node, vmid: id, error }).catch(console.error); },
    );
};

function guestMac(config: Record<string, unknown>): string | null {
    const network = String(config.net0 || '');
    return /(?:^|,)(?:virtio|e1000|e1000e|rtl8139|vmxnet3)=([0-9a-f:]+)/i.exec(network)?.[1]?.toLowerCase()
        ?? /(?:^|,)hwaddr=([0-9a-f:]+)/i.exec(network)?.[1]?.toLowerCase()
        ?? null;
}

export async function removeProxmoxInstance(record: LeaseInstance): Promise<{ vmid?: number; node?: string; ip?: string; mac?: string } | void> {
    if (!record.vmid) return; // A request that never created a guest.
    // Query the cluster afresh: a failed migration may leave the guest on the template node.
    const guests = await proxmox.cluster.resources.$get({ type: 'vm' });
    const guest = guests.find(guest => Number(guest.vmid) === Number(record.vmid));
    if (!guest) return { vmid: Number(record.vmid), node: record.node ? String(record.node) : undefined, ip: record.IP };
    const expectedType = record.type === 'vm' ? 'qemu' : 'lxc';
    if (guest.type !== expectedType || !guest.node) throw new Error('VMID belongs to a different guest type. Check the lease binding.');
    const target = (proxmox.nodes.$(guest.node) as any)[expectedType].$(record.vmid);
    const config = await target.config.$get();
    const mac = guestMac(config);
    if (config.template) throw new Error('Templates cannot be deleted from the lease dashboard.');
    if ((config.name ?? config.hostname) !== record.hostname) {
        throw new Error('Proxmox hostname does not match this lease. Check VMID before deleting.');
    }
    const current = await target.status.current.$get();
    if (current.status !== 'stopped') {
        const stopTask = await target.status.stop.$post();
        if (!stopTask) throw new Error('Proxmox did not return a stop task.');
        await waitForTask(guest.node, stopTask);
    }
    const deleteTask = await target.$delete({ purge: true });
    if (!deleteTask) throw new Error('Proxmox did not return a deletion task.');
    await waitForTask(guest.node, deleteTask);
    return { vmid: Number(record.vmid), node: String(guest.node), ip: record.IP, mac: mac ?? undefined };
}

export interface ProxmoxVncTicketParams {
    host: string;
    port: string | number;
    user: string;
    token?: string;
    secret?: string;
    password?: string;
    node: string;
    typePath: 'qemu' | 'lxc';
    vmid: number | string;
    skipTls: boolean;
}

export interface ProxmoxVncTicketResponse {
    ticket: string;
    port: number;
    password?: string;
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

    const fetchOpts: Parameters<typeof undiciFetch>[1] = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            username: user,
            password: password || ''
        }).toString(),
        dispatcher: skipTls
            ? insecureProxmoxAgent
            : undefined
    };

    console.log(`[Proxmox Auth] Requesting session ticket for ${user} at ${url}`);
    const res = await undiciFetch(url, fetchOpts);
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
        if (!token || !secret) {
            throw new Error('Configure PROXMOX_PASSWORD or both PROXMOX_TOKEN and PROXMOX_TOKEN_SECRET.');
        }
        headers['Authorization'] = `PVEAPIToken=${user}!${token}=${secret}`;
        console.log(`[Proxmox] Using API Token authentication (User: ${user}!${token})`);
    }

    const fetchOpts: Parameters<typeof undiciFetch>[1] = {
        method: 'POST',
        headers,
        dispatcher: skipTls
            ? insecureProxmoxAgent
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
    fetchOpts.body = body.toString();

    const res = await undiciFetch(url, fetchOpts);
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
