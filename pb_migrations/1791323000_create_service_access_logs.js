migrate((app) => {
	const users = app.findCollectionByNameOrId('users');
	const logs = new Collection({
		type: 'base',
		name: 'service_access_logs',
		listRule: null,
		viewRule: null,
		createRule: null,
		updateRule: null,
		deleteRule: null,
		fields: [
			{ type: 'text', name: 'service', required: true, max: 64 },
			{ type: 'relation', name: 'user', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
			{ type: 'text', name: 'source_ip', max: 64 },
			{ type: 'text', name: 'method', max: 16 },
			{ type: 'text', name: 'path', max: 512 },
			{ type: 'text', name: 'action', required: true, max: 64 },
			{ type: 'number', name: 'status_code', min: 100, max: 599 },
			{ type: 'text', name: 'user_agent', max: 512 },
			{ type: 'text', name: 'request_id', max: 128 },
			{ type: 'json', name: 'metadata', maxSize: 4096 },
			{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
		],
		indexes: [
			'CREATE INDEX idx_service_access_logs_created ON service_access_logs (created)',
			'CREATE INDEX idx_service_access_logs_service_created ON service_access_logs (service, created)',
			'CREATE INDEX idx_service_access_logs_user_created ON service_access_logs (user, created)'
		]
	});
	app.save(logs);
}, (app) => {
	try { app.delete(app.findCollectionByNameOrId('service_access_logs')); } catch (_) { /* already removed */ }
});
