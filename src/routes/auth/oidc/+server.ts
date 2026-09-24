import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';
import { AUTH_COOKIE } from '$lib/constants';

// PocketBase handles the complete OAuth2 flow. This endpoint only persists the
// PocketBase session as an HttpOnly cookie for server-rendered pages.
const DEFAULT_STUDENT_TYPE_ID = '000000000000001';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const payload = await request.json().catch(() => null);
	const token = payload?.token;
	const claimedId = payload?.record?.id;
	if (typeof token !== 'string' || typeof claimedId !== 'string') {
		return json({ error: 'Missing PocketBase credentials.' }, { status: 400 });
	}

	try {
		const pb = new PocketBase(env.POCKETBASE_URL);
		pb.autoCancellation(false);
		pb.authStore.save(token, null);
		const refreshed = await pb.collection('users').authRefresh();
		let record = refreshed.record;
		if (!record?.id || record.id !== claimedId) {
			return json({ error: 'PocketBase account does not match.' }, { status: 401 });
		}

		if (!record.user_type) {
			const service = new PocketBase(env.POCKETBASE_URL);
			service.autoCancellation(false);
			await service.admins.authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASSWORD);
			record = await service.collection('users').update(record.id, { user_type: DEFAULT_STUDENT_TYPE_ID });
		}

		cookies.set(AUTH_COOKIE, JSON.stringify({ token: refreshed.token, record }), {
			path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:',
			maxAge: 60 * 60 * 24 * 7
		});
		return json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
	} catch (cause) {
		console.error('[auth/oidc] PocketBase sign-in failed:', cause instanceof Error ? cause.message : cause);
		return json({ error: 'Could not complete PocketBase sign-in.' }, { status: 503 });
	}
};

export const GET: RequestHandler = async () => {
	throw redirect(303, '/');
};
