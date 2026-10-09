// Server-side PocketBase client.
// One client per request — auth is restored from the `pb_auth` cookie
// that SvelteKit forwards. Used by +page.server.ts / +server.ts files.

import PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { requiredEnv } from '$lib/server/env';
import type { RequestEvent } from '@sveltejs/kit';
import { AUTH_COOKIE } from '../constants';

interface StoredAuth {
	token: string;
	record: RecordModel;
}

export function createPb(event: RequestEvent): PocketBase {
	const pb = new PocketBase(requiredEnv('POCKETBASE_URL'));
	// Disable auto-cancellation so concurrent calls in one request don't
	// cancel each other (e.g. during form re-renders).
	pb.autoCancellation(false);

	// The cookie holds the JSON-serialized {token, record} pair written by
	// a previous request (or by authWithPassword on this one).
	const raw = event.cookies.get(AUTH_COOKIE);
	if (raw) {
		try {
			const parsed = JSON.parse(raw) as StoredAuth;
			if (parsed?.token) {
				pb.authStore.save(parsed.token, parsed.record);
			}
		} catch {
			event.cookies.delete(AUTH_COOKIE, { path: '/' });
		}
	}

	// Persist any auth changes (login, refresh, logout) back to the cookie.
	pb.authStore.onChange((token, record) => {
		if (!token) {
			event.cookies.delete(AUTH_COOKIE, { path: '/' });
			return;
		}
		event.cookies.set(AUTH_COOKIE, JSON.stringify({ token, record }), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !import.meta.env.DEV,
			maxAge: 60 * 60 * 24 * 7
		});
	}, true);

	return pb;
}
