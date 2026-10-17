export function instanceStateFields(current) {
	const fields = structuredClone(current);
	const status = fields.find(field => field.name === 'status');
	if (!status || status.type !== 'select') throw new Error('instances.status must be a select field.');
	status.values = [...new Set([...(status.values ?? []), 'pending', 'completed', 'failed', 'deleted'])];
	for (const field of [
		{ name: 'provision_state', type: 'text', required: false, max: 64 },
		{ name: 'provision_error', type: 'text', required: false, max: 4096 },
		{ name: 'IP', type: 'text', required: false, max: 128 },
		{ name: 'vmid', type: 'number', required: false, onlyInt: true, min: 0 },
		{ name: 'node', type: 'number', required: false, onlyInt: true, min: 0 },
		{ name: 'provision_started_at', type: 'date', required: false },
		{ name: 'provision_completed_at', type: 'date', required: false },
		{ name: 'datedelete', type: 'date', required: false },
		{ name: 'deleted_vmid', type: 'number', required: false, onlyInt: true, min: 0 },
		{ name: 'deleted_node', type: 'text', required: false, max: 128 },
		{ name: 'deleted_ip', type: 'text', required: false, max: 128 },
		{ name: 'deleted_mac', type: 'text', required: false, max: 32 },
	]) {
		const existingIndex = fields.findIndex(existing => existing.name === field.name);
		if (existingIndex === -1) {
			fields.push(field);
		} else if (field.type === 'date' && fields[existingIndex].type !== 'date') {
			fields[existingIndex] = field;
		}
	}
	const state = fields.find(field => field.name === 'provision_state');
	if (state.type === 'select') {
		state.values = [...new Set([...(state.values ?? []), 'pending', 'provisioning', 'completed', 'failed', 'deleting', 'deleted', 'delete_failed'])];
	} else if (state.type !== 'text') {
		throw new Error('instances.provision_state must be text or select.');
	}
	return fields;
}
