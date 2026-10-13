import 'dotenv/config';
import { discordWebhookConfig } from '../src/lib/server/discord-webhook.mjs';

// Read-only: verifies the existing webhook without publishing a message.
let config;
try {
	config = discordWebhookConfig(process.env.DISCORD_WEBHOOK_URL);
} catch (error) {
	console.error(error.message);
	process.exit(1);
}
if (config.repaired) {
	console.warn('OIDC_USERINFO_URL is appended to DISCORD_WEBHOOK_URL. Put each setting on its own line in ENV_FILE and redeploy.');
}
config.url.search = '';
try {
	const response = await fetch(config.url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
	await response.body?.cancel();
	if (!response.ok) {
		const hint = response.status === 404 ? 'The webhook was removed or its token is incorrect.'
			: response.status === 401 || response.status === 403 ? 'Check the webhook token and channel permissions.'
				: response.status === 429 ? 'Discord is rate limiting requests. Try again later.'
					: 'Check Discord availability and server connectivity.';
		console.error(`Discord webhook check failed: HTTP ${response.status}. ${hint}`);
		process.exitCode = 1;
	} else {
		console.log('Discord webhook is reachable and valid. No message was sent.');
	}
} catch {
	console.error('Cannot reach Discord within 5 seconds. Check outbound HTTPS, DNS and network access.');
	process.exitCode = 1;
}
