function sendNotice(app, notice) {
	const secret = String($os.getenv('PUSH_RELAY_SECRET') || '');
	if (!secret) return false;
	const devices = app.findRecordsByFilter('push_devices', 'user = {:user}', '', 100, 0, {
		user: notice.getString('user'),
	});
	if (devices.length === 0) return true;
	let allSent = true;
	for (const device of devices) {
		try {
			const response = $http.send({
				url: 'http://127.0.0.1:8181/send',
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-push-relay-secret': secret,
				},
				body: JSON.stringify({
				token: device.getString('fcm_target_id'),
					eventId: notice.id,
					userId: notice.getString('user'),
					service: notice.getString('service'),
					recordId: notice.getString('record_id'),
					title: notice.getString('title'),
					previousStatus: notice.getString('previous_status'),
					status: notice.getString('status'),
					createdAt: String(Date.parse(notice.getString('created')) || Date.now()),
				}),
				timeout: 8,
			});
			if (response.statusCode !== 200) allSent = false;
		} catch (err) {
			allSent = false;
			app.logger().error('Push relay failed', 'noticeId', notice.id, 'error', err);
		}
	}
	return allSent;
}

module.exports = { sendNotice };
