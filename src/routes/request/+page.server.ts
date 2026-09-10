// Request page server logic:
//   1. Load — guards anonymous users, exposes the resolved email, and
//      lists the available passion groups (relation source).
//   2. default action — validates the form payload and INSERTs a row
//      into PocketBase with status = "pending". No hypervisor calls.

import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type {
	InstanceType,
	LeaseInstance,
	NetworkType,
	PassionGroupRef
} from '$lib/types';
import { fetchPresets } from '$lib/presets';
import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';
import { sendDiscordNotification } from '$lib/discord';

const TYPES: InstanceType[] = ['vm', 'container'];
const NETWORKS: NetworkType[] = ['local', 'public'];

function asString(v: FormDataEntryValue | null): string {
	return typeof v === 'string' ? v.trim() : '';
}

function asInt(v: FormDataEntryValue | null, fallback: number): number {
	const n = Number(asString(v));
	return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) throw redirect(303, '/login');

	const editId = url.searchParams.get('edit');
	let editRecord: LeaseInstance | null = null;
	if (editId) {
		try {
			editRecord = await locals.pb.collection('instances').getOne<LeaseInstance>(editId, { expand: 'email' });
			if (editRecord.email !== locals.user.id && locals.user.role !== 'admin') {
				throw error(403, 'Unauthorized');
			}
			if (editRecord.status !== 'pending') {
				throw error(400, 'Only pending requests can be edited.');
			}
		} catch (e) {
			console.error('Failed to load record for edit:', e);
			throw error(404, 'Lease request not found.');
		}
	}

	// Fetch passion groups and the template catalog in parallel — both
	// are independent reads, so there's no reason to serialise them.
	const [passionGroups, presets] = await Promise.all([
		locals.pb
			.collection('passion_group')
			.getList<PassionGroupRef>(1, 200, {
				sort: 'name',
				fields: 'id,name'
			})
			.then((r) => r.items)
			.catch(() => [] as PassionGroupRef[]),
		fetchPresets(locals.pb)
	]);

	return {
		email: locals.user.email,
		passionGroups,
		presets,
		editRecord,
		defaults: {
			type: 'vm' as InstanceType,
			network_type: 'local' as NetworkType,
			quantity: 1,
			cpu: 1,
			ram: 2,
			disk: 20
		}
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) throw error(401, 'Sign in to file a lease.');

		const fd = await request.formData();

		const editId = asString(fd.get('id'));
		const passion_group = asString(fd.get('passion_group'));
		const type = asString(fd.get('type')) as InstanceType;
		const hostname = asString(fd.get('hostname')).toLowerCase();
		const os_template = asString(fd.get('os_template'));
		const network_type = asString(fd.get('network_type')) as NetworkType;
		const dns_name = asString(fd.get('dns_name'));
		const ports = asString(fd.get('ports'));
		const purpose_notes = asString(fd.get('purpose_notes'));
		const start_date = asString(fd.get('start_date'));
		const end_date = asString(fd.get('end_date'));
		const cpu = asInt(fd.get('cpu'), NaN);
		const ram = asInt(fd.get('ram'), NaN);
		const disk = asInt(fd.get('disk'), NaN);
		const quantity = asInt(fd.get('quantity'), 1) || 1;

		const errors: Record<string, string> = {};

		if (!passion_group) errors.passion_group = 'Required.';
		if (!TYPES.includes(type)) errors.type = 'Choose vm or container.';
		if (!/^[a-z0-9-]{1,64}$/.test(hostname))
			errors.hostname = 'Lowercase letters, digits and dashes only (max 64).';
		if (!os_template) errors.os_template = 'Required.';
		if (!NETWORKS.includes(network_type)) errors.network_type = 'Choose local or public.';
		if (!purpose_notes) errors.purpose_notes = 'Required.';
		if (!start_date) errors.start_date = 'Required.';
		if (!end_date) errors.end_date = 'Required.';
		if (start_date && end_date && new Date(end_date) < new Date(start_date))
			errors.end_date = 'Must be on or after start.';
		if (!Number.isFinite(cpu) || cpu < 1 || cpu > 128) errors.cpu = '1 – 128 cores.';
		if (!Number.isFinite(ram) || ram < 1 || ram > 1024) errors.ram = '1 – 1024 GB.';
		if (!Number.isFinite(disk) || disk < 1 || disk > 16384) errors.disk = '1 – 16384 GB.';
		if (!Number.isFinite(quantity) || quantity < 1 || quantity > 64)
			errors.quantity = '1 – 64 units.';

		if (ports) {
			const list = ports
				.split(',')
				.map((p) => p.trim())
				.filter(Boolean);
			const bad = list.find((p) => !/^\d{1,5}$/.test(p) || Number(p) < 1 || Number(p) > 65535);
			if (bad) errors.ports = `Invalid port: "${bad}". Use comma-separated integers 1-65535.`;
		}

		if (Object.keys(errors).length) {
			return fail(400, {
				errors,
				values: {
					id: editId,
					passion_group,
					type,
					hostname,
					os_template,
					specs: { cpu, ram, disk },
					network_type,
					dns_name,
					ports,
					purpose_notes,
					start_date,
					end_date,
					quantity
				}
			});
		}

		// Verify the passion_group exists so we don't insert a dangling
		// relation — PB would reject it anyway, but a friendly error is
		// nicer than the default 400.
		try {
			await locals.pb.collection('passion_group').getOne(passion_group);
		} catch {
			const errors: Record<string, string> = { passion_group: 'Unknown passion group.' };
			return fail(400, {
				errors,
				values: {
					id: editId,
					passion_group,
					type,
					hostname,
					os_template,
					specs: { cpu, ram, disk },
					network_type,
					dns_name,
					ports,
					purpose_notes,
					start_date,
					end_date,
					quantity
				}
			});
		}

		let record: LeaseInstance;
		if (editId) {
			try {
				const existing = await locals.pb.collection('instances').getOne<LeaseInstance>(editId);
				if (existing.email !== locals.user.id && locals.user.role !== 'admin') {
					return fail(403, { errors: { global: 'Unauthorized' } });
				}
				if (existing.status !== 'pending') {
					return fail(400, { errors: { global: 'Only pending requests can be updated.' } });
				}
				
				const pbAdmin = new PocketBase(env.POCKETBASE_URL);
				pbAdmin.autoCancellation(false);
				await pbAdmin.admins.authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASSWORD);
				
				record = await pbAdmin.collection('instances').update<LeaseInstance>(editId, {
					passion_group,
					type,
					hostname,
					os_template,
					specs: { cpu, ram, disk },
					network_type,
					dns_name,
					ports,
					purpose_notes,
					start_date: new Date(start_date).toISOString(),
					end_date: new Date(end_date).toISOString(),
					quantity
				}, {
					expand: 'email'
				});
			} catch (e) {
				console.error('Update failed:', e);
				return fail(500, { errors: { global: 'Failed to update request.' } });
			}
		} else {
			record = await locals.pb.collection('instances').create<LeaseInstance>({
				email: locals.user.id,
				creator_email: locals.user.email,
				passion_group,
				type,
				hostname,
				os_template,
				specs: { cpu, ram, disk },
				network_type,
				dns_name,
				ports,
				purpose_notes,
				start_date: new Date(start_date).toISOString(),
				end_date: new Date(end_date).toISOString(),
				quantity,
				status: 'pending'
			}, {
				expand: 'email'
			});
			sendDiscordNotification('created', record).catch((err) =>
				console.error('Failed to send discord notification:', err)
			);
		}

		throw redirect(303, `/status#${record.id}`);
	}
};

