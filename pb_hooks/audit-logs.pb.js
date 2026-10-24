// Database-level audit trail. This covers mutations from init.d, Booking,
// Printer-server, Borrowly and Android clients in one place.
const AUDITED = new Set(['instances', 'bookings', 'loan_requests', 'print_jobs', 'rooms', 'items', 'announcements']);
const SERVICE = {
	instances: 'initd', bookings: 'booking', loan_requests: 'borrowly',
	print_jobs: 'printer-server', rooms: 'booking', items: 'borrowly', announcements: 'announcements'
};
const OMIT = new Set(['password', 'passwordConfirm', 'token', 'refreshToken', 'accessToken']);

function snapshot(record) {
	const result = {};
	for (const field of record.collection().fields || []) {
		const name = field.name;
		if (OMIT.has(name) || name === 'created' || name === 'updated') continue;
		try { result[name] = record.get(name); } catch (_) { /* ignore unsupported field */ }
	}
	return result;
}

function actorId(event) {
	try { return event.auth?.collectionName === 'users' ? event.auth.id : ''; } catch (_) { return ''; }
}

function writeAudit(event, action, before, after) {
	const name = event.record.collection().name;
	if (!AUDITED.has(name)) return;
	try {
		const collection = event.app.findCollectionByNameOrId('audit_logs');
		const log = new Record(collection);
		const actor = actorId(event);
		const has = (field) => collection.fields.getByName(field) != null;
		if (has('service')) log.set('service', SERVICE[name]);
		if (has('collection')) log.set('collection', name);
		if (has('record_id')) log.set('record_id', event.record.id);
		if (has('action')) log.set('action', action);
		if (actor && has('actor')) log.set('actor', actor);
		if (actor && has('actor_id')) log.set('actor_id', actor);
		if (before && has('before')) log.set('before', before);
		if (after && has('after')) log.set('after', after);
		if (has('metadata')) log.set('metadata', { status: after?.status || before?.status || null });
		event.app.save(log);
	} catch (error) {
		event.app.logger().error('Audit log write failed', 'collection', name, 'recordId', event.record.id, 'error', error);
	}
}

onRecordAfterCreateSuccess((e) => { writeAudit(e, 'create', null, snapshot(e.record)); e.next(); });
onRecordAfterUpdateSuccess((e) => {
		const before = snapshot(e.record.original());
		const after = snapshot(e.record);
		const action = before.status !== after.status ? `status:${before.status || ''}->${after.status || ''}` : 'update';
		writeAudit(e, action, before, after); e.next();
});
onRecordAfterDeleteSuccess((e) => { writeAudit(e, 'delete', snapshot(e.record), null); e.next(); });
