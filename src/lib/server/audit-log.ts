import type { RequestEvent } from '@sveltejs/kit';
import { adminPb } from './instance-owners';

export type AuditAction = 'instance_view' | 'console' | 'power_start' | 'power_shutdown' | 'power_reboot' | 'power_stop' | 'power_reset' | 'power_suspend' | 'power_resume' | 'power_hibernate';

function clean(value: string | null | undefined, max: number): string | undefined {
	const text = value?.trim();
	return text ? text.slice(0, max) : undefined;
}

export async function writeAuditLog(event: RequestEvent, input: {
	userId: string;
	instanceId?: string;
	action: AuditAction;
	metadata?: Record<string, unknown>;
}) {
	try {
		const pb = await adminPb();
		await pb.collection('instance_access_logs').create({
			user: input.userId,
			instance: input.instanceId,
			source_ip: clean(event.getClientAddress(), 64),
			action: input.action,
			path: clean(event.url.pathname, 256),
			user_agent: clean(event.request.headers.get('user-agent'), 512),
			request_id: clean(event.request.headers.get('x-request-id'), 128),
			metadata: input.metadata ?? {}
		});
	} catch (logError) {
		// Logging must never block the requested operation, but keep an operational trace.
		console.error('[Audit log] Could not write access log:', logError instanceof Error ? logError.message : logError);
	}
}
