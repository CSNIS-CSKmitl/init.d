import { env } from '$env/dynamic/private';
import { type LeaseInstance, creatorEmail, creatorName } from './types';
import { discordWebhookConfig, deliverDiscordWebhook } from './server/discord-webhook.mjs';

function formatDate(iso: string) {
	try {
		return new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: '2-digit'
		});
	} catch {
		return iso;
	}
}

export async function sendDiscordNotification(
	type: 'created' | 'provision_started' | 'completed' | 'failed',
	item: LeaseInstance,
	extra?: { node?: string; vmid?: number; error?: string }
) {
	let webhook;
	try {
		webhook = discordWebhookConfig(env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL);
	} catch (error) {
		console.error(`[Discord Webhook] ${error instanceof Error ? error.message : 'Invalid configuration.'}`);
		return { ok: false, reason: 'configuration' };
	}
	if (webhook.repaired) {
		console.warn('[Discord Webhook] OIDC_USERINFO_URL was appended to DISCORD_WEBHOOK_URL. Separate these settings with a newline in ENV_FILE.');
	}

	let title = '';
	let color = 0x3b82f6; // blue
	let fields: Array<{ name: string; value: string; inline?: boolean }> = [];

	const specsStr = `${item.specs?.cpu || 0} Cores / ${item.specs?.ram || 0} GB RAM / ${item.specs?.disk || 0} GB Disk`;
	const durationStr = `${formatDate(item.start_date)} to ${formatDate(item.end_date)}`;

	switch (type) {
		case 'created':
			title = `🆕 New Lease Request: ${item.hostname}`;
			color = 0xF59E0B; // Amber
			fields = [
				{ name: 'Requester', value: creatorEmail(item), inline: true },
				{ name: 'Name', value: creatorName(item), inline: true },
				{ name: 'Type', value: item.type.toUpperCase(), inline: true },
				{ name: 'Specifications', value: specsStr, inline: false },
				{ name: 'OS Template', value: item.os_template, inline: true },
				{ name: 'Network Zone', value: item.network_type.toUpperCase(), inline: true },
				{ name: 'Ports', value: item.ports || 'Default Only', inline: true },
				{ name: 'Duration', value: durationStr, inline: false },
				{ name: 'Purpose', value: item.purpose_notes || 'No notes provided.', inline: false }
			];
			break;

		case 'provision_started':
			title = `⚡ Auto-Provisioning Started: ${item.hostname}`;
			color = 0x06B6D4; // Cyan
			fields = [
				{ name: 'Target Node', value: extra?.node || 'N/A', inline: true },
				{ name: 'Assigned VMID', value: extra?.vmid?.toString() || 'N/A', inline: true },
				{ name: 'Specifications', value: specsStr, inline: false },
				{ name: 'OS Template', value: item.os_template, inline: false }
			];
			break;

		case 'completed':
			title = `✅ Lease Provisioned Successfully: ${item.hostname}`;
			color = 0x10B981; // Green
			fields = [
				{ name: 'Node', value: extra?.node || `pve${item.node || ''}`, inline: true },
				{ name: 'VMID', value: extra?.vmid?.toString() || item.vmid?.toString() || 'N/A', inline: true },
				{ name: 'Type', value: item.type.toUpperCase(), inline: true },
				{ name: 'Specifications', value: specsStr, inline: false },
				{ name: 'Duration', value: durationStr, inline: false }
			];
			break;

		case 'failed':
			title = `❌ Provisioning Failed: ${item.hostname}`;
			color = 0xEF4444; // Red
			fields = [
				{ name: 'Target Node', value: extra?.node || 'N/A', inline: true },
				{ name: 'Assigned VMID', value: extra?.vmid?.toString() || 'N/A', inline: true },
				{ name: 'Error Message', value: `\`\`\`\n${extra?.error || 'Unknown error'}\n\`\`\``, inline: false }
			];
			break;
	}

	const payload = {
		allowed_mentions: { parse: [] },
		embeds: [
			{
				title: title.slice(0, 256),
				color,
				fields: fields.map(field => ({ ...field, value: String(field.value || 'N/A').slice(0, 1024) })),
				timestamp: new Date().toISOString(),
				footer: {
					text: 'CSKMITL Cloud Lease System'
				}
			}
		]
	};

	try {
		const result = await deliverDiscordWebhook(webhook.url, payload);
		if (!result.ok) {
			console.error(`[Discord Webhook] Delivery failed (${type}, instance ${item.id}): ${result.reason}; HTTP ${result.status ?? 'N/A'}; Discord code ${result.code ?? 'N/A'}. Check the webhook and ENV_FILE.`);
		} else {
			console.log(`[Discord Webhook] Sent notification for instance ${item.id} (${type}).`);
		}
		return result;
	} catch {
		console.error(`[Discord Webhook] Delivery failed (${type}, instance ${item.id}).`);
		return { ok: false, reason: 'delivery' };
	}
}
