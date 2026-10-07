import type PocketBase from 'pocketbase';
import type { LeaseInstance } from '../types';

// Lock before the first await so double submissions cannot start two operations.
const active = new Set<string>();
export const instanceIsBusy = (id: string) => active.has(id);
export const instanceIsDeleted = (record: { status: string; provision_state?: string }) =>
	record.status === 'deleted' || record.provision_state === 'deleted';

export async function startInstanceProvisioning(
	pb: PocketBase,
	record: LeaseInstance,
	target: { vmid: number; node: number },
	checkTarget: () => Promise<void>,
	create: () => Promise<{ ipAddress?: string }>,
	progress: (status: string, error?: string) => void,
	onCompleted: (record: LeaseInstance) => void,
	onFailed: (message: string) => void,
): Promise<void> {
	if (instanceIsDeleted(record)) throw new Error('Deleted leases are retained as history and cannot be provisioned again.');
	if (active.has(record.id) || ['provisioning', 'deleting'].includes(record.provision_state ?? '')) {
		throw new Error('An operation is already in progress for this instance.');
	}
	active.add(record.id);
	try {
		await checkTarget();
		await pb.collection('instances').update(record.id, {
			status: 'pending', provision_state: 'provisioning', provision_error: '', ...target,
		});
	} catch (cause) {
		const message = (cause instanceof Error ? cause.message : String(cause)).slice(0, 4096);
		try {
			await pb.collection('instances').update(record.id, {
				status: 'failed', provision_state: 'failed', provision_error: message,
			});
		} catch (saveError) {
			console.error('Could not persist provisioning startup failure:', saveError);
		}
		progress('Failed', message);
		active.delete(record.id);
		throw cause;
	}
	progress('Starting provisioning...');
	// The initial DB write has completed before the form reports success.
	void (async () => {
		try {
			const result = await create();
			const updated = await pb.collection('instances').update<LeaseInstance>(record.id, {
				status: 'completed', provision_state: 'completed', provision_error: '',
				...target, ...(result.ipAddress ? { IP: result.ipAddress } : {}),
			});
			progress('Complete');
			onCompleted(updated);
		} catch (cause) {
			const message = (cause instanceof Error ? cause.message : String(cause)).slice(0, 4096);
			try {
				await pb.collection('instances').update(record.id, {
					status: 'failed', provision_state: 'failed', provision_error: message,
				});
			} catch (saveError) {
				console.error('Could not persist provisioning failure:', saveError);
			}
			progress('Failed', message);
			onFailed(message);
		} finally {
			active.delete(record.id);
		}
	})();
}

export async function deleteInstance(
	pb: PocketBase,
	record: LeaseInstance,
	removeGuest: () => Promise<void>,
): Promise<void> {
	if (instanceIsDeleted(record)) return; // Preserve the original deletion timestamp on retries.
	if (active.has(record.id) || ['provisioning', 'deleting'].includes(record.provision_state ?? '')) {
		throw new Error('Wait for the current operation to finish before deleting.');
	}
	active.add(record.id);
	let deletedPatch: Record<string, unknown> | undefined;
	try {
		await pb.collection('instances').update(record.id, { status: 'failed', provision_state: 'deleting' });
		await removeGuest();
		// Keep the lease as history and revoke the guest binding in the same write.
		deletedPatch = {
			status: 'deleted', provision_state: 'deleted', provision_error: '',
			vmid: null, node: null, datedelete: new Date().toISOString(),
		};
		await pb.collection('instances').update(record.id, deletedPatch);
	} catch (cause) {
		const message = (cause instanceof Error ? cause.message : String(cause)).slice(0, 4096);
		try {
			await pb.collection('instances').update(record.id, deletedPatch
				? deletedPatch
				: { status: 'failed', provision_state: 'delete_failed', provision_error: message });
			if (deletedPatch) return; // The retry saved the successful deletion outcome.
		} catch (saveError) {
			console.error('Could not save deletion outcome:', saveError);
		}
		throw cause;
	} finally {
		active.delete(record.id);
	}
}
