const hosts = new Set(['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com']);

/** @param {string | undefined} raw */
export function discordWebhookConfig(raw) {
	let value = raw?.trim() || '';
	if (!value) throw new Error('DISCORD_WEBHOOK_URL is not configured.');
	// An omitted newline in ENV_FILE can append the next assignment to the token.
	// Recover only the known adjacent setting; validate the complete webhook below.
	const boundary = value.indexOf('OIDC_USERINFO_URL=');
	const repaired = boundary > 0;
	if (repaired) value = value.slice(0, boundary).trim();
	let url;
	try { url = new URL(value); }
	catch { throw new Error('DISCORD_WEBHOOK_URL is not a valid URL.'); }
	if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password ||
		url.hash || (url.port && url.port !== '443') ||
		!/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)) {
		throw new Error('DISCORD_WEBHOOK_URL must contain one complete Discord webhook URL. Put each ENV_FILE setting on its own line.');
	}
	return { url, repaired };
}

/**
 * @param {URL} webhook
 * @param {object} payload
 * @param {{ fetch?: typeof globalThis.fetch, sleep?: (ms: number) => Promise<void>, timeoutMs?: number }} [options]
 */
export async function deliverDiscordWebhook(webhook, payload, options = {}) {
	const fetcher = options.fetch || globalThis.fetch;
	const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
	const url = new URL(webhook);
	url.searchParams.set('wait', 'true');
	for (let attempt = 1; attempt <= 3; attempt++) {
		let response;
		try {
			response = await fetcher(url, {
				method: 'POST', redirect: 'error',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(options.timeoutMs || 3000),
			});
		} catch {
			// Do not log the error object: fetch errors may contain the webhook token.
			// Delivery is uncertain on a connection failure, so avoid duplicate posts.
			return { ok: false, reason: 'network', attempts: attempt };
		}
		if (response.ok) {
			await response.body?.cancel();
			return { ok: true, attempts: attempt };
		}
		const parsed = await response.json().catch(() => null);
		const body = parsed && typeof parsed === 'object' ? parsed : {};
		const code = typeof body.code === 'number' ? body.code : undefined;
		if (attempt < 3 && (response.status === 429 || response.status >= 500)) {
			const retryAfter = body.retry_after ?? response.headers.get('retry-after');
			const seconds = retryAfter === null ? NaN : Number(retryAfter);
			const delay = response.status === 429 ? seconds * 1000 : 250 * attempt;
			// Respect Discord's delay without blocking a form request indefinitely.
			if (Number.isFinite(delay) && delay >= 0 && delay <= 2000) {
				await sleep(delay);
				continue;
			}
		}
		return { ok: false, reason: 'http', status: response.status, code, attempts: attempt };
	}
	return { ok: false, reason: 'http', attempts: 3 };
}
