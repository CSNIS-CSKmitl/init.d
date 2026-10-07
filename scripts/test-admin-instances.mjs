import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { isIP } from 'node:net';

function loadModule(path, dependencies) {
	const source = readFileSync(new URL(path, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
	const module = { exports: {} };
	new Function('require', 'module', 'exports', outputText)(name => {
		if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
		return dependencies[name];
	}, module, module.exports);
	return module.exports;
}

function guestAPI({ type = 'qemu', name = 'lease-vm', template = false, running = true, taskError = false, missing = false } = {}) {
	const calls = [];
	const target = {
		config: { $get: async () => ({ name, hostname: name, template }) },
		status: {
			current: { $get: async () => ({ status: running ? 'running' : 'stopped' }) },
			stop: { $post: async () => { calls.push('stop'); return 'stop-task'; } },
		},
		$delete: async () => { calls.push('delete'); return 'delete-task'; },
	};
	const api = {
		cluster: { resources: { $get: async () => missing ? [] : [{ vmid: 123, type, node: 'pve6' }] } },
		nodes: { $: node => {
			calls.push(`node:${node}`);
			return {
				qemu: { $: () => target }, lxc: { $: () => target },
				tasks: { $: task => ({ status: { $get: async () => {
					calls.push(`wait:${task}`);
					return { status: 'stopped', exitstatus: taskError ? 'ERROR' : 'OK' };
				} } }) },
			};
		} },
	};
	const { removeProxmoxInstance } = loadModule('../src/lib/proxmox.ts', {
		'proxmox-api': () => api,
		undici: { Agent: class {}, fetch: () => assert.fail('No network in tests') },
		dotenv: { config() {} },
		'$static/constant': { CT_ID: new Map(), VM_ID: new Map() },
		'./discord': {}, './server/instance-lifecycle': {},
	});
	return { removeProxmoxInstance, calls };
}
const lease = { id: 'lease', type: 'vm', hostname: 'lease-vm', vmid: 123, node: 3 };

test('VM deletion follows the actual cluster node and waits for stop and delete tasks', async () => {
	const { removeProxmoxInstance, calls } = guestAPI();
	await removeProxmoxInstance(lease);
	assert.deepEqual(calls, ['node:pve6', 'stop', 'node:pve6', 'wait:stop-task', 'delete', 'node:pve6', 'wait:delete-task']);
});

test('deletion refuses templates, reused VMIDs, and mismatched guest types', async () => {
	for (const [options, message] of [
		[{ template: true }, /Templates/], [{ name: 'another-owner' }, /hostname does not match/], [{ type: 'lxc' }, /different guest type/],
	]) {
		const { removeProxmoxInstance, calls } = guestAPI(options);
		await assert.rejects(removeProxmoxInstance(lease), message);
		assert.ok(!calls.includes('delete'));
		assert.ok(!calls.includes('stop'));
	}
});

test('failed stop task never triggers deletion', async () => {
	const { removeProxmoxInstance, calls } = guestAPI({ taskError: true });
	await assert.rejects(removeProxmoxInstance(lease), /ERROR/);
	assert.ok(!calls.includes('delete'));
});

test('CTs and absent guests can be deleted without targeting an unrelated VM', async () => {
	const ct = guestAPI({ type: 'lxc', running: false });
	await ct.removeProxmoxInstance({ ...lease, type: 'container' });
	assert.ok(ct.calls.includes('delete'));
	const absent = guestAPI({ missing: true });
	await absent.removeProxmoxInstance(lease);
	assert.deepEqual(absent.calls, []);
});

function adminActions(extra = {}) {
	const updates = [];
	let removed = false;
	const pb = { collection: () => ({
		getOne: async () => ({ ...lease, status: 'completed', ...extra }),
		update: async (_id, patch) => { updates.push(patch); return patch; },
	}) };
	const actions = loadModule('../src/routes/admin/+page.server.ts', {
		'@sveltejs/kit': {
			error: (status, message) => Object.assign(new Error(message), { status }),
			fail: (status, data) => ({ status, data }), redirect() {},
		},
		'$lib/proxmox': { provisioningProgress: new Map(), removeProxmoxInstance: async () => { removed = true; } },
		'$lib/discord': {}, pocketbase: {}, '$env/dynamic/private': { env: {} },
		'$lib/server/instance-owners': { adminPb: async () => pb },
		'$lib/server/instance-lifecycle': {
			instanceIsBusy: () => false,
			instanceIsDeleted: record => record.status === 'deleted' || record.provision_state === 'deleted',
			deleteInstance: async (_pb, _record, remove) => remove(),
		},
		'node:net': { isIP },
	}).actions;
	const event = (fields, role = 'admin') => {
		const fd = new FormData();
		for (const [key, value] of Object.entries(fields)) fd.set(key, value);
		return { locals: { user: role ? { role } : null }, request: { formData: async () => fd } };
	};
	return { actions, updates, event, removed: () => removed };
}

test('admin actions deny normal users and anonymous requests', async () => {
	const { actions, event } = adminActions();
	for (const action of ['update', 'resolve', 'delete']) {
		for (const role of ['user', null]) await assert.rejects(actions[action](event({ id: 'lease' }, role)), { status: 403 });
	}
});

test('IP edits accept IPv4, IPv6 and clearing; invalid addresses cannot reach the DB', async () => {
	const { actions, updates, event } = adminActions();
	const fields = { id: 'lease', cpu: '2', ram: '4', disk: '20', vmid: '123', node: '3' };
	for (const ip of ['192.168.15.10', '2001:db8::10', '']) {
		const response = await actions.update(event({ ...fields, IP: ip }));
		assert.equal(response.ok, true);
		assert.equal(updates.at(-1).IP, ip);
	}
	const response = await actions.update(event({ ...fields, IP: '999.1.2.3' }));
	assert.equal(response.status, 400);
	assert.equal(updates.length, 3);
});

test('deletion requires the exact server-side hostname confirmation', async () => {
	const { actions, event, removed } = adminActions();
	assert.equal((await actions.delete(event({ id: 'lease', confirm_hostname: 'wrong' }))).status, 400);
	assert.equal(removed(), false);
	assert.equal((await actions.delete(event({ id: 'lease', confirm_hostname: 'lease-vm' }))).deleted, true);
	assert.equal(removed(), true);
});

test('deleted history cannot be edited or resolved through forged admin submissions', async () => {
	const { actions, updates, event } = adminActions({ status: 'deleted', provision_state: 'deleted' });
	const fields = { id: 'lease', cpu: '2', ram: '4', disk: '20', vmid: '123', node: '3' };
	assert.equal((await actions.update(event(fields))).status, 409);
	assert.equal((await actions.resolve(event({ id: 'lease', mode: 'manual' }))).status, 409);
	assert.equal((await actions.resolve(event({ ...fields, mode: 'auto', storage: 'local-lvm' }))).status, 409);
	assert.deepEqual(updates, []);
});
