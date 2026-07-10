import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
dotenv.config();

const pb = new PocketBase(process.env.POCKETBASE_URL);

async function run() {
	try {
		// Log in as admin
		await pb.admins.authWithPassword(
			process.env.PB_ADMIN_EMAIL || '',
			process.env.PB_ADMIN_PASSWORD || ''
		);
		console.log('Logged in to PocketBase successfully.');

		// Fetch instances
		const records = await pb.collection('instances').getFullList();
		console.log('\n--- Instances in PocketBase ---');
		for (const r of records) {
			console.log(`ID: ${r.id}`);
			console.log(`  Hostname: ${r.hostname}`);
			console.log(`  Type: ${r.type} (${r.type === 'container' ? 'LXC' : 'Qemu/VM'})`);
			console.log(`  VMID: ${r.vmid}`);
			console.log(`  Node: ${r.node}`);
			console.log(`  Status: ${r.status}`);
			console.log(`  Creator: ${r.creator_email}`);
			console.log('------------------------------');
		}
	} catch (e) {
		console.error('Error:', e);
	}
}

run();
