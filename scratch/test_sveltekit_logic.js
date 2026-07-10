import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
import { getProxmoxTermTicket } from '../src/lib/proxmox.js';

dotenv.config();

const pb = new PocketBase(process.env.POCKETBASE_URL);

async function run() {
	try {
		await pb.admins.authWithPassword(
			process.env.PB_ADMIN_EMAIL || '',
			process.env.PB_ADMIN_PASSWORD || ''
		);
		console.log('Logged in to PocketBase.');

		const instanceId = '101ay0cx0d05fbt';
		const record = await pb.collection('instances').getOne(instanceId);
		console.log('\n--- PocketBase Record ---');
		console.log('ID:', record.id);
		console.log('VMID:', record.vmid);
		console.log('Node:', record.node);
		console.log('Type:', record.type);
		console.log('-------------------------');

		const { vmid, type } = record;
		const node = /^\d+$/.test(String(record.node ?? ''))
			? `pve${record.node}`
			: String(record.node ?? '');
		const typePath = type === 'container' ? 'lxc' : 'qemu';

		const host = process.env.PROXMOX_HOST;
		const port = process.env.PROXMOX_PORT || '8006';
		const user = process.env.PROXMOX_USER;
		const token = process.env.PROXMOX_TOKEN;
		const secret = process.env.PROXMOX_TOKEN_SECRET;
		const password = process.env.PROXMOX_PASSWORD;
		const skipTls = process.env.PROXMOX_SKIP_TLS_VERIFY === 'true';

		console.log('\n--- Calling getProxmoxTermTicket with SvelteKit params ---');
		console.log({
			host,
			port,
			user,
			node,
			typePath,
			vmid,
			skipTls,
			hasPassword: !!password
		});

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

		console.log('\n--- SvelteKit Logic Response ---');
		console.log(JSON.stringify(ticketResponse, null, 2));
		console.log('--------------------------------');
	} catch (e) {
		console.error('Error:', e);
	}
}

run();
