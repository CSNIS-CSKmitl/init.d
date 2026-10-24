import { env } from '$env/dynamic/private';
import { error, type RequestHandler } from '@sveltejs/kit';

export const trailingSlash = 'ignore';

export const fallback: RequestHandler = async ({ request, fetch }) => {
	const pbUrl = env.POCKETBASE_URL;
	if (!pbUrl) {
		throw error(500, 'POCKETBASE_URL is not set in environment variables');
	}

	const url = new URL(request.url);
	// Match the subpath after /api/db
	let subPath = url.pathname.replace(/^\/api\/db/, '') || '/';
	// PocketBase admin/oauth redirect strictly requires trailing slash for /_/
	if (subPath === '/_') {
		subPath = '/_/';
	}

	const targetUrl = `${pbUrl.replace(/\/+$/, '')}${subPath}${url.search}`;

	const headers = new Headers();
	for (const [key, value] of request.headers.entries()) {
		if (!['host', 'accept-encoding', 'content-length', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
			headers.set(key, value);
		}
	}

	try {
		const body = request.body ? request.body : undefined;

		let upstream = await fetch(targetUrl, {
			method: request.method,
			headers,
			body,
			redirect: 'manual',
			// @ts-ignore
			duplex: body ? 'half' : undefined
		});

		// If PocketBase tries to redirect /_ to /_/, follow it internally to prevent redirect loops
		if ([301, 302, 307, 308].includes(upstream.status)) {
			const loc = upstream.headers.get('location');
			if (loc === '/_/' || loc === '/_' || loc?.endsWith('/_/')) {
				upstream = await fetch(`${pbUrl.replace(/\/+$/, '')}/_/${url.search}`, {
					method: 'GET',
					headers
				});
			}
		}

		const responseHeaders = new Headers(upstream.headers);
		for (const key of ['content-encoding', 'content-length', 'connection', 'transfer-encoding']) {
			responseHeaders.delete(key);
		}

		// Rewrite Location header if PocketBase issues a redirect anywhere else
		const location = responseHeaders.get('location');
		if (location) {
			const cleanPb = pbUrl.replace(/\/+$/, '');
			if (location.startsWith(cleanPb)) {
				responseHeaders.set('location', location.replace(cleanPb, '/api/db'));
			} else if (location.startsWith('/') && !location.startsWith('/api/db')) {
				responseHeaders.set('location', `/api/db${location}`);
			}
		}

		const isHtml = responseHeaders.get('content-type')?.includes('text/html') ?? false;
		const responseBody = isHtml ? await upstream.arrayBuffer() : upstream.body;
		return new Response(responseBody, {
			status: upstream.status,
			headers: responseHeaders
		});
	} catch (err) {
		console.error('[PB Proxy Error]:', err);
		throw error(502, 'Bad Gateway');
	}
};
