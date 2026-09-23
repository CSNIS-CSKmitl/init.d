#!/usr/bin/env node
// Read-only integration smoke test. Console tickets create short-lived proxy sessions.
import assert from 'node:assert/strict';
import 'dotenv/config';
import PocketBase from 'pocketbase';
import WebSocket from 'ws';

const base = process.env.TEST_APP_URL ?? 'http://127.0.0.1:3001';
const adminEmail = process.env.TEST_ADMIN_USER_EMAIL;
const password = process.env.TEST_USER_PASSWORD;
if (!adminEmail || !password) throw new Error('Set TEST_ADMIN_USER_EMAIL and TEST_USER_PASSWORD.');

const login = await fetch(`${base}/login`, {
	method: 'POST', redirect: 'manual',
	headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base, accept: 'text/html' },
	body: new URLSearchParams({ identity: adminEmail, password })
});
assert.equal(login.status, 303, 'admin login failed');
const authCookie = login.headers.getSetCookie().find((value) => value.startsWith('pb_auth='))?.split(';')[0];
assert.ok(authCookie, 'missing app auth cookie');

const pb = new PocketBase(process.env.POCKETBASE_URL);
await pb.admins.authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);
const rows = await pb.collection('instances').getFullList({
	filter: 'status = "completed" && vmid > 0 && node > 0',
	fields: 'id,type,node,vmid', sort: '-created'
});

async function powerStatus(item) {
	const response = await fetch(`${base}/api/instance-power?instanceId=${item.id}`, {
		headers: { cookie: authCookie }
	});
	const body = await response.json();
	return { response, body };
}

async function findRunning(type) {
	for (const item of rows.filter((row) => row.type === type)) {
		const { response, body } = await powerStatus(item);
		if (response.ok && body.status === 'running') return item;
	}
	throw new Error(`No running ${type} found to test.`);
}

async function ticket(item, expectedType) {
	const response = await fetch(`${base}/api/console`, {
		method: 'POST',
		headers: { cookie: authCookie, origin: base, 'content-type': 'application/json' },
		body: JSON.stringify({ instanceId: item.id })
	});
	const body = await response.json();
	assert.equal(response.status, 200, `${item.type} console error: ${body.error}`);
	assert.equal(body.consoleType, expectedType);
	assert.ok(body.wsUrl?.startsWith('/proxmox-ws/api2/json/nodes/'));
	assert.ok(!body.wsUrl.includes('/cookie/'));
	assert.ok(!body.pveAuthCookie);
	if (expectedType === 'vnc') assert.ok(body.vncPassword);
	const pveCookie = response.headers.getSetCookie().find((value) => value.startsWith('PVEAuthCookie='))?.split(';')[0];
	assert.ok(pveCookie, 'missing HTTP-only Proxmox cookie');
	return { body, pveCookie };
}

const vm = await findRunning('vm');
const ct = await findRunning('container');
const vmTicket = await ticket(vm, 'vnc');
await ticket(ct, 'terminal');

const wsUrl = new URL(vmTicket.body.wsUrl, base).href.replace(/^http/, 'ws');
const greeting = await new Promise((resolve, reject) => {
	const ws = new WebSocket(wsUrl, { headers: { cookie: `${authCookie}; ${vmTicket.pveCookie}` } });
	const timer = setTimeout(() => { ws.terminate(); reject(new Error('VNC WebSocket greeting timed out')); }, 10000);
	ws.once('message', (data) => { clearTimeout(timer); ws.close(); resolve(data.toString()); });
	ws.once('error', (error) => { clearTimeout(timer); reject(error); });
	ws.once('close', () => { clearTimeout(timer); reject(new Error('VNC WebSocket closed before greeting')); });
});
assert.ok(String(greeting).startsWith('RFB '), 'VNC WebSocket did not send an RFB greeting');
console.log(`PASS: VM ${vm.vmid} power status and VNC/RFB WebSocket; CT ${ct.vmid} terminal ticket`);
