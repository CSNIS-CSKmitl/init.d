import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** @param {string} file */
function loadKeys(file) {
	if (!existsSync(file)) return {};
	return JSON.parse(readFileSync(file, 'utf8'));
}

// Trust on first use, then reject a changed key. Administrators may pre-seed
// the JSON file with verified SHA-256 fingerprints before the first connection.
/** @param {string} instanceId */
export function createHostVerifier(instanceId) {
	const file = resolve(process.env.SSH_HOST_KEYS_FILE || '.data/ssh-hostkeys.json');
	/** @param {Buffer} key */
	return (key) => {
		try {
			const fingerprint = createHash('sha256').update(key).digest('base64');
			const keys = loadKeys(file);
			if (keys[instanceId]) return keys[instanceId] === fingerprint;
			keys[instanceId] = fingerprint;
			mkdirSync(dirname(file), { recursive: true });
			const temporary = `${file}.${process.pid}.tmp`;
			writeFileSync(temporary, JSON.stringify(keys, null, 2), { mode: 0o600 });
			renameSync(temporary, file);
			console.log(`[SSH host key] Pinned first key for instance ${instanceId}: SHA256:${fingerprint}`);
			return true;
		} catch (error) {
			console.error('[SSH host key] Could not verify host key:', error);
			return false;
		}
	};
}
