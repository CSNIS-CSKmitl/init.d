// Admin dashboard server logic:
//   1. Guards non-admins.
//   2. Loads the initial snapshot of lease requests.
//   3. Exposes a `resolve` action that flips status to "completed".

import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { LeaseInstance } from '$lib/types';
import { createCT, createVM, startProvisioning } from '$lib/proxmox';
import { sendDiscordNotification } from '$lib/discord';
import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	if (locals.user.role !== 'admin') throw error(403, 'Admin access required.');

	try {
		// Use PocketBase superuser client because regular clients cannot see 
		// the email field of other users when emailVisibility is set to false.
		const pbAdmin = new PocketBase(env.POCKETBASE_URL);
		pbAdmin.autoCancellation(false);
		let loggedIn = false;
		try {
			await pbAdmin.collection('_superusers').authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASSWORD);
			loggedIn = true;
		} catch (e) {
			await pbAdmin.admins.authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASSWORD);
		}

		const list = await pbAdmin.collection('instances').getList<LeaseInstance>(1, 500, {
			sort: '-created',
			expand: 'passion_group,email'
		});

		return { items: list.items };
	} catch (e) {
		console.error('admin load failed', e);
		return { items: [] };
	}
};

export const actions: Actions = {
	update: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Admin only.');

		const fd = await request.formData();
		const id = String(fd.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing id.', recordId: id });

		const cpu = Number(fd.get('cpu'));
		const ram = Number(fd.get('ram'));
		const disk = Number(fd.get('disk'));
		const portsRaw = String(fd.get('ports') ?? '').trim();
		const vmidRaw = String(fd.get('vmid') ?? '').trim();
		const nodeRaw = String(fd.get('node') ?? '').trim();

		const vmid = vmidRaw.length > 0 ? Number(vmidRaw) : null;
		const node = nodeRaw.length > 0 ? Number(nodeRaw) : null;

		if (![cpu, ram, disk].every((value) => Number.isFinite(value))) {
			return fail(400, { error: 'Specs must be valid numbers.', recordId: id });
		}
		if (vmidRaw.length > 0 && !Number.isFinite(vmid)) {
			return fail(400, { error: 'VMID must be a valid number.', recordId: id });
		}
		if (nodeRaw.length > 0 && !Number.isFinite(node)) {
			return fail(400, { error: 'Node must be a valid number.', recordId: id });
		}

		try {
			await locals.pb.collection('instances').update(id, {
				specs: { cpu, ram, disk },
				ports: portsRaw.length > 0 ? portsRaw : null,
				vmid,
				node
			});
			return { ok: true, id, recordId: id };
		} catch (e) {
			console.error('admin update failed', e);
			return fail(500, { error: 'Could not update instance.', recordId: id });
		}
	},
	resolve: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Admin only.');

		const fd = await request.formData();
		const id = String(fd.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing id.' });
		const mode = String(fd.get('mode') ?? 'manual');
		const vmidRaw = String(fd.get('vmid') ?? '').trim();
		const nodeRaw = String(fd.get('node') ?? '').trim();
		const storage = String(fd.get('storage') ?? '').trim();

		try {
			if (mode === 'auto') {
				if (!vmidRaw) return fail(400, { error: 'Missing vmid.', recordId: id });
				if (!nodeRaw) return fail(400, { error: 'Missing node.', recordId: id });
				if (!storage) return fail(400, { error: 'Missing storage.', recordId: id });

				const vmid = Number(vmidRaw);
				const node = Number(nodeRaw);
				if (!Number.isInteger(vmid) || vmid < 1) {
					return fail(400, { error: 'VMID must be a valid number.', recordId: id });
				}
				if (!Number.isInteger(node) || node < 1) {
					return fail(400, { error: 'Node must be a valid number.', recordId: id });
				}

				const record = await locals.pb.collection('instances').getOne<LeaseInstance>(id, { expand: 'email' });
				const network = 'vmbr1';
				const detail = {
					...record,
					vmid,
					cores: record.specs.cpu,
					memory: record.specs.ram,
				};

				startProvisioning(locals.pb, id, detail, network, storage, `pve${node}`, vmid, record.type);
				return { ok: true, id, recordId: id, mode, started: true };
			}

			const record = await locals.pb.collection('instances').update<LeaseInstance>(id, { status: 'completed' }, { expand: 'email' });
			sendDiscordNotification('completed', record).catch((err) =>
				console.error('Failed to send discord notification:', err)
			);
			return { ok: true, id, recordId: id, mode };
		} catch (e) {
			console.error('resolve failed', e);
			return fail(500, { error: 'Could not update instance.', recordId: id });
		}
	},
	reply: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Admin only.');

		const fd = await request.formData();
		const id = String(fd.get('id') ?? '');
		const clear = fd.get('clear') === '1';
		const reply = String(fd.get('reply') ?? '').trim();

		if (!id) return fail(400, { error: 'Missing id.' });

		// Clearing empties both fields. Sending empty `reply` without the
		// `clear` flag is treated as a no-op rather than a save — the
		// textarea would otherwise wipe a real reply if the user clicked
		// Save with an empty field by mistake.
		const patch = clear
			? { admin_reply: '', admin_reply_at: null }
			: reply.length > 0
				? { admin_reply: reply, admin_reply_at: new Date().toISOString() }
				: null;
		if (!patch) return fail(400, { error: 'Reply is empty.' });
		if (!clear && reply.length > 4096) return fail(400, { error: 'Reply too long.' });

		try {
			await locals.pb.collection('instances').update(id, patch);
			return { ok: true, id, cleared: clear };
		} catch (e) {
			console.error('reply failed', e);
			return fail(500, { error: 'Could not save reply.' });
		}
	}
};
