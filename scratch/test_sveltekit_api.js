import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
	try {
		const pb = new PocketBase(process.env.POCKETBASE_URL);
		// Login as admin
		await pb.admins.authWithPassword(
			process.env.PB_ADMIN_EMAIL || '',
			process.env.PB_ADMIN_PASSWORD || ''
		);

		// We need a user token for local authentication to SvelteKit,
		// but since SvelteKit endpoint /api/console checks locals.user:
		// locals.user is populated by hooks.server.ts from pocketbase auth cookie.
		// Let's call the SvelteKit API endpoint directly by simulating a request
		// from SvelteKit. Oh, actually we can just run the logic inside a Node script,
		// or call the local dev server http://localhost:5173/api/console if we have a valid cookie!
		// Wait, instead of calling the HTTP API, we can write a script that imports the logic
		// or we can just fetch from localhost by passing the pb_auth cookie!
		
		// Let's get the pb_auth cookie value
		const authCookie = pb.authStore.exportToCookie();
		console.log('Exported Cookie:', authCookie);

		const res = await fetch('http://localhost:5173/api/console', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cookie': authCookie
			},
			body: JSON.stringify({ instanceId: '101ay0cx0d05fbt' })
		});

		console.log('API Response Status:', res.status);
		const data = await res.json();
		console.log('\n--- API Response ---');
		console.log(JSON.stringify(data, null, 2));
		console.log('--------------------');
	} catch (e) {
		console.error('Error:', e);
	}
}

run();
