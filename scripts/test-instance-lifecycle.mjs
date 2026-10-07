import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { instanceStateFields } from './instance-state-schema.mjs';

async function loadTS(path) {
	const source = readFileSync(new URL(path, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
	return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { startInstanceProvisioning, deleteInstance, instanceIsBusy } = await loadTS('../src/lib/server/instance-lifecycle.ts');
const { leaseBadgeStatus } = await loadTS('../src/lib/leaseStatus.ts');
const record = (extra = {}) => ({ id: 'test', status: 'pending', provision_state: '', vmid: 0, ...extra });
function database(initial, failDelete = false) {
	const saved = { ...initial };
	const events = [];
	return { saved, events, pb: { collection: () => ({
		update: async (_id, patch) => { events.push('update'); Object.assign(saved, patch); return { ...saved }; },
		delete: async () => { events.push('delete'); if (failDelete) throw new Error('DB unavailable'); },
	}) } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const noop = () => {};

test('auto failure persists state and error across a page refresh', async () => {
	const db = database(record());
	await startInstanceProvisioning(db.pb, record(), { vmid: 123, node: 3 }, async () => {}, async () => { throw new Error('Clone failed'); }, noop, noop, noop);
	await flush();
	assert.equal(db.saved.status, 'failed');
	assert.equal(db.saved.provision_state, 'failed');
	assert.equal(db.saved.provision_error, 'Clone failed');
	assert.equal(db.saved.vmid, 123);
	assert.equal(leaseBadgeStatus(db.saved, undefined), 'failed');
	assert.equal(instanceIsBusy('test'), false);
});

test('retry clears failure and only reports completion after saving the result', async () => {
	const initial = record({ status: 'failed', provision_state: 'failed', provision_error: 'old error' });
	const db = database(initial);
	let finish;
	const job = new Promise(resolve => { finish = resolve; });
	const progress = [];
	await startInstanceProvisioning(db.pb, initial, { vmid: 124, node: 4 }, async () => {}, () => job, status => progress.push(status), noop, noop);
	assert.equal(db.saved.provision_state, 'provisioning');
	assert.equal(db.saved.provision_error, '');
	await assert.rejects(startInstanceProvisioning(db.pb, initial, { vmid: 125, node: 5 }, async () => {}, () => job, noop, noop, noop), /already in progress/);
	await assert.rejects(deleteInstance(db.pb, initial, async () => {}), /current operation/);
	finish({ ipAddress: '192.168.15.124' });
	await flush();
	assert.equal(db.saved.status, 'completed');
	assert.equal(db.saved.IP, '192.168.15.124');
	assert.equal(progress.at(-1), 'Complete');
	assert.equal(leaseBadgeStatus(db.saved, { status: 'Failed' }), 'completed');
});

test('collision fails without changing the old VM binding or cloning a guest', async () => {
	const initial = record({ vmid: 111 });
	const db = database(initial);
	await assert.rejects(startInstanceProvisioning(db.pb, initial, { vmid: 123, node: 3 }, async () => { throw new Error('VMID occupied'); }, () => assert.fail('must not clone'), noop, noop, noop), /occupied/);
	assert.equal(db.saved.vmid, 111);
	assert.equal(db.saved.status, 'failed');
	assert.equal(instanceIsBusy('test'), false);
});

test('a failed Proxmox deletion retains the record and its binding for admin recovery', async () => {
	const initial = record({ status: 'completed', provision_state: 'completed', vmid: 123 });
	const db = database(initial);
	await assert.rejects(deleteInstance(db.pb, initial, async () => { throw new Error('delete task failed'); }), /delete task failed/);
	assert.equal(db.saved.status, 'failed');
	assert.equal(db.saved.provision_state, 'delete_failed');
	assert.equal(db.saved.provision_error, 'delete task failed');
	assert.equal(db.saved.vmid, 123);
	assert.ok(!db.events.includes('delete'));
});

test('the database row is deleted only after Proxmox deletion completes', async () => {
	const initial = record({ status: 'completed', vmid: 123 });
	const db = database(initial);
	await deleteInstance(db.pb, initial, async () => { db.events.push('proxmox-deleted'); });
	assert.ok(db.events.indexOf('delete') > db.events.indexOf('proxmox-deleted'));
	assert.equal(db.saved.vmid, 0);
});

test('DB deletion failure after guest removal revokes the old VM binding', async () => {
	const initial = record({ status: 'completed', vmid: 123, IP: '192.168.1.123' });
	const db = database(initial, true);
	await assert.rejects(deleteInstance(db.pb, initial, async () => {}), /DB unavailable/);
	assert.equal(db.saved.status, 'failed');
	assert.equal(db.saved.provision_state, 'deleted');
	assert.equal(db.saved.vmid, 0);
	assert.equal(db.saved.IP, '');
});

test('schema upgrade is idempotent and preserves relations and existing field types', () => {
	const original = [
		{ id: 'status', name: 'status', type: 'select', values: ['pending', 'completed', 'failed'] },
		{ id: 'state', name: 'provision_state', type: 'text' },
		{ id: 'node', name: 'node', type: 'number' },
		{ id: 'owners', name: 'owners', type: 'relation', collectionId: 'users', maxSelect: 10 },
	];
	const upgraded = instanceStateFields(original);
	assert.deepEqual(instanceStateFields(upgraded), upgraded);
	assert.deepEqual(upgraded.find(f => f.name === 'owners'), original[3]);
	assert.deepEqual(upgraded.find(f => f.name === 'node'), original[2]);
	assert.equal(upgraded.filter(f => f.name === 'provision_state').length, 1);
	assert.equal(original.some(f => f.name === 'provision_error'), false);
});
