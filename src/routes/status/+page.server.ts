// Status page — show requests filed by the user and requests shared with them.

import { redirect, error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { LeaseInstance } from '$lib/types';
import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';
import { addOwnerEmails, adminPb, canManageOwners, resolveOwnerIds } from '$lib/server/instance-owners';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');

	const email = locals.user.email;

	try {
		const instanceCollection = locals.pb.collection('instances');
		const options = { sort: '-created', expand: 'passion_group,email,owners' };
		// A single OR filter across email and owners.id produces incorrect
		// results in PocketBase after owners are added. Query each relation
		// independently and merge by record ID.
		const [requested, shared] = await Promise.all([
			instanceCollection.getFullList<LeaseInstance>({
				...options,
				filter: locals.pb.filter('email = {:id}', { id: locals.user.id })
			}),
			instanceCollection.getFullList<LeaseInstance>({
				...options,
				filter: locals.pb.filter('owners.id ?= {:id}', { id: locals.user.id })
			})
		]);
		const unique = [...new Map([...requested, ...shared].map((item) => [item.id, item])).values()]
			.sort((a, b) => b.created.localeCompare(a.created));
		return { items: await addOwnerEmails(await adminPb(), unique), email, userId: locals.user.id };
	} catch (cause) {
		console.error('[status] Failed to load instances:', cause);
		throw error(502, 'Could not load your VM/CT list. Please retry.');
	}
};

export const actions: Actions = {
	owners: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Unauthorized');
		const fd = await request.formData();
		const id = String(fd.get('id') ?? '').trim();
		const ownerEmails = String(fd.get('owner_emails') ?? '');
		if (!id) return fail(400, { id, ownerError: 'Missing request ID.' });
		const record = await locals.pb.collection('instances').getOne<LeaseInstance>(id).catch(() => null);
		if (!record || !canManageOwners(record, locals.user.id, locals.user.role === 'admin')) {
			return fail(403, { id, ownerError: 'Only the requester can manage co-owners.' });
		}
		try {
			const pb = await adminPb();
			const owners = await resolveOwnerIds(pb, ownerEmails, record.email);
			await pb.collection('instances').update(id, { owners });
		} catch (e) {
			return fail(400, { id, ownerEmails, ownerError: e instanceof Error ? e.message : 'Could not save co-owners.' });
		}
		throw redirect(303, `/status#${id}`);
	},
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

