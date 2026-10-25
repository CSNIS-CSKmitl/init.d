import type PocketBase from 'pocketbase';
import type { LeaseInstance } from '$lib/types';

export interface InstanceInfraRecord {
	id?: string;
	instance: string;
	instance_ref?: string;
	vmid: number;
	node: string | number;
	ip: string;
	provision_state: string;
	provision_error: string;
	provision_started_at: string;
	provision_completed_at: string;
	created?: string;
	updated?: string;
}

/** Merges instance_infra fields into the instance object so all downstream logic works seamlessly. */
export function mergeInfra(instance: LeaseInstance, infra?: InstanceInfraRecord | null): LeaseInstance {
	if (!infra) return instance;
	instance.vmid = infra.vmid || instance.vmid;
	instance.node = infra.node || instance.node;
	instance.IP = infra.ip || instance.IP;
	instance.provision_state = infra.provision_state || instance.provision_state;
	instance.provision_error = infra.provision_error || instance.provision_error;
	instance.provision_started_at = infra.provision_started_at || instance.provision_started_at;
	instance.provision_completed_at = infra.provision_completed_at || instance.provision_completed_at;
	return instance;
}

/** Fetches one instance merged with its infra data. */
export async function getInstanceWithInfra(pb: PocketBase, id: string, queryParams: Record<string, any> = {}): Promise<LeaseInstance> {
	const [instance, infra] = await Promise.all([
		pb.collection('instances').getOne<LeaseInstance>(id, queryParams),
		getInfraRecord(pb, id)
	]);
	return mergeInfra(instance, infra);
}

/** Helper to get or create infra record by instance ID. */
export async function getInfraRecord(pb: PocketBase, instanceId: string): Promise<InstanceInfraRecord | null> {
	try {
		return await pb.collection('instance_infra').getFirstListItem<InstanceInfraRecord>(`instance = "${instanceId}" || instance_ref = "${instanceId}"`);
	} catch {
		return null;
	}
}

/** Updates or inserts infra fields for an instance. */
export async function updateInstanceInfra(
	pb: PocketBase,
	instanceId: string,
	data: Partial<{
		vmid: number | null;
		node: string | number | null;
		ip: string | null;
		provision_state: string | null;
		provision_error: string | null;
		provision_started_at: string | null;
		provision_completed_at: string | null;
	}>
): Promise<void> {
	const patch: Record<string, any> = {};
	if (data.vmid !== undefined) patch.vmid = data.vmid ?? 0;
	if (data.node !== undefined) patch.node = data.node != null ? String(data.node) : '';
	if (data.ip !== undefined) patch.ip = data.ip ?? '';
	if (data.provision_state !== undefined) patch.provision_state = data.provision_state ?? '';
	if (data.provision_error !== undefined) patch.provision_error = data.provision_error ?? '';
	if (data.provision_started_at !== undefined) patch.provision_started_at = data.provision_started_at ?? '';
	if (data.provision_completed_at !== undefined) patch.provision_completed_at = data.provision_completed_at ?? '';

	try {
		const existing = await getInfraRecord(pb, instanceId);
		if (existing && existing.id) {
			await pb.collection('instance_infra').update(existing.id, patch);
		} else {
			await pb.collection('instance_infra').create({
				instance: instanceId,
				instance_ref: instanceId,
				...patch
			});
		}
	} catch (err) {
		console.error('[instance-infra] update failed for', instanceId, err);
	}
}
