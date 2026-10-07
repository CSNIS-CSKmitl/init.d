// Add provisioning metadata without replacing the existing instances schema or rules.
migrate((app) => {
	const collection = app.findCollectionByNameOrId('instances');
	const status = collection.fields.getByName('status');
	if (!status || status.type !== 'select') throw new Error('instances.status must be select.');
	status.values = [...new Set([...status.values, 'failed'])];
	for (const definition of [
		{ name: 'provision_state', type: 'text', max: 64 },
		{ name: 'provision_error', type: 'text', max: 4096 },
		{ name: 'IP', type: 'text', max: 128 },
		{ name: 'vmid', type: 'number', onlyInt: true, min: 0 },
		{ name: 'node', type: 'number', onlyInt: true, min: 0 },
	]) {
		if (!collection.fields.getByName(definition.name)) collection.fields.add(definition);
	}
	const state = collection.fields.getByName('provision_state');
	if (state.type === 'select') {
		state.values = [...new Set([...state.values, 'pending', 'provisioning', 'completed', 'failed', 'deleting', 'deleted', 'delete_failed'])];
	}
	app.save(collection);
}, (app) => {
	// Preserve fields and failure history on rollback to avoid losing operational data.
	const collection = app.findCollectionByNameOrId('instances');
	app.save(collection);
});
