migrate((app) => {
	try { app.findCollectionByNameOrId('instance_access_logs'); return; } catch (_) { /* create below */ }
	const users = app.findCollectionByNameOrId('users');
	const instances = app.findCollectionByNameOrId('instances');
	const logs = new Collection({
		type: 'base',
		name: 'instance_access_logs',
		listRule: null,
		viewRule: null,
		createRule: null,
		updateRule: null,
		deleteRule: null,
		fields: [
			{ type: 'relation', name: 'user', collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: false },
			{ type: 'relation', name: 'instance', collectionId: instances.id, maxSelect: 1, cascadeDelete: false },
			{ type: 'text', name: 'source_ip', max: 64 },
			{ type: 'text', name: 'action', required: true, max: 64 },
			{ type: 'text', name: 'path', max: 256 },
			{ type: 'text', name: 'user_agent', max: 512 },
			{ type: 'text', name: 'request_id', max: 128 },
			{ type: 'json', name: 'metadata', maxSize: 4096 },
			{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
		],
		indexes: [
			'CREATE INDEX idx_instance_access_logs_created ON instance_access_logs (created)',
			'CREATE INDEX idx_instance_access_logs_instance_created ON instance_access_logs (instance, created)',
			'CREATE INDEX idx_instance_access_logs_user_created ON instance_access_logs (user, created)'
		]
	});
	app.save(logs);
}, (app) => {
	try { app.delete(app.findCollectionByNameOrId('instance_access_logs')); } catch (_) { /* already removed */ }
});
