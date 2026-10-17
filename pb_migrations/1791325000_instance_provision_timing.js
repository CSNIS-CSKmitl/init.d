// Persist provisioning timestamps so duration statistics survive restarts.
migrate((app) => {
	const collection = app.findCollectionByNameOrId('instances');
	for (const name of ['provision_started_at', 'provision_completed_at']) {
		if (!collection.fields.getByName(name)) collection.fields.add({ name, type: 'date' });
	}
	app.save(collection);
}, (app) => {
	// Keep historical timing data on rollback.
	const collection = app.findCollectionByNameOrId('instances');
	app.save(collection);
});
