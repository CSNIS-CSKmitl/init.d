import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { adminPb } from './instance-owners';
import { resolveClientIp } from './client-ip.mjs';

function clean(value: string | null | undefined, max: number): string | undefined {
	const text = value?.trim();
	return text ? text.slice(0, max) : undefined;
}

function headers(event: RequestEvent): Record<string, string> {
	return {
		'cf-connecting-ip': event.request.headers.get('cf-connecting-ip') ?? '',
		'true-client-ip': event.request.headers.get('true-client-ip') ?? '',
		'x-forwarded-for': event.request.headers.get('x-forwarded-for') ?? '',
		'x-real-ip': event.request.headers.get('x-real-ip') ?? '',
		forwarded: event.request.headers.get('forwarded') ?? ''
	};
}

export function isDocumentRequest(event: RequestEvent): boolean {
	if (event.request.method !== 'GET') return false;
	if (event.url.pathname.startsWith('/_app/') || event.url.pathname === '/favicon.ico') return false;
	return event.request.headers.get('sec-fetch-dest') === 'document' ||
		event.request.headers.get('accept')?.includes('text/html') === true;
}

export async function writeServiceAccessLog(event: RequestEvent, statusCode: number): Promise<void> {
	try {
		const sourceIp = resolveClientIp({
			headers: headers(event),
			remoteAddress: event.getClientAddress(),
			trustProxy: env.TRUST_PROXY === 'true'
		});
		const pb = await adminPb();
		await pb.collection('service_access_logs').create({
			service: 'init.d',
			user: event.locals.user?.id || undefined,
			source_ip: clean(sourceIp, 64),
			method: event.request.method,
			path: clean(event.url.pathname, 512),
			action: 'page_view',
			status_code: statusCode,
			user_agent: clean(event.request.headers.get('user-agent'), 512),
			request_id: clean(event.request.headers.get('x-request-id'), 128),
			metadata: { ip_version: sourceIp.includes(':') ? 6 : sourceIp ? 4 : null }
		});
	} catch (error) {
		console.error('[Service access log] Could not write page view:', error instanceof Error ? error.message : error);
	}
}
