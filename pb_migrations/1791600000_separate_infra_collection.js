/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
	const instances = app.findCollectionByNameOrId('instances');

	// 1. Create instance_infra collection if not exists
	let infra;
	try {
		infra = app.findCollectionByNameOrId('instance_infra');
	} catch (_) {
		infra = new Collection({
			type: 'base',
			name: 'instance_infra',
			listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
			fields: [
				{ type: 'relation', name: 'instance', collectionId: instances.id, maxSelect: 1, required: true, cascadeDelete: true },
				{ type: 'text', name: 'instance_ref', max: 64 },
				{ type: 'number', name: 'vmid' },
				{ type: 'text', name: 'node', max: 64 },
				{ type: 'text', name: 'ip', max: 64 },
				{ type: 'text', name: 'provision_state', max: 64 },
				{ type: 'text', name: 'provision_error', max: 4096 },
				{ type: 'date', name: 'provision_started_at' },
				{ type: 'date', name: 'provision_completed_at' },
				{ type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
				{ type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_inst_infra_inst ON instance_infra (instance)',
				'CREATE INDEX idx_inst_infra_vmid_node ON instance_infra (vmid, node)'
			]
		});
		app.save(infra);
	}

	// 2. Data Migration: Copy existing infra data from instances to instance_infra
	const records = app.findRecordsByFilter('instances', 'id != ""', 'id', 500, 0);
	for (const rec of records) {
		let existingInfra;
		try {
			existingInfra = app.findFirstRecordByFilter('instance_infra', 'instance = {:id}', { id: rec.id });
		} catch (_) {}

		if (!existingInfra) {
			const infraRec = new Record(infra);
			infraRec.set('instance', rec.id);
			infraRec.set('instance_ref', rec.id);
			infraRec.set('vmid', rec.getInt('vmid') || 0);
			infraRec.set('node', rec.getString('node') || '');
			infraRec.set('ip', rec.getString('IP') || '');
			infraRec.set('provision_state', rec.getString('provision_state') || '');
			infraRec.set('provision_error', rec.getString('provision_error') || '');
			infraRec.set('provision_started_at', rec.getString('provision_started_at') || '');
			infraRec.set('provision_completed_at', rec.getString('provision_completed_at') || '');
			app.save(infraRec);
		}
	}

	// 3. Remove obsolete infra fields and admin reply from instances collection
	const fieldsToRemove = [
		'vmid',
		'node',
		'IP',
		'provision_state',
		'provision_error',
		'provision_started_at',
		'provision_completed_at',
		'admin_reply',
		'admin_reply_at'
	];

	for (const fName of fieldsToRemove) {
		const field = instances.fields.getByName(fName);
		if (field) {
			instances.fields.removeByName(fName);
		}
	}

	app.save(instances);
}, (app) => {});
