import assert from 'node:assert/strict';
import { planNodeUpdates } from './sync-instance-nodes.mjs';

const records = [
	{ id: 'moved-vm', type: 'vm', vmid: 101, node: 1 },
	{ id: 'moved-ct', type: 'container', vmid: 201, node: 2 },
	{ id: 'unchanged', type: 'vm', vmid: 102, node: 3 },
	{ id: 'missing', type: 'container', vmid: 202, node: 4 },
	{ id: 'wrong-type', type: 'vm', vmid: 203, node: 4 },
	{ id: 'ambiguous', type: 'vm', vmid: 104, node: 1 },
	{ id: 'duplicate-a', type: 'container', vmid: 204, node: 1 },
	{ id: 'duplicate-b', type: 'container', vmid: 204, node: 2 },
	{ id: 'unsupported-node', type: 'vm', vmid: 105, node: 1 }
];
const guests = [
	{ type: 'qemu', vmid: 101, node: 'pve5' },
	{ type: 'lxc', vmid: 201, node: 'pve6' },
	{ type: 'qemu', vmid: 102, node: 'pve3' },
	{ type: 'lxc', vmid: 203, node: 'pve4' },
	{ type: 'qemu', vmid: 104, node: 'pve2' },
	{ type: 'qemu', vmid: 104, node: 'pve3' },
	{ type: 'lxc', vmid: 204, node: 'pve4' },
	{ type: 'qemu', vmid: 105, node: 'other-node' }
];

const result = planNodeUpdates(records, guests);
assert.deepEqual(result.updates, [
	{ id: 'moved-vm', type: 'qemu', vmid: 101, from: 'pve1', to: 'pve5', node: 5 },
	{ id: 'moved-ct', type: 'lxc', vmid: 201, from: 'pve2', to: 'pve6', node: 6 }
]);
assert.equal(result.skipped.length, 6);
for (const reason of ['missing from Proxmox', 'ambiguous Proxmox match', 'duplicate database ID', 'unsupported node']) {
	assert.ok(result.skipped.some((item) => item.includes(reason)), `Expected ${reason}`);
}
console.log('PASS: unique VM/CT migrations update; unchanged and uncertain records stay untouched');
