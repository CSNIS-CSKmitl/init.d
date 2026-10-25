/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
	const users = app.findCollectionByNameOrId('users');
	const instances = app.findCollectionByNameOrId('instances');

	// 1. Create instance_deletion_history collection if not exists
	let deletions;
	try {
		deletions = app.findCollectionByNameOrId('instance_deletion_history');
	} catch (_) {
		deletions = new Collection({
			type: 'base',
			name: 'instance_deletion_history',
			listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
			fields: [
				{ type: 'relation', name: 'instance', collectionId: instances.id, maxSelect: 1, required: false, cascadeDelete: false },
				{ type: 'text', name: 'instance_ref', max: 64 },
				{ type: 'text', name: 'hostname', max: 256 },
				{ type: 'number', name: 'deleted_vmid' },
				{ type: 'text', name: 'deleted_node', max: 64 },
				{ type: 'text', name: 'deleted_ip', max: 64 },
				{ type: 'text', name: 'deleted_mac', max: 64 },
				{ type: 'date', name: 'deleted_at' },
				{ type: 'relation', name: 'deleted_by', collectionId: users.id, maxSelect: 1, required: false, cascadeDelete: false },
				{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false }
			],
			indexes: [
				'CREATE INDEX idx_inst_del_inst ON instance_deletion_history (instance)',
				'CREATE INDEX idx_inst_del_date ON instance_deletion_history (deleted_at)'
			]
		});
		app.save(deletions);
	}

	// 2. Data Migration: Copy existing deleted instances data to instance_deletion_history
	const deletedRecords = app.findRecordsByFilter('instances', 'status = "deleted" || datedelete != ""', 'id', 500, 0);
	for (const rec of deletedRecords) {
		let alreadyExists = false;
		try {
			const found = app.findFirstRecordByFilter('instance_deletion_history', 'instance_ref = {:id}', { id: rec.id });
			if (found) alreadyExists = true;
		} catch (_) {}

		if (!alreadyExists) {
			const dRec = new Record(deletions);
			dRec.set('instance', rec.id);
			dRec.set('instance_ref', rec.id);
			dRec.set('hostname', rec.getString('hostname'));
			dRec.set('deleted_vmid', rec.getInt('deleted_vmid'));
			dRec.set('deleted_node', rec.getString('deleted_node'));
			dRec.set('deleted_ip', rec.getString('deleted_ip'));
			dRec.set('deleted_mac', rec.getString('deleted_mac'));
			dRec.set('deleted_at', rec.getString('datedelete') || rec.getString('updated'));
			app.save(dRec);
		}
	}

	// 3. Remove obsolete fields from instances collection
	const fieldsToRemove = [
		'datedelete',
		'deleted_vmid',
		'deleted_node',
		'deleted_ip',
		'deleted_mac',
		'approved_by',
		'approved_at'
	];

	for (const fName of fieldsToRemove) {
		const field = instances.fields.getByName(fName);
		if (field) {
			instances.fields.removeByName(fName);
		}
	}

	app.save(instances);
}, (app) => {});
