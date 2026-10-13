/**
 * Wait for the task's actual result. A running task or an unavailable status
 * endpoint is not a failed task, regardless of how long migration takes.
 * @param {() => Promise<{status?: string, exitstatus?: string} | null | undefined>} readStatus
 * @param {{ sleep?: () => Promise<void>, onUnavailable?: () => void }} [options]
 */
export async function waitForProxmoxTask(readStatus, options = {}) {
	const sleep = options.sleep || (() => new Promise(resolve => setTimeout(resolve, 2000)));
	for (;;) {
		let result;
		try { result = await readStatus(); }
		catch { options.onUnavailable?.(); await sleep(); continue; }
		if (result?.status === 'stopped' && result.exitstatus) {
			if (result.exitstatus !== 'OK') throw new Error(`Proxmox task failed: ${result.exitstatus}`);
			return;
		}
		await sleep();
	}
}

/** @param {{vmid?: number, status: string, provision_error?: string}} record */
export function timedOutTask(record) {
	if (record.status !== 'failed' || !record.vmid) return null;
	const match = /^Timed out waiting for task (UPID:[^\s]+)\. Check Proxmox before retrying\.$/.exec(record.provision_error || '');
	if (!match) return null;
	const parts = match[1].split(':');
	// Bind the embedded task to this lease's VMID before querying Proxmox.
	if (parts.length < 9 || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || Number(parts[6]) !== record.vmid) return null;
	return { node: parts[1], upid: match[1], type: parts[5] };
}

/**
 * A successful migration does not prove the remaining provisioning steps ran.
 * Keep old timeout records pending verification until the admin checks them.
 * @param {{status?: string, exitstatus?: string} | null} result
 */
export function recoveredTaskProgress(result) {
	if (result?.status === 'stopped' && result.exitstatus && result.exitstatus !== 'OK') {
		return { status: 'Failed', error: `Proxmox task failed: ${result.exitstatus}`, taskState: 'failed' };
	}
	if (result?.status === 'stopped' && result.exitstatus === 'OK') {
		return { status: 'Proxmox task completed. Verify the VM/CT and remaining setup before marking this request complete.', taskState: 'stopped-ok' };
	}
	if (result?.status === 'running') {
		return { status: 'Proxmox task is still running. Waiting for completion; do not start another provisioning attempt.', taskState: 'running' };
	}
	return { status: 'Unable to confirm the Proxmox task result. Waiting for verification; do not retry or delete the VM/CT.', taskState: 'unknown' };
}
