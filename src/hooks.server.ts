// SvelteKit server hook — runs on every request.
// Resolves the authenticated `users` record into `event.locals.user`.

import type { Handle } from '@sveltejs/kit';
import { createPb } from '$lib/pb/server';
import type { UserRole } from '$lib/types';

interface UserTypeRef {
	type?: string;
}

interface UserRecord {
	id: string;
	email: string;
	name?: string;
	username?: string;
	user_type?: string | null;
	expand?: { user_type?: UserTypeRef };
}

function resolveRole(record: UserRecord): UserRole {
	// PB returns expanded relations under `expand.<field>`, NOT inline on
	// the field itself. `user_type` stays as the relation ID, the actual
	// record lives at `record.expand.user_type`.
	const expanded = record.expand?.user_type;
	const typeName = expanded?.type ?? null;
	if (typeName && ['admin', 'staff', 'superadmin'].includes(typeName.toLowerCase())) {
		return 'admin';
	}
	return 'user';
}

function resolveEmail(record: UserRecord): string {
	if (record.email) return record.email;
	if (record.username) return `${record.username}@cskmitl.internal`;
	return 'unknown@cskmitl.internal';
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.pb = createPb(event);

	const pb = event.locals.pb;
	if (pb.authStore.isValid) {
		try {
			// authRefresh lives in `users` (the regular auth collection).
			// Follow up with a getOne that expands `user_type` so the role
			// check can read its `type` field.
			await pb.collection('users').authRefresh();
			const userId = pb.authStore.record?.id;
			if (!userId) throw new Error('no user id in auth store');
			const full = (await pb.collection('users').getOne(userId, {
				expand: 'user_type'
			})) as unknown as UserRecord;
			event.locals.user = {
				id: full.id,
				email: resolveEmail(full),
				name: full.name ?? full.username,
				username: full.username,
				role: resolveRole(full)
			};
		} catch {
			pb.authStore.clear();
			event.locals.user = null;
		}
	} else {
		event.locals.user = null;
	}

	return resolve(event);
};

