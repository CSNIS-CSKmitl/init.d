import proxmoxApi from 'proxmox-api';
import * as dotenv from 'dotenv';
import { CT_ID, VM_ID } from '$static/constant';

dotenv.config();

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

async function getTemplate(templateName: string): Promise<string | undefined> {
    const contents = await proxmox.nodes.$('pve6').storage.$('ct-vm-pool').content.$get();
    const matchedTemplate = contents
        .filter((item: any) => item.content === 'vztmpl')
        .find((item: any) => item.volid.toLowerCase().includes(templateName.toLowerCase()));
    //Return the full Proxmox volume path (e.g., "ct-vm-pool:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst")
    return matchedTemplate ? matchedTemplate.volid : undefined;
}

async function getCTTemplateId(osName: string): Promise<number | undefined> {
    const node = process.env.CT_TEMPLATE_NODE || 'pve6';
    const storage = process.env.CT_TEMPLATE_STORAGE || 'disk4';
    const contents = await proxmox.nodes.$(node).storage.$(storage).content.$get();
    const matchedTemplate = contents
        .filter((item: any) => item.content === 'vztmpl')
        .find((item: any) => item.volid.toLowerCase().includes(osName.toLowerCase()));
    return matchedTemplate ? Number.parseInt(matchedTemplate.volid.split(':')[1], 10) : undefined;
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
    onProgress?: (msg: string) => Promise<void>
) => {
    console.log('Finding CT template ID for OS:', detail.os_template);
    const baseCTId = CT_ID.get(detail.os_template.toLowerCase());
    if (baseCTId == undefined) {
        return Promise.reject(new Error(`Template for ${detail.os_template} not found.`));
    }
    try {
        if (onProgress) await onProgress('Cloning container from template...');
        console.log('Cloning container');
        const baseNode = process.env.CT_TEMPLATE_NODE || 'pve6';
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

        if (onProgress) await onProgress('Configuration done');
        return "Container created successfully";
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
    onProgress?: (msg: string) => Promise<void>
) => {
    try {
        console.log('Create VM with spec: ', { detail, network, disk, node, id });
        console.log('Finding VM from template');
        const baseNode = process.env.VM_TEMPLATE_NODE || 'pve6';
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

        if (detail.specs?.disk && detail.specs.disk > 2) {
            if (onProgress) await onProgress(`Resizing VM disk to ${detail.specs.disk}G...`);
            console.log(`Resizing VM disk to ${detail.specs.disk}G on ${baseNode}`);
            const resizeResponse = await proxmox.nodes.$(baseNode).qemu.$(id).resize.$put({
                disk: 'scsi0',
                size: `${detail.specs.disk - 2}G`,
            });
            await waitForTask(baseNode, resizeResponse)
            console.log('Resize response:', resizeResponse);
        }

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

            if (onProgress) await onProgress('Shutting down VM on destination node...');
            await proxmox.nodes.$(node).qemu.$(id).status.shutdown.$post();
        }
        return "VM created successfully";
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
			const onProgress = async (msg: string) => {
				provisioningProgress.set(recordId, { status: msg });
			};

			if (type === 'container') {
				await createCT(detail, network, disk, node, id, onProgress);
			} else {
				await createVM(detail, network, disk, node, id, onProgress);
			}

			// Provision complete!
			provisioningProgress.set(recordId, { status: 'Complete' });

			// Parse node number (e.g. "pve3" -> 3)
			const nodeNum = Number.parseInt(node.replace(/[^\d]/g, ''), 10);

			// Update status in PocketBase. Make sure comments/replies are NOT modified!
			await pb.collection('instances').update(recordId, {
				status: 'completed',
				vmid: id,
				node: Number.isNaN(nodeNum) ? null : nodeNum
			});

			// Clean up progress after 2 minutes
			setTimeout(() => {
				provisioningProgress.delete(recordId);
			}, 120000);

		} catch (err: any) {
			console.error(`Provisioning failed for ${recordId}:`, err);
			const errMsg = err?.message || String(err);
			provisioningProgress.set(recordId, { status: 'Failed', error: errMsg });
		}
	})();
};

