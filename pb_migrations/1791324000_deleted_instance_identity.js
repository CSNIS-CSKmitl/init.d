// Preserve the guest identity when an instance is soft-deleted.
migrate((app) => {
	const collection = app.findCollectionByNameOrId('instances');
	for (const field of [
		{ name: 'deleted_vmid', type: 'number', required: false, onlyInt: true, min: 0 },
		{ name: 'deleted_node', type: 'text', required: false, max: 128 },
		{ name: 'deleted_ip', type: 'text', required: false, max: 128 },
		{ name: 'deleted_mac', type: 'text', required: false, max: 32 },
	]) {
		if (!collection.fields.getByName(field.name)) collection.fields.add(field);
	}
	app.save(collection);
}, (app) => {
	const collection = app.findCollectionByNameOrId('instances');
	for (const name of ['deleted_vmid', 'deleted_node', 'deleted_ip', 'deleted_mac']) {
		const field = collection.fields.getByName(name);
		if (field) collection.fields.removeById(field.id);
	}
	app.save(collection);
});
