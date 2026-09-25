// Deploy on the PocketBase host with the push collections migration.
// The app authenticates with PocketBase as usual; the relay secret never goes to Android.

routerAdd('POST', '/api/cskmitl/push/register', (e) => {
	const data = new DynamicModel({ installationId: '', targetId: '' });
	e.bindBody(data);
	if (!/^[a-f0-9-]{36}$/i.test(data.installationId) ||
		typeof data.targetId !== 'string' || data.targetId.length < 20 || data.targetId.length > 4096) {
		throw new BadRequestError('Invalid push device');
	}
	let device;
	try {
		device = e.app.findFirstRecordByFilter('push_devices', 'installation_id = {:id}', { id: data.installationId });
	} catch (_) {
		device = new Record(e.app.findCollectionByNameOrId('push_devices'));
		device.set('installation_id', data.installationId);
	}
	device.set('user', e.auth.id);
	device.set('fcm_target_id', data.targetId);
	e.app.save(device);
	return e.json(200, { ok: true });
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/cskmitl/push/unregister', (e) => {
	const data = new DynamicModel({ installationId: '', targetId: '' });
	e.bindBody(data);
	if (!/^[a-f0-9-]{36}$/i.test(data.installationId) || typeof data.targetId !== 'string') {
		throw new BadRequestError('Invalid push device');
	}
	try {
		const device = e.app.findFirstRecordByFilter('push_devices', 'installation_id = {:id}', { id: data.installationId });
		if (device.getString('user') === e.auth.id && device.getString('fcm_target_id') === data.targetId) {
			e.app.delete(device);
		}
	} catch (_) { /* idempotent removal */ }
	return e.json(200, { ok: true });
}, $apis.requireAuth('users'));

onRecordAfterUpdateSuccess((e) => {
	const before = e.record.original().getString('status');
	const after = e.record.getString('status');
	e.next();
	if (!before || !after || before === after) return;
	try {
		const source = e.record.collection().name;
		const services = { instances: 'INSTANCES', bookings: 'BOOKINGS', loan_requests: 'BORROW', print_jobs: 'PRINT' };
		const service = services[source];
		if (!service) return;
		let owners = [];
		let title = '';
		if (source === 'instances') {
			owners = [e.record.getString('email')].concat(e.record.getStringSlice('owners'));
			title = e.record.getString('hostname') || 'VM / CT';
		} else if (source === 'bookings') {
			owners = [e.record.getString('booker_id')];
			title = e.record.getString('title') || 'การจอง';
		} else if (source === 'loan_requests') {
			owners = [e.record.getString('requester')];
			title = 'คำขอยืม #' + e.record.id.slice(0, 6);
		} else {
			owners = [e.record.getString('user')];
			title = e.record.getString('filename') || 'งานพิมพ์';
		}
		const helpers = require(`${__hooks}/push_helpers.js`);
		const collection = e.app.findCollectionByNameOrId('push_notices');
		for (const userId of [...new Set(owners.filter(Boolean))]) {
			try {
				const notice = new Record(collection);
				notice.set('user', userId);
				notice.set('service', service);
				notice.set('record_id', e.record.id);
				notice.set('title', title.slice(0, 120));
				notice.set('previous_status', before.slice(0, 60));
				notice.set('status', after.slice(0, 60));
				e.app.save(notice);
				const sent = helpers.sendNotice(e.app, notice);
				notice.set('attempts', 1);
				notice.set('delivered', sent);
				e.app.save(notice);
			} catch (err) {
				e.app.logger().error('Status push owner failed', 'userId', userId, 'error', err);
			}
		}
	} catch (err) {
		e.app.logger().error('Status push failed', 'collection', e.record.collection().name, 'recordId', e.record.id, 'error', err);
	}
}, 'instances', 'bookings', 'loan_requests', 'print_jobs');

cronAdd('retry-status-push', '* * * * *', () => {
	const helpers = require(`${__hooks}/push_helpers.js`);
	const pending = $app.findRecordsByFilter('push_notices', 'delivered = false && attempts < 100', 'created', 50, 0);
	for (const notice of pending) {
		try {
			const sent = helpers.sendNotice($app, notice);
			notice.set('attempts', notice.getInt('attempts') + 1);
			notice.set('delivered', sent);
			$app.save(notice);
		} catch (err) {
			$app.logger().error('Push retry failed', 'noticeId', notice.id, 'error', err);
		}
	}
});
