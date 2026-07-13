import { env } from '$env/dynamic/private';
import type { LeaseInstance } from './types';

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
	const webhookUrl = env.DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
	if (!webhookUrl) {
		console.warn('[Discord Webhook] DISCORD_WEBHOOK_URL is not configured.');
		return;
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
				{ name: 'Requester', value: item.creator_email, inline: true },
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
		embeds: [
			{
				title,
				color,
				fields,
				timestamp: new Date().toISOString(),
				footer: {
					text: 'CSKMITL Cloud Lease System'
				}
			}
		]
	};

	try {
		const res = await fetch(webhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (!res.ok) {
			console.error(`[Discord Webhook] Failed to send notification: ${res.status} ${await res.text()}`);
		} else {
			console.log(`[Discord Webhook] Sent notification for: ${item.hostname} (${type})`);
		}
	} catch (err) {
		console.error('[Discord Webhook] Network error:', err);
	}
}
