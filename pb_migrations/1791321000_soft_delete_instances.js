// Keep deleted leases as history, including the date of guest removal.
migrate((app) => {
	const collection = app.findCollectionByNameOrId('instances');
	const status = collection.fields.getByName('status');
	if (!status || status.type !== 'select') throw new Error('instances.status must be select.');
	status.values = [...new Set([...status.values, 'deleted'])];
	const state = collection.fields.getByName('provision_state');
	if (state?.type === 'select') state.values = [...new Set([...state.values, 'deleted'])];
	if (!collection.fields.getByName('datedelete')) {
		collection.fields.add({ name: 'datedelete', type: 'date', required: false });
	}
	app.save(collection);
}, (app) => {
	// Preserve deletion history when rolling application code back.
	app.save(app.findCollectionByNameOrId('instances'));
});
