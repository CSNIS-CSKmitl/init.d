/// <reference path="../pb_data/types.d.ts" />

// Append-only history of admin decisions on instances (approve / reject / delete).
migrate((app) => {
	try { app.findCollectionByNameOrId('instance_admin_actions'); return; } catch (_) {}
	const users = app.findCollectionByNameOrId('users');
	const instances = app.findCollectionByNameOrId('instances');
	const collection = new Collection({
		type: 'base',
		name: 'instance_admin_actions',
		// Superuser only: null rules deny all non-superuser access.
		listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
		fields: [
			{ type: 'relation', name: 'instance', collectionId: instances.id, maxSelect: 1, required: false, cascadeDelete: false },
			{ type: 'text', name: 'instance_ref', max: 64 },
			{ type: 'text', name: 'hostname', max: 256 },
			{ type: 'relation', name: 'actor', collectionId: users.id, maxSelect: 1, required: false, cascadeDelete: false },
			{ type: 'select', name: 'action', required: true, maxSelect: 1, values: ['approve', 'reject', 'delete'] },
			{ type: 'json', name: 'metadata', maxSize: 20000 },
			{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false }
		]
	});
	app.save(collection);
}, (app) => {
	try { app.delete(app.findCollectionByNameOrId('instance_admin_actions')); } catch (_) {}
});
