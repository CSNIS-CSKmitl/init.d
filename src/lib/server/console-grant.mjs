import { createHmac, timingSafeEqual } from 'node:crypto';

/** @param {string} secret @param {string} payload */
function signature(secret, payload) {
	return createHmac('sha256', secret).update('init.d-console-grant-v1:').update(payload).digest('base64url');
}

/** @param {string | undefined} secret @param {{ instanceId: string, userId: string, path: string }} details */
export function createConsoleGrant(secret, details) {
	if (!secret) throw new Error('Console grant secret is not configured.');
	const body = Buffer.from(JSON.stringify({ ...details, expires: Date.now() + 60_000 })).toString('base64url');
	return `${body}.${signature(secret, body)}`;
}

/** @param {string | undefined} secret @param {string | null} grant @param {{ userId: string, path: string }} expected */
export function verifyConsoleGrant(secret, grant, expected) {
	if (!secret || typeof grant !== 'string') return false;
	const parts = grant.split('.');
	if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
	const actual = Buffer.from(parts[1]);
	const valid = Buffer.from(signature(secret, parts[0]));
	if (actual.length !== valid.length || !timingSafeEqual(actual, valid)) return false;
	try {
		const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
		return data.userId === expected.userId &&
			data.path === expected.path &&
			typeof data.instanceId === 'string' &&
			Number.isFinite(data.expires) && data.expires > Date.now() && data.expires <= Date.now() + 60_000;
	} catch {
		return false;
	}
}

/** @param {string | null} grant */
export function consoleGrantInstanceId(grant) {
	if (!grant) return null;
	try {
		return JSON.parse(Buffer.from(grant.split('.')[0], 'base64url').toString('utf8')).instanceId;
	} catch {
		return null;
	}
}
