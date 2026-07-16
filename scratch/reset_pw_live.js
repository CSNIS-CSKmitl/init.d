import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
dotenv.config();

const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);

async function run() {
	try {
		await pb.admins.authWithPassword(
			process.env.PB_ADMIN_EMAIL || '',
			process.env.PB_ADMIN_PASSWORD || ''
		);
		console.log('Logged in as admin.');

		const userClient = new PocketBase(process.env.POCKETBASE_URL);
		userClient.autoCancellation(false);

		await userClient.collection('users').authWithPassword('66050160@kmitl.ac.th', 'testpassword123');
		console.log('Logged in as user.');

		const list = await userClient.collection('instances').getList(1, 10, {
			expand: 'passion_group,email'
		});

		console.log(`Found ${list.items.length} items:`);
		for (const item of list.items) {
			console.log(`- ID: ${item.id}, Hostname: ${item.hostname}, Email relation: ${JSON.stringify(item.email)}, Expanded Email: ${item.expand?.email?.email}`);
		}
	} catch (e) {
		console.error('Error:', e);
	}
}

run();
