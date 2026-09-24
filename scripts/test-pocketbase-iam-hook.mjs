import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../pb_hooks/iam-oidc-eligibility.pb.js', import.meta.url), 'utf8');

function loadHook(allowedRoles = '') {
	let handler;
	let collection;
	runInNewContext(source, {
		$os: { getenv: () => allowedRoles },
		onRecordAuthWithOAuth2Request(fn, tag) { handler = fn; collection = tag; }
	});
	assert.equal(collection, 'users');
	// PocketBase serializes each handler into a fresh JSVM context.
	return runInNewContext(`(${handler.toString()})`, { $os: { getenv: () => allowedRoles } });
}

function attempt(handler, { provider = 'oidc', role = 'student', profile = {}, sub = 'iam-subject', providerUrl = 'https://api.science.kmitl.ac.th/iam/oidc2/userinfo' } = {}) {
	let continued = false;
	const event = {
		providerName: provider,
		providerClient: { userInfoURL: () => providerUrl },
		oAuth2User: { id: 'iam-subject', rawUser: { sub, role, profile } },
		forbiddenError: (message) => new Error(message),
		internalServerError: (message) => new Error(message),
		next() { continued = true; }
	};
	let rejected = false;
	try { handler(event); } catch { rejected = true; }
	return { continued, rejected };
}

test('PocketBase IAM hook accepts a current Computer Science student', () => {
	assert.deepEqual(attempt(loadHook(), { profile: { current: { major_name_en: 'Computer Science' } } }), { continued: true, rejected: false });
});

test('PocketBase IAM hook denies another major and education history', () => {
	const hook = loadHook();
	assert.deepEqual(attempt(hook, { profile: { major_name_en: 'Mathematics' } }), { continued: false, rejected: true });
	assert.deepEqual(attempt(hook, { profile: { education: [{ major_name_en: 'Computer Science' }] } }), { continued: false, rejected: true });
});

test('PocketBase IAM hook verifies subject and provider URL', () => {
	const hook = loadHook();
	const profile = { major_name_en: 'Computer Science' };
	assert.deepEqual(attempt(hook, { profile, sub: 'other' }), { continued: false, rejected: true });
	assert.deepEqual(attempt(hook, { profile, providerUrl: 'https://attacker.example/userinfo' }), { continued: false, rejected: true });
});

test('PocketBase IAM hook denies OAuth providers without IAM student claims', () => {
	assert.deepEqual(attempt(loadHook(), { provider: 'google', profile: { major_name_en: 'Computer Science' } }), { continued: false, rejected: true });
});

test('PocketBase IAM hook uses an explicit non-student role allowlist', () => {
	const profile = {};
	assert.deepEqual(attempt(loadHook(), { role: 'teacher', profile }), { continued: false, rejected: true });
	assert.deepEqual(attempt(loadHook('teacher,staff'), { role: 'teacher', profile }), { continued: true, rejected: false });
});
