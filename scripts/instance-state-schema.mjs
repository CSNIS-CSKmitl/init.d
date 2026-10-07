export function instanceStateFields(current) {
	const fields = structuredClone(current);
	const status = fields.find(field => field.name === 'status');
	if (!status || status.type !== 'select') throw new Error('instances.status must be a select field.');
	status.values = [...new Set([...(status.values ?? []), 'pending', 'completed', 'failed'])];
	for (const field of [
		{ name: 'provision_state', type: 'text', required: false, max: 64 },
		{ name: 'provision_error', type: 'text', required: false, max: 4096 },
		{ name: 'IP', type: 'text', required: false, max: 128 },
		{ name: 'vmid', type: 'number', required: false, onlyInt: true, min: 0 },
		{ name: 'node', type: 'number', required: false, onlyInt: true, min: 0 },
	]) {
		if (!fields.some(existing => existing.name === field.name)) fields.push(field);
	}
	const state = fields.find(field => field.name === 'provision_state');
	if (state.type === 'select') {
		state.values = [...new Set([...(state.values ?? []), 'pending', 'provisioning', 'completed', 'failed', 'deleting', 'deleted', 'delete_failed'])];
	} else if (state.type !== 'text') {
		throw new Error('instances.provision_state must be text or select.');
	}
	return fields;
}
