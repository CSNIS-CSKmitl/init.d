// Server endpoint that accepts the PocketBase auth record returned by
// the client-side `authWithOAuth2` flow and writes the same `pb_auth`
// cookie that password login would set. After that, the user is
// redirected home — the user record was auto-created by PB on first
// OAuth login (or matched against an existing one).
//
// New OAuth users arrive with an empty `user_type` relation (PB has
// no way to know which type to assign on first login). We default-
// assign the `DEFAULT_USER_TYPE_ID` row so the navbar / role checks
// work on the very next request.

import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';
import { AUTH_COOKIE } from '$lib/constants';

// ID of the `user_type` row that should be linked to new OAuth users
// when their record has no type yet. Must already exist in PB.
const DEFAULT_USER_TYPE_ID = '000000000000001';

const ROLE_MAP: Record<string, string> = {
	student: '000000000000001',
	teacher: '000000000000002',
	guest: '000000000000003',
	staff: '000000000000004'
};

interface RecordModel {
	id: string;
	collectionId?: string;
	collectionName?: string;
	email?: string;
	username?: string;
	user_type?: string | null;
	[key: string]: unknown;
}

interface OAuthCompletePayload {
	token: string;
	record: RecordModel;
	meta?: {
		accessToken?: string;
		rawUser?: {
			role?: string;
			[key: string]: unknown;
		};
		[key: string]: unknown;
	};
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	const payload = (await request.json()) as OAuthCompletePayload;
	if (!payload?.token || !payload?.record?.id) {
		return json({ ok: false, error: 'invalid payload' }, { status: 400 });
	}

	let record = payload.record;

	// Auto-assign the default user_type on first-time OAuth login.
	// The `user_type` relation is empty on a fresh PB-created record
	// and must be filled in via the admin client (the user themselves
	// usually can't write to a relation field).
	if (!record.user_type && env.PB_ADMIN_EMAIL && env.PB_ADMIN_PASSWORD) {
		try {
			const pbAdmin = new PocketBase(env.POCKETBASE_URL);
			pbAdmin.autoCancellation(false);
			await pbAdmin.admins.authWithPassword(
				env.PB_ADMIN_EMAIL,
				env.PB_ADMIN_PASSWORD
			);

			let userTypeId = DEFAULT_USER_TYPE_ID;
			console.log('[auth/oidc] Initializing OIDC role mapping. Incoming meta:', JSON.stringify(payload.meta));

			let rawRole: string | null = null;

			// 🔒 Secure verification: fetch user info directly from IAM server using the access token
			if (payload.meta?.accessToken) {
				try {
					const userInfoUrl = env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo';
					console.log('[auth/oidc] Fetching userinfo from OIDC provider URL:', userInfoUrl);
					const res = await fetch(userInfoUrl, {
						headers: {
							Authorization: `Bearer ${payload.meta.accessToken}`
						}
					});
					if (res.ok) {
						const rawUser = await res.json() as Record<string, any>;
						console.log('[auth/oidc] Successfully fetched userinfo from OIDC provider. Data:', JSON.stringify(rawUser));
						if (rawUser.profile?.role) {
							rawRole = String(rawUser.profile.role);
						} else if (rawUser.role) {
							rawRole = String(rawUser.role);
						}
					} else {
						const errText = await res.text().catch(() => '');
						console.error(`[auth/oidc] OIDC provider returned status ${res.status} when fetching user info. Body:`, errText);
					}
				} catch (fetchErr) {
					console.error('[auth/oidc] Failed to fetch userinfo from OIDC provider:', fetchErr);
				}
			} else {
				console.warn('[auth/oidc] No accessToken found in meta payload!');
			}

			// Fallback to client-provided metadata if backend fetch failed or accessToken is missing
			if (!rawRole) {
				const fallbackProfileRole = (payload.meta?.rawUser as Record<string, any>)?.profile?.role;
				console.log('[DEBUG] Fallback evaluation. rawUser type:', typeof payload.meta?.rawUser, 'rawUser.profile.role:', fallbackProfileRole, 'rawUser.role:', payload.meta?.rawUser?.role, 'meta.role:', payload.meta?.role);
				
				if (fallbackProfileRole) {
					rawRole = String(fallbackProfileRole);
					console.log(`[auth/oidc] Fallback: Using client-provided rawUser.profile.role: "${rawRole}"`);
				} else if (payload.meta?.rawUser?.role) {
					rawRole = String(payload.meta.rawUser.role);
					console.log(`[auth/oidc] Fallback: Using client-provided rawUser.role: "${rawRole}"`);
				} else if (payload.meta?.role) {
					rawRole = String(payload.meta.role);
					console.log(`[auth/oidc] Fallback: Using client-provided meta.role: "${rawRole}"`);
				}
			}

			if (rawRole) {
				const lowerRole = rawRole.toLowerCase();
				if (ROLE_MAP[lowerRole]) {
					userTypeId = ROLE_MAP[lowerRole];
				} else {
					console.warn(`[auth/oidc] Role "${lowerRole}" not found in ROLE_MAP. Keys are:`, Object.keys(ROLE_MAP));
				}
			} else {
				console.warn('[auth/oidc] Could not determine user role from either backend fetch or client metadata!');
			}

			console.log(`[auth/oidc] Assigning user_type: "${userTypeId}" to user ID: "${record.id}"`);

			const updated = (await pbAdmin
				.collection('users')
				.update(record.id, { user_type: userTypeId })) as RecordModel;
			record = updated;
		} catch (e) {
			console.error('[auth/oidc] failed to set default user_type:', e);
		}
	}

	cookies.set(
		AUTH_COOKIE,
		JSON.stringify({ token: payload.token, record }),
		{
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !import.meta.env.DEV,
			maxAge: 60 * 60 * 24 * 7
		}
	);
	return json({ ok: true });
};

export const GET: RequestHandler = async () => {
	// Direct visits to this URL are pointless — bounce home.
	throw redirect(303, '/');
};
