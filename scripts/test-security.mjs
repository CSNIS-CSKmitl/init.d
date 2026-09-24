import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isAppAdmin } from '../src/lib/role.mjs';
import { isAllowedOrigin, authorizedInstance, authorizeConsoleSocket } from '../src/lib/server/ws-auth.mjs';
import { createConsoleGrant, verifyConsoleGrant } from '../src/lib/server/console-grant.mjs';

test('only the admin role is an application admin', () => {
	assert.equal(isAppAdmin('admin'), true);
	assert.equal(isAppAdmin('superadmin'), false);
	assert.equal(isAppAdmin('staff'), false);
});

test('WebSocket origin must match exactly', () => {
	const request = (origin) => ({ headers: { origin } });
	assert.equal(isAllowedOrigin(request('https://portal.example.org'), 'https://portal.example.org'), true);
	assert.equal(isAllowedOrigin(request('https://portal.example.org.evil.test'), 'https://portal.example.org'), false);
	assert.equal(isAllowedOrigin(request(undefined), 'https://portal.example.org'), false);
});

test('instance authorization respects owner and co-owner', async () => {
	const item = { id: 'vm1', email: 'owner', owners: ['shared'], type: 'vm', vmid: 719, IP: '192.168.15.153' };
	const auth = (userId, isAdmin = false) => ({ userId, isAdmin, pb: { collection: () => ({ getOne: async () => item }) } });
	assert.equal((await authorizedInstance(auth('owner'), 'vm1'))?.id, 'vm1');
	assert.equal((await authorizedInstance(auth('shared'), 'vm1'))?.id, 'vm1');
	assert.equal(await authorizedInstance(auth('stranger'), 'vm1'), null);
	assert.equal((await authorizedInstance(auth('stranger', true), 'vm1'))?.id, 'vm1');
});

test('console grants are bound to user, instance and exact path', async () => {
	const secret = 'test-only-secret';
	const path = '/proxmox-ws/api2/json/nodes/pve4/qemu/719/vncwebsocket?port=5900&vncticket=PVEVNC%3Atest';
	const grant = createConsoleGrant(secret, { instanceId: 'vm1', userId: 'owner', path });
	assert.equal(verifyConsoleGrant(secret, grant, { userId: 'owner', path }), true);
	assert.equal(verifyConsoleGrant(secret, grant, { userId: 'stranger', path }), false);
	assert.equal(verifyConsoleGrant(secret, grant, { userId: 'owner', path: path.replace('719', '720') }), false);
	const item = { id: 'vm1', email: 'owner', owners: [], type: 'vm', vmid: 719 };
	const auth = { userId: 'owner', isAdmin: false, pb: { collection: () => ({ getOne: async () => item }) } };
	const request = (cookie, url) => ({ headers: { cookie }, url });
	assert.equal((await authorizeConsoleSocket(request('PVEAuthCookie=PVE%3Aticket', `${path}&grant=${grant}`), auth, secret))?.targetPath,
		path.slice('/proxmox-ws'.length));
	assert.equal(await authorizeConsoleSocket(request('', `${path}&grant=${grant}`), auth, secret), null);
	assert.equal(await authorizeConsoleSocket(request('PVEAuthCookie=PVE%3Aticket', `${path.replace('719', '720')}&grant=${grant}`), auth, secret), null);
});

test('SSH host key is pinned and changed keys are rejected', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'initd-ssh-hostkeys-'));
	process.env.SSH_HOST_KEYS_FILE = join(dir, 'keys.json');
	const { createHostVerifier } = await import('../src/lib/server/ssh-hostkeys.mjs');
	const verify = createHostVerifier('vm1');
	assert.equal(verify(Buffer.from('first-host-key')), true);
	assert.equal(verify(Buffer.from('first-host-key')), true);
	assert.equal(verify(Buffer.from('changed-host-key')), false);
	assert.ok(JSON.parse(readFileSync(process.env.SSH_HOST_KEYS_FILE, 'utf8')).vm1);
});
