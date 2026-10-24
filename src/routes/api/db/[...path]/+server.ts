import { env } from '$env/dynamic/private';
import { error, type RequestHandler } from '@sveltejs/kit';

export const fallback: RequestHandler = async ({ request, fetch }) => {
	const pbUrl = env.POCKETBASE_URL;
	if (!pbUrl) {
		throw error(500, 'POCKETBASE_URL is not set in environment variables');
	}

	const url = new URL(request.url);
	// Preserve full subpath after /api/db including trailing slashes (e.g. /_/ or /api/...)
	const subPath = url.pathname.replace(/^\/api\/db/, '') || '/';
	const targetUrl = `${pbUrl.replace(/\/+$/, '')}${subPath}${url.search}`;

	// Let fetch negotiate the upstream transfer encoding. Forwarding the
	// browser's Accept-Encoding can leave a compressed Content-Length on a
	// decompressed body, truncating PocketBase's OAuth result page.
	const headers = new Headers();
	for (const [key, value] of request.headers.entries()) {
		if (!['host', 'accept-encoding', 'content-length', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
			headers.set(key, value);
		}
	}

	try {
		const body = request.body ? request.body : undefined;

		// Fetch from the local PocketBase server using SvelteKit's fetch
		const res = await fetch(targetUrl, {
			method: request.method,
			headers,
			body,
			redirect: 'manual',
			// @ts-ignore
			duplex: body ? 'half' : undefined
		});

		const responseHeaders = new Headers(res.headers);
		for (const key of ['content-encoding', 'content-length', 'connection', 'transfer-encoding']) {
			responseHeaders.delete(key);
		}

		// Rewrite Location header if PocketBase issues a redirect
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
		// Buffer small HTML pages so the OAuth success/failure screen is complete.
		// Leave SSE and API responses streamed.
		const responseBody = isHtml ? await res.arrayBuffer() : res.body;
		return new Response(responseBody, {
			status: res.status,
			headers: responseHeaders
		});
	} catch (err) {
		console.error('[PB Proxy Error]:', err);
		throw error(502, 'Bad Gateway');
	}
};
