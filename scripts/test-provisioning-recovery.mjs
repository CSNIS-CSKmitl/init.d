import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import ts from 'typescript';
import * as tasks from '../src/lib/server/proxmox-tasks.mjs';

function load(path, dependencies, globals = {}) {
	const source = readFileSync(new URL(path, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
	const module = { exports: {} };
	new Function('require', 'module', 'exports', ...Object.keys(globals), outputText)(name => {
		assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
		return dependencies[name];
	}, module, module.exports, ...Object.values(globals));
	return module.exports;
}
const recovery = load('../src/lib/server/provisioning-recovery.ts', {
	'node:net': { isIP }, './proxmox-tasks.mjs': tasks,
});
const upid = 'UPID:pve6:00302422:0B338C65:6ACDE08C:qmigrate:748:root@pam!init-d:';
const lease = {
	id: 'lease', status: 'failed', provision_state: 'failed', vmid: 748, node: 5,
	hostname: 'lease-vm', type: 'vm', specs: { cpu: 2, ram: 4, disk: 20 }, updated: 'version-1',
	provision_error: `Timed out waiting for task ${upid}. Check Proxmox before retrying.`,
	owners: ['co-owner'], admin_reply: 'Keep this message',
};
const snapshot = {
	taskStatus: { status: 'stopped', exitstatus: 'OK' },
	vmid: 748, node: 'pve5', type: 'qemu', hostname: 'lease-vm', locked: false, template: false,
	cores: 2, memoryMiB: 4096, disk: 'storage:vm-748-disk-0,size=21G',
	network: 'virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr1,tag=15', ipv4: ['192.168.15.23'],
};

test('a completed migration with matching VM configuration produces a completion patch automatically', () => {
	const { patch } = recovery.verifiedMigrationPatch(lease, snapshot);
	assert.ok(patch);
	assert.ok(Number.isFinite(Date.parse(patch.provision_completed_at)));
	assert.deepEqual(patch, {
		status: 'completed', provision_state: 'completed', provision_error: '',
		provision_completed_at: patch.provision_completed_at, IP: '192.168.15.23', node: 5,
	});
});

test('task success alone cannot complete the wrong, locked, undersized or misconfigured VM', () => {
	for (const change of [
		{ taskStatus: { status: 'running' } }, { taskStatus: { status: 'stopped', exitstatus: 'failed' } },
		{ vmid: 749 }, { node: 'pve6' }, { type: 'lxc' }, { hostname: 'another-vm' },
		{ locked: true }, { template: true }, { cores: 1 }, { memoryMiB: 2048 },
		{ disk: 'size=10G' }, { disk: 'size=invalid' }, { disk: 'size=1.2.3G' },
		{ network: 'virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr2,tag=15' },
		{ network: 'virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr1,tag=99' },
		{ ipv4: [] }, { ipv4: ['127.0.0.1', '169.254.1.2', '224.1.1.1'] },
	]) assert.equal(recovery.verifiedMigrationPatch(lease, { ...snapshot, ...change }).patch, undefined);
});

function database(initial = lease, commitThenThrow = false) {
	const saved = structuredClone(initial);
	const updates = [];
	const collection = {
		getOne: async () => structuredClone(saved),
		getFullList: async () => saved.status === 'failed' ? [structuredClone(saved)] : [],
		update: async (_id, patch) => {
			updates.push(patch);
			Object.assign(saved, patch, { updated: 'version-2' });
			if (commitThenThrow) throw new Error('Lost response after DB commit');
			return structuredClone(saved);
		},
	};
	return { saved, updates, pb: { collection: () => collection } };
}

test('completion preserves owners and admin replies, and is idempotent', async () => {
	const db = database();
	const { patch } = recovery.verifiedMigrationPatch(lease, snapshot);
	assert.equal((await recovery.commitVerifiedRecovery(db.pb, lease, patch)).changed, true);
	assert.equal((await recovery.commitVerifiedRecovery(db.pb, lease, patch)).changed, false);
	assert.equal(db.updates.length, 1);
	assert.deepEqual(db.saved.owners, lease.owners);
	assert.equal(db.saved.admin_reply, lease.admin_reply);
});

test('a lease changed during verification is never overwritten', async () => {
	const { patch } = recovery.verifiedMigrationPatch(lease, snapshot);
	for (const change of [{ updated: 'changed' }, { status: 'deleted' }, { vmid: 749 }, { provision_error: 'Changed failure' }]) {
		const db = database({ ...lease, ...change });
		assert.equal((await recovery.commitVerifiedRecovery(db.pb, lease, patch)).completed, false);
		assert.equal(db.updates.length, 0);
	}
});

test('a lost update response is verified against persisted state', async () => {
	const db = database(lease, true);
	const { patch } = recovery.verifiedMigrationPatch(lease, snapshot);
	assert.equal((await recovery.commitVerifiedRecovery(db.pb, lease, patch)).completed, true);
	assert.equal(db.updates.length, 1);
});

test('background recovery reads the existing VM and completes once without any VM mutation', async () => {
	const db = database();
	let tick;
	let notifications = 0;
	const vm = {
		config: { $get: async () => ({ name: 'lease-vm', cores: 2, sockets: 1, memory: '4096', scsi0: snapshot.disk, net0: snapshot.network }) },
		agent: { 'network-get-interfaces': { $get: async () => ({ result: [
			{ 'hardware-address': '11:22:33:44:55:66', 'ip-addresses': [{ 'ip-address-type': 'ipv4', 'ip-address': '172.17.0.1' }] },
			{ 'hardware-address': 'aa:bb:cc:dd:ee:ff', 'ip-addresses': [{ 'ip-address-type': 'ipv4', 'ip-address': '192.168.15.23' }] },
		] }) } },
		status: { stop: { $post: () => assert.fail('Never stop the VM') }, start: { $post: () => assert.fail('Never restart the VM') } },
		clone: { $post: () => assert.fail('Never clone the VM') }, migrate: { $post: () => assert.fail('Never migrate the VM') },
	};
	const api = {
		cluster: { resources: { $get: async () => [{ vmid: 748, node: 'pve5', type: 'qemu' }] } },
		nodes: { $: () => ({ tasks: { $: () => ({ status: { $get: async () => snapshot.taskStatus } }) }, qemu: { $: () => vm } }) },
	};
	const { startProvisioningRecovery } = load('../src/lib/proxmox.ts', {
		'proxmox-api': () => api, undici: { Agent: class {}, fetch: () => assert.fail('No external network') },
		dotenv: { config() {} }, '$static/constant': { CT_ID: new Map(), VM_ID: new Map() },
		'./discord': { sendDiscordNotification: async type => { assert.equal(type, 'completed'); notifications++; } },
		'./server/instance-lifecycle': { instanceIsBusy: () => false },
		'./server/proxmox-tasks.mjs': tasks, './server/provisioning-recovery': recovery,
		'./server/instance-owners': { adminPb: async () => db.pb },
	}, {
		setInterval: (fn, ms) => { assert.equal(ms, 30000); tick = fn; return { unref() {} }; },
		setTimeout: () => ({ unref() {} }), process: { env: {} },
	});
	startProvisioningRecovery();
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(db.saved.status, 'completed');
	assert.equal(db.saved.IP, '192.168.15.23');
	assert.equal(notifications, 1);
	tick();
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(db.updates.length, 1);
	assert.equal(notifications, 1);
});
