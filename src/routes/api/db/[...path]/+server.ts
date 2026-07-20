import { env } from '$env/dynamic/private';
import { error, type RequestHandler } from '@sveltejs/kit';

export const fallback: RequestHandler = async ({ request, params, fetch }) => {
	const pbUrl = env.POCKETBASE_URL;
	if (!pbUrl) {
		throw error(500, 'POCKETBASE_URL is not set in environment variables');
	}

	const pathParam = params.path ?? '';
	// Normalize pbUrl to prevent trailing slash issues
	const pbUrlClean = pbUrl.endsWith('/') ? pbUrl.slice(0, -1) : pbUrl;
	// Normalize pathParam to prevent leading slash issues
	const pathClean = pathParam.startsWith('/') ? pathParam.slice(1) : pathParam;

	// Construct the target URL on the PocketBase server
	const targetUrl = `${pbUrlClean}/${pathClean}${new URL(request.url).search}`;

	// Clone the headers from the incoming request, omitting 'host'
	const headers = new Headers();
	for (const [key, value] of request.headers.entries()) {
		if (key.toLowerCase() !== 'host') {
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
			// @ts-ignore
			duplex: body ? 'half' : undefined
		});

		// Return the streamed response back to the client
		return new Response(res.body, {
			status: res.status,
			headers: res.headers
		});
	} catch (err) {
		console.error('[PB Proxy Error]:', err);
		throw error(502, 'Bad Gateway');
	}
};
