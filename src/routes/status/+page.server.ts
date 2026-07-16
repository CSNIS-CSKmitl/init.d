// Status page — queries PocketBase filtered by the logged-in user's
// email so users only see rows they themselves filed.

import { redirect, error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { LeaseInstance } from '$lib/types';
import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');

	const email = locals.user.email;

	try {
		const list = await locals.pb.collection('instances').getList<LeaseInstance>(1, 200, {
			filter: `email = "${locals.user.id}"`,
			sort: '-created',
			expand: 'passion_group,email'
		});
		return { items: list.items, email };
	} catch {
		return { items: [], email };
	}
};

export const actions: Actions = {
	cancel: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');

		const fd = await request.formData();
		const id = String(fd.get('id') ?? '').trim();
		if (!id) return fail(400, { error: 'Missing id.' });

		try {
			// 1. Get the instance to verify ownership
			const record = await locals.pb.collection('instances').getOne<LeaseInstance>(id);
			if (record.email !== locals.user.id && locals.user.role !== 'admin') {
				return fail(403, { error: 'You are not authorized to cancel this request.' });
			}

			if (record.status !== 'pending') {
				return fail(400, { error: 'Only pending requests can be canceled.' });
			}

			// 2. Authenticate as admin to delete (regular users can't delete)
			const pbAdmin = new PocketBase(env.POCKETBASE_URL);
			pbAdmin.autoCancellation(false);
			await pbAdmin.admins.authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASSWORD);

			await pbAdmin.collection('instances').delete(id);
			return { success: true };
		} catch (e) {
			console.error('Cancel failed:', e);
			return fail(500, { error: 'Failed to cancel request.' });
		}
	}
};

