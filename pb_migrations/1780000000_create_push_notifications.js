migrate((app) => {
	const users = app.findCollectionByNameOrId('users');
	const devices = new Collection({
		type: 'base',
		name: 'push_devices',
		listRule: null,
		viewRule: null,
		createRule: null,
		updateRule: null,
		deleteRule: null,
		fields: [
			{ type: 'relation', name: 'user', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
			{ type: 'text', name: 'installation_id', required: true, max: 64 },
			{ type: 'text', name: 'fcm_target_id', required: true, max: 256, hidden: true },
			{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
			{ type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
		],
		indexes: ['CREATE UNIQUE INDEX idx_push_devices_installation ON push_devices (installation_id)'],
	});
	app.save(devices);

	const notices = new Collection({
		type: 'base',
		name: 'push_notices',
		listRule: 'user = @request.auth.id',
		viewRule: 'user = @request.auth.id',
		createRule: null,
		updateRule: null,
		deleteRule: null,
		fields: [
			{ type: 'relation', name: 'user', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
			{ type: 'text', name: 'service', required: true, max: 16 },
			{ type: 'text', name: 'record_id', required: true, max: 32 },
			{ type: 'text', name: 'title', required: true, max: 120 },
			{ type: 'text', name: 'previous_status', max: 60 },
			{ type: 'text', name: 'status', required: true, max: 60 },
			{ type: 'bool', name: 'delivered' },
			{ type: 'number', name: 'attempts', min: 0 },
			{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
			{ type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
		],
		indexes: ['CREATE INDEX idx_push_notices_user_created ON push_notices (user, created DESC)'],
	});
	app.save(notices);
}, (app) => {
	for (const name of ['push_notices', 'push_devices']) {
		try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) { /* already removed */ }
	}
});
