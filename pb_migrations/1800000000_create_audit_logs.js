// Shared immutable audit trail for all CS services.
migrate((app) => {
	let existing;
	try { existing = app.findCollectionByNameOrId('audit_logs'); } catch (_) { /* create below */ }
	if (existing) {
		for (const field of [
			{ type: 'text', name: 'collection', max: 64 },
			{ type: 'text', name: 'actor_id', max: 64 }
		]) if (!existing.fields.getByName(field.name)) existing.fields.add(field);
		app.save(existing);
		return;
	}
	const users = app.findCollectionByNameOrId('users');
	const logs = new Collection({
		type: 'base', name: 'audit_logs',
		listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
		fields: [
			{ type: 'text', name: 'service', required: true, max: 64 },
			{ type: 'text', name: 'collection', required: true, max: 64 },
			{ type: 'text', name: 'record_id', required: true, max: 64 },
			{ type: 'text', name: 'action', required: true, max: 32 },
			{ type: 'relation', name: 'actor', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
			{ type: 'text', name: 'actor_id', max: 64 },
			{ type: 'json', name: 'before', maxSize: 20000 },
			{ type: 'json', name: 'after', maxSize: 20000 },
			{ type: 'json', name: 'metadata', maxSize: 4096 },
			{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false }
		],
		indexes: [
			'CREATE INDEX idx_audit_logs_created ON audit_logs (created)',
			'CREATE INDEX idx_audit_logs_collection_record ON audit_logs (collection, record_id, created)',
			'CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id, created)'
		]
	});
	app.save(logs);
}, (app) => {
	try { app.delete(app.findCollectionByNameOrId('audit_logs')); } catch (_) { /* already removed */ }
});
