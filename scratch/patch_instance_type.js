import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
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
		console.log(`Updating instance ${instanceId} type to 'vm'...`);
		await pb.collection('instances').update(instanceId, { type: 'vm' });
		console.log('Update successful!');
	} catch (e) {
		console.error('Error:', e);
	}
}

run();
