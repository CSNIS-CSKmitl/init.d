import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { discordWebhookConfig, deliverDiscordWebhook } from '../src/lib/server/discord-webhook.mjs';

const webhook = 'https://discord.com/api/webhooks/123456789/test-token';
const payload = { embeds: [{ title: 'Test' }] };

test('recovers the missing newline before OIDC_USERINFO_URL without changing the webhook recipient', () => {
	const config = discordWebhookConfig(`${webhook}OIDC_USERINFO_URL=https://identity.example.test/userinfo`);
	assert.equal(config.url.href, webhook);
	assert.equal(config.repaired, true);
	assert.equal(discordWebhookConfig(webhook).repaired, false);
});

test('accepts versioned Discord URLs and preserves a forum thread', () => {
	const config = discordWebhookConfig(' https://discord.com/api/v10/webhooks/123/test-token/?thread_id=456 ');
	assert.equal(config.url.searchParams.get('thread_id'), '456');
});

test('rejects absent, incomplete, concatenated or non-Discord URLs without leaking their values', () => {
	for (const raw of [undefined, '', 'not-a-url', 'http://discord.com/api/webhooks/123/token',
		'https://discord.com.evil.test/api/webhooks/123/token', `${webhook}/extra`,
		`${webhook}https://other.example.test`, 'https://discord.gg/invite',
		'https://discord.com/api/webhooks/123/', `https://user:password@discord.com/api/webhooks/123/token`,
		`${webhook}#fragment`]) {
		assert.throws(() => discordWebhookConfig(raw), error => {
			assert.ok(!error.message.includes('test-token'));
			assert.ok(!error.message.includes('password'));
			return true;
		});
	}
});

test('waits for Discord confirmation, preserves thread_id, and disallows redirects', async () => {
	let calls = 0;
	const result = await deliverDiscordWebhook(new URL(`${webhook}?thread_id=456&wait=false`), payload, {
		fetch: async (url, options) => {
			calls++;
			assert.equal(url.searchParams.get('wait'), 'true');
			assert.equal(url.searchParams.get('thread_id'), '456');
			assert.equal(options.redirect, 'error');
			assert.equal(options.method, 'POST');
			assert.deepEqual(JSON.parse(options.body), payload);
			assert.ok(options.signal instanceof AbortSignal);
			return Response.json({ id: 'message' });
		},
	});
	assert.equal(result.ok, true);
	assert.equal(calls, 1);
});

test('respects retry_after and retries a rate-limited message', async () => {
	let calls = 0;
	const delays = [];
	const result = await deliverDiscordWebhook(new URL(webhook), payload, {
		fetch: async () => ++calls === 1
			? Response.json({ retry_after: 0.125 }, { status: 429 }) : Response.json({ id: 'message' }),
		sleep: async ms => { delays.push(ms); },
	});
	assert.equal(result.ok, true);
	assert.equal(calls, 2);
	assert.deepEqual(delays, [125]);
});

test('does not retry before a long rate-limit delay or when no delay is provided', async () => {
	for (const body of [{ retry_after: 30 }, {}]) {
		let calls = 0;
		const result = await deliverDiscordWebhook(new URL(webhook), payload, {
			fetch: async () => { calls++; return Response.json(body, { status: 429 }); },
			sleep: async () => assert.fail('Must not retry early'),
		});
		assert.equal(result.status, 429);
		assert.equal(calls, 1);
	}
});

test('caps transient server retries and stops on an invalid webhook', async () => {
	for (const [status, expectedCalls] of [[503, 3], [404, 1], [400, 1], [403, 1]]) {
		let calls = 0;
		const result = await deliverDiscordWebhook(new URL(webhook), payload, {
			fetch: async () => { calls++; return Response.json({ code: 10015 }, { status }); },
			sleep: async () => {},
		});
		assert.equal(result.ok, false);
		assert.equal(result.code, 10015);
		assert.equal(result.status, status);
		assert.equal(calls, expectedCalls);
	}
});

test('network failures do not leak the URL or cause duplicate submissions', async () => {
	let calls = 0;
	const result = await deliverDiscordWebhook(new URL(webhook), payload, {
		fetch: async () => { calls++; throw new Error(`Cannot reach ${webhook}`); },
	});
	assert.deepEqual(result, { ok: false, reason: 'network', attempts: 1 });
	assert.equal(calls, 1);
	assert.ok(!JSON.stringify(result).includes('test-token'));
});

function notificationModule(deliver) {
	const source = readFileSync(new URL('../src/lib/discord.ts', import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
	const module = { exports: {} };
	const messages = [];
	const dependencies = {
		'$env/dynamic/private': { env: { DISCORD_WEBHOOK_URL: webhook } },
		'./types': { creatorName: item => item.name, creatorEmail: item => item.email },
		'./server/discord-webhook.mjs': { discordWebhookConfig, deliverDiscordWebhook: deliver },
	};
	const logger = Object.fromEntries(['log', 'warn', 'error'].map(level => [level, message => messages.push(message)]));
	new Function('require', 'module', 'exports', 'console', outputText)(name => {
		assert.ok(name in dependencies, `Unexpected dependency ${name}`);
		return dependencies[name];
	}, module, module.exports, logger);
	return { ...module.exports, messages };
}

const lease = {
	id: 'lease', hostname: 'lease-test', name: 'Test user', email: 'test@example.test', type: 'vm',
	specs: { cpu: 2, ram: 4, disk: 20 }, os_template: 'Debian', network_type: 'local',
	start_date: '2026-10-13', end_date: '2026-10-20', purpose_notes: 'x'.repeat(5000),
};

test('all notification types fit Discord embed limits, including long notes and provisioning errors', async () => {
	let calls = 0;
	const { sendDiscordNotification } = notificationModule(async (_url, message) => {
		calls++;
		assert.deepEqual(message.allowed_mentions, { parse: [] });
		assert.ok(message.embeds[0].title.length <= 256);
		for (const field of message.embeds[0].fields) assert.ok(field.value.length > 0 && field.value.length <= 1024);
		return { ok: true };
	});
	for (const type of ['created', 'provision_started', 'completed', 'failed']) {
		assert.equal((await sendDiscordNotification(type, lease, { error: 'x'.repeat(4096) })).ok, true);
	}
	assert.equal(calls, 4);
});

test('unexpected delivery errors do not fail the request or expose the token in logs', async () => {
	const { sendDiscordNotification, messages } = notificationModule(async () => { throw new Error(webhook); });
	assert.equal((await sendDiscordNotification('created', lease)).ok, false);
	assert.ok(messages.length > 0);
	assert.ok(!messages.join('\n').includes('test-token'));
});
