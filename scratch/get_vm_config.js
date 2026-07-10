import PocketBase from 'pocketbase';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
	try {
		const host = process.env.PROXMOX_HOST || '';
		const port = process.env.PROXMOX_PORT || '8006';
		const user = process.env.PROXMOX_USER || '';
		const password = process.env.PROXMOX_PASSWORD || '';
		const skipTls = true;

		// Authenticate and get ticket
		const authUrl = `https://${host}:${port}/api2/json/access/ticket`;
		const authRes = await fetch(authUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ username: user, password }).toString(),
		});

		if (!authRes.ok) {
			throw new Error(`Auth failed: ${await authRes.text()}`);
		}
		const authData = (await authRes.json()).data;

		// Get VM config
		const configUrl = `https://${host}:${port}/api2/json/nodes/pve4/qemu/701/config`;
		console.log(`Fetching VM 701 configuration from Proxmox: ${configUrl}`);
		const res = await fetch(configUrl, {
			method: 'GET',
			headers: {
				'Cookie': `PVEAuthCookie=${authData.ticket}`,
				'CSRFPreventionToken': authData.CSRFPreventionToken
			}
		});

		if (!res.ok) {
			throw new Error(`Failed to fetch VM config: ${await res.text()}`);
		}

		const config = (await res.json()).data;
		console.log('\n--- VM 701 Hardware Configuration ---');
		console.log(JSON.stringify(config, null, 2));
		console.log('------------------------------------');
	} catch (e) {
		console.error('Error:', e);
	}
}

run();
