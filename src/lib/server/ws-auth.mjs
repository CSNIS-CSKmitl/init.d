import PocketBase from 'pocketbase';
import { consoleGrantInstanceId, verifyConsoleGrant } from './console-grant.mjs';
import { isAppAdmin } from '../role.mjs';

/** @param {import('node:http').IncomingMessage} request @param {string | undefined} expectedOrigin */
export function isAllowedOrigin(request, expectedOrigin) {
	if (!expectedOrigin || typeof request.headers.origin !== 'string') return false;
	try {
		return new URL(request.headers.origin).origin === new URL(expectedOrigin).origin;
	} catch {
		return false;
	}
}

/** @param {string | undefined} header @param {string} name */
export function readCookie(header, name) {
	const value = String(header || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
	if (!value) return null;
	try {
		return decodeURIComponent(value.slice(name.length + 1));
	} catch {
		return null;
	}
}

/** @param {import('node:http').IncomingMessage} request @param {string | undefined} pocketbaseUrl */
export async function authenticateSocket(request, pocketbaseUrl) {
	const raw = readCookie(request.headers.cookie, 'pb_auth');
	if (!raw || !pocketbaseUrl) return null;
	try {
		const stored = JSON.parse(raw);
		if (typeof stored?.token !== 'string' || typeof stored?.record?.id !== 'string') return null;
		const pb = new PocketBase(pocketbaseUrl);
		pb.autoCancellation(false);
		pb.authStore.save(stored.token, null);
		const refreshed = await pb.collection('users').authRefresh();
		if (refreshed.record?.id !== stored.record.id) return null;
		const user = await pb.collection('users').getOne(refreshed.record.id, { expand: 'user_type' });
		return {
			pb,
			userId: user.id,
			// Only this application's admin role grants admin access.
			isAdmin: isAppAdmin(user.expand?.user_type?.type)
		};
	} catch {
		return null;
	}
}

/** @param {NonNullable<Awaited<ReturnType<typeof authenticateSocket>>>} auth @param {string | null} instanceId */
export async function authorizedInstance(auth, instanceId) {
	if (typeof instanceId !== 'string' || !instanceId) return null;
	try {
		const item = await auth.pb.collection('instances').getOne(instanceId);
		const owners = Array.isArray(item.owners) ? item.owners : [];
		return auth.isAdmin || item.email === auth.userId || owners.includes(auth.userId) ? item : null;
	} catch {
		return null;
	}
}

/** @param {import('node:http').IncomingMessage} request @param {NonNullable<Awaited<ReturnType<typeof authenticateSocket>>>} auth @param {string | undefined} secret */
export async function authorizeConsoleSocket(request, auth, secret) {
	const requestUrl = request.url || '';
	const grant = new URL(requestUrl, 'http://internal').searchParams.get('grant');
	const rawPath = requestUrl.replace(/&grant=[^&]+$/, '');
	const match = rawPath.match(/^\/proxmox-ws\/api2\/json\/nodes\/[^/]+\/(qemu|lxc)\/(\d+)\/vncwebsocket\?port=\d+&vncticket=[^&]+$/);
	const pveAuthCookie = readCookie(request.headers.cookie, 'PVEAuthCookie');
	if (!match || !grant || !pveAuthCookie || /[\r\n;]/.test(pveAuthCookie) ||
		!verifyConsoleGrant(secret, grant, { userId: auth.userId, path: rawPath })) return null;
	const instance = await authorizedInstance(auth, consoleGrantInstanceId(grant));
	if (!instance || Number(instance.vmid) !== Number(match[2]) || (instance.type === 'vm' ? 'qemu' : 'lxc') !== match[1]) return null;
	return { targetPath: rawPath.slice('/proxmox-ws'.length), pveAuthCookie };
}
