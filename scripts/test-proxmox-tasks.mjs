import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForProxmoxTask, timedOutTask, recoveredTaskProgress } from '../src/lib/server/proxmox-tasks.mjs';

const upid = 'UPID:pve6:00302422:0B338C65:6ACDE08C:qmigrate:748:root@pam!init-d:';
const record = { status: 'failed', vmid: 748, provision_error: `Timed out waiting for task ${upid}. Check Proxmox before retrying.` };

test('migration can keep running beyond the old ten-minute deadline and then succeed', async () => {
	let polls = 0;
	let elapsed = 0;
	await waitForProxmoxTask(async () => {
		polls++;
		return elapsed > 60 * 60 * 1000 ? { status: 'stopped', exitstatus: 'OK' } : { status: 'running' };
	}, { sleep: async () => { elapsed += 2000; } });
	assert.ok(elapsed > 60 * 60 * 1000);
	assert.ok(polls > 1800);
});

test('a status read failure does not fail or restart the remote operation', async () => {
	let polls = 0;
	let unavailable = 0;
	await waitForProxmoxTask(async () => {
		if (++polls < 4) throw new Error('Temporary API outage');
		return { status: 'stopped', exitstatus: 'OK' };
	}, { sleep: async () => {}, onUnavailable: () => { unavailable++; } });
	assert.equal(unavailable, 3);
	assert.equal(polls, 4);
});

test('failure is reported only after Proxmox stops with an unsuccessful exit status', async () => {
	await assert.rejects(waitForProxmoxTask(async () => ({ status: 'stopped', exitstatus: 'migration failed' })), /migration failed/);
	let polls = 0;
	await waitForProxmoxTask(async () => ++polls < 3 ? { status: 'stopped' } : { status: 'stopped', exitstatus: 'OK' }, { sleep: async () => {} });
	assert.equal(polls, 3);
});

test('legacy timeout recovery is bound to the correct VMID and source node', () => {
	assert.deepEqual(timedOutTask(record), { upid, node: 'pve6', type: 'qmigrate' });
	assert.equal(timedOutTask({ ...record, vmid: 749 }), null);
	assert.equal(timedOutTask({ ...record, status: 'completed' }), null);
	assert.equal(timedOutTask({ ...record, provision_error: 'A different failure' }), null);
});

test('running and unconfirmed legacy tasks stay blocked; task completion still needs verification', () => {
	assert.equal(recoveredTaskProgress({ status: 'running' }).taskState, 'running');
	assert.equal(recoveredTaskProgress(null).taskState, 'unknown');
	assert.equal(recoveredTaskProgress({ status: 'stopped', exitstatus: 'OK' }).taskState, 'stopped-ok');
	assert.match(recoveredTaskProgress({ status: 'stopped', exitstatus: 'OK' }).status, /Automatically checking/);
	assert.equal(recoveredTaskProgress({ status: 'stopped', exitstatus: 'failed' }).status, 'Failed');
});
