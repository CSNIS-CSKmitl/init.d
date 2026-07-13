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

		// Call termproxy with serial: serial0
		const termUrl = `https://${host}:${port}/api2/json/nodes/pve4/qemu/701/termproxy`;
		console.log(`Calling POST ${termUrl}...`);
		const body = new URLSearchParams();
		// body.set('serial', 'serial0');

		const res = await fetch(termUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Cookie': `PVEAuthCookie=${authData.ticket}`,
				'CSRFPreventionToken': authData.CSRFPreventionToken
			},
			body: body.toString()
		});

		if (!res.ok) {
			throw new Error(`Termproxy failed: ${await res.text()}`);
		}

		const data = (await res.json()).data;
		console.log('\n--- Proxmox Termproxy Response ---');
		console.log(JSON.stringify(data, null, 2));
		console.log('---------------------------------');
	} catch (e) {
		console.error('Error:', e);
	}
}

run();
