import { updateInstanceInfra, getInstanceWithInfra } from '$lib/server/instance-infra';
// Admin dashboard server logic:
//   1. Guards non-admins.
//   2. Loads the initial snapshot of lease requests.
//   3. Exposes a `resolve` action that flips status to "completed".

import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { LeaseInstance } from '$lib/types';
import { startProvisioning, removeProxmoxInstance, provisioningProgress, assertTimedOutTaskStopped } from '$lib/proxmox';
import { sendDiscordNotification } from '$lib/discord';
import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';
import { requiredEnv } from '$lib/server/env';
import { addOwnerEmails, adminPb } from '$lib/server/instance-owners';
import { deleteInstance, instanceIsBusy, instanceIsDeleted } from '$lib/server/instance-lifecycle';
import { writeInstanceAdminAction } from '$lib/server/audit-log';
import { isIP } from 'node:net';

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
			await pbAdmin.collection('_superusers').authWithPassword(requiredEnv('PB_ADMIN_EMAIL'), requiredEnv('PB_ADMIN_PASSWORD'));
			loggedIn = true;
		} catch (e) {
			await pbAdmin.admins.authWithPassword(requiredEnv('PB_ADMIN_EMAIL'), requiredEnv('PB_ADMIN_PASSWORD'));
		}

		// Load instances, infra, deletion, and approval histories in parallel.
		const [list, infraRecords, deletionRecords, adminActions] = await Promise.all([
			pbAdmin.collection('instances').getFullList<LeaseInstance>({
				batch: 200,
				sort: '-created',
				expand: 'passion_group,email,owners,created_by,updated_by'
			}),
			pbAdmin.collection('instance_infra').getFullList<{
				instance?: string;
				instance_ref?: string;
				vmid?: number;
				node?: string | number;
				ip?: string;
				provision_state?: string;
				provision_error?: string;
				provision_started_at?: string;
				provision_completed_at?: string;
			}>({ batch: 500 }).catch(() => []),
			pbAdmin.collection('instance_deletion_history').getFullList<{
				instance?: string;
				instance_ref?: string;
				deleted_vmid?: number;
				deleted_node?: string | number;
				deleted_ip?: string;
				deleted_mac?: string;
				deleted_at?: string;
			}>({ batch: 500 }).catch(() => []),
			pbAdmin.collection('instance_admin_actions').getFullList<{
				instance?: string;
				instance_ref?: string;
				action?: string;
				actor?: string;
				created?: string;
				expand?: Record<string, any>;
			}>({ filter: 'action = "approve"', sort: '-created', expand: 'actor', batch: 500 }).catch(() => [])
		]);

		const infraMap = new Map();
		for (const inf of infraRecords) {
			const key = inf.instance || inf.instance_ref;
			if (key && !infraMap.has(key)) infraMap.set(key, inf);
		}

		const deletionMap = new Map();
		for (const d of deletionRecords) {
			const key = d.instance || d.instance_ref;
			if (key && !deletionMap.has(key)) deletionMap.set(key, d);
		}

		const approvalMap = new Map();
		for (const a of adminActions) {
			const key = a.instance || a.instance_ref;
			if (key && !approvalMap.has(key)) approvalMap.set(key, a);
		}

		for (const item of list) {
			const inf = infraMap.get(item.id);
			if (inf) {
				item.vmid = inf.vmid ?? item.vmid;
				item.node = inf.node ?? item.node;
				item.IP = inf.ip ?? item.IP;
				item.provision_state = inf.provision_state ?? item.provision_state;
				item.provision_error = inf.provision_error ?? item.provision_error;
				item.provision_started_at = inf.provision_started_at ?? item.provision_started_at;
				item.provision_completed_at = inf.provision_completed_at ?? item.provision_completed_at;
			}
			const del = deletionMap.get(item.id);
			if (del) {
				item.deletion = del;
				item.datedelete = del.deleted_at || item.datedelete;
				item.deleted_vmid = del.deleted_vmid ?? item.deleted_vmid;
				item.deleted_node = del.deleted_node ?? item.deleted_node;
				item.deleted_ip = del.deleted_ip ?? item.deleted_ip;
				item.deleted_mac = del.deleted_mac ?? item.deleted_mac;
			}
			const apprv = approvalMap.get(item.id);
			if (apprv) {
				if (!item.expand) item.expand = {};
				item.expand.approved_by = apprv.expand?.actor || { id: apprv.actor, name: 'Admin' };
				(item as any).approved_at = apprv.created;
			}
		}

		return { items: await addOwnerEmails(pbAdmin, list), loadedAt: new Date().toISOString(), loadError: null };
	} catch (e) {
		console.error('admin load failed', e);
		return { items: [], loadedAt: new Date().toISOString(), loadError: 'ไม่สามารถดึงข้อมูลจากฐานข้อมูลได้' };
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
		const ip = String(fd.get('IP') ?? '').trim();
		if (ip && !isIP(ip)) return fail(400, { error: 'Enter a valid IPv4 or IPv6 address.', recordId: id });

		const vmid = vmidRaw.length > 0 ? Number(vmidRaw) : null;
		const node = nodeRaw.length > 0 ? Number(nodeRaw) : null;

		if (![cpu, ram, disk].every((value) => Number.isFinite(value))) {
			return fail(400, { error: 'Specs must be valid numbers.', recordId: id });
		}
		if (vmidRaw.length > 0 && (!Number.isInteger(vmid) || Number(vmid) < 1)) {
			return fail(400, { error: 'VMID must be a valid number.', recordId: id });
		}
		if (nodeRaw.length > 0 && (!Number.isInteger(node) || Number(node) < 1)) {
			return fail(400, { error: 'Node must be a valid number.', recordId: id });
		}

		try {
			const pb = await adminPb();
			const record = await getInstanceWithInfra(pb, id);
			if (instanceIsDeleted(record)) return fail(409, { error: 'Deleted leases are retained as history and cannot be edited.', recordId: id });
			await assertTimedOutTaskStopped(record);
			if (instanceIsBusy(id) || ['provisioning', 'deleting'].includes(record.provision_state ?? '')) {
				return fail(409, { error: 'Wait for the current operation to finish before editing.', recordId: id });
			}
			await pb.collection('instances').update(id, {
				updated_by: locals.user.id,
				specs: { cpu, ram, disk },
				ports: portsRaw.length > 0 ? portsRaw : null,
				vmid,
				node,
				IP: ip
			});
			await updateInstanceInfra(pb, id, { vmid, node, ip });
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
		if (!['manual', 'auto'].includes(mode)) return fail(400, { error: 'Invalid mode.', recordId: id });

		try {
			const pb = await adminPb();
			const existing = await getInstanceWithInfra(pb, id, { expand: 'email' });
			await assertTimedOutTaskStopped(existing);
			if (instanceIsDeleted(existing)) return fail(409, { error: 'Deleted leases cannot be resolved again. Create a new request.', recordId: id });
			if (instanceIsBusy(id) || ['provisioning', 'deleting'].includes(existing.provision_state ?? '')) {
				return fail(409, { error: 'An operation is already in progress.', recordId: id });
			}
			if (existing.status === 'completed') return fail(409, { error: 'Instance is already completed.', recordId: id });
			if (mode === 'auto') {
				if (!vmidRaw) return fail(400, { error: 'Missing vmid.', recordId: id });
				if (!nodeRaw) return fail(400, { error: 'Missing node.', recordId: id });
				if (!storage) return fail(400, { error: 'Missing storage.', recordId: id });

				const vmid = Number(vmidRaw);
				const cleanNodeStr = nodeRaw.replace(/^pve/i, '').trim();
				const node = Number(cleanNodeStr);
				if (!Number.isInteger(vmid) || vmid < 1) {
					return fail(400, { error: 'VMID must be a valid number.', recordId: id });
				}
				if (!Number.isInteger(node) || node < 1) {
					return fail(400, { error: 'Node must be a valid number.', recordId: id });
				}

				const record = existing;
				const network = 'vmbr1';
				const detail = {
					...record,
					vmid,
					cores: record.specs.cpu,
					memory: record.specs.ram,
				};

				await pb.collection('instances').update(id, {
					updated_by: locals.user.id,
					approved_by: locals.user.id,
					approved_at: new Date().toISOString(),
				});
				await writeInstanceAdminAction({ actorId: locals.user.id, instanceId: id, hostname: record.hostname, action: 'approve', metadata: { mode, vmid, node, storage } });
				await startProvisioning(pb, id, detail, network, storage, `pve${node}`, vmid, record.type);
				return { ok: true, id, recordId: id, mode, started: true };
			}

			const record = await pb.collection('instances').update<LeaseInstance>(id, {
				updated_by: locals.user.id,
				approved_by: locals.user.id,
				approved_at: new Date().toISOString(),
				status: 'completed', provision_state: 'completed', provision_error: '',
				provision_completed_at: new Date().toISOString()
			}, { expand: 'email' });
			provisioningProgress.delete(id);
			await writeInstanceAdminAction({ actorId: locals.user.id, instanceId: id, hostname: record.hostname, action: 'approve', metadata: { mode } });
			await sendDiscordNotification('completed', record).catch((err) =>
				console.error('Failed to send discord notification:', err)
			);
			return { ok: true, id, recordId: id, mode };
		} catch (e) {
			console.error('resolve failed', e);
			return fail(500, { error: e instanceof Error ? e.message : 'Could not update instance.', recordId: id });
		}
	},
	delete: async ({ request, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') throw error(403, 'Admin only.');
		const fd = await request.formData();
		const id = String(fd.get('id') ?? '').trim();
		if (!id) return fail(400, { error: 'Missing id.', recordId: id });
		try {
			const pb = await adminPb();
			const record = await getInstanceWithInfra(pb, id);
			await assertTimedOutTaskStopped(record);
			if (String(fd.get('confirm_hostname') ?? '').trim() !== record.hostname) {
				return fail(400, { error: 'Type the hostname to confirm deletion.', recordId: id });
			}
			await deleteInstance(pb, record, () => removeProxmoxInstance(record), locals.user.id);
			provisioningProgress.delete(id);
			// Deleting a request that was never approved is a rejection.
			const wasApproved = record.status === 'completed' || Boolean((record as any).approved_by);
			await writeInstanceAdminAction({ actorId: locals.user.id, instanceId: id, hostname: record.hostname, action: wasApproved ? 'delete' : 'reject', metadata: { status_before: record.status } });
			return { ok: true, id, recordId: id, deleted: true };
		} catch (e) {
			console.error('admin delete failed', e);
			return fail(500, { error: e instanceof Error ? e.message : 'Could not delete instance.', recordId: id });
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
			await locals.pb.collection('instances').update(id, { ...patch, updated_by: locals.user.id });
			return { ok: true, id, cleared: clear };
		} catch (e) {
			console.error('reply failed', e);
			return fail(500, { error: 'Could not save reply.' });
		}
	}
};
