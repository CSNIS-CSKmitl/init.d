import { isIP } from 'node:net';

/** @param {unknown} value */
function first(value) {
	return String(value || '').split(',')[0].trim();
}

/** @param {unknown} value */
function forwardedFor(value) {
	const match = String(value || '').match(/(?:^|;)\s*for=("?)(\[[^\]]+\](?::\d+)?|[^;,\s"]+)\1/i);
	return match?.[2] || '';
}

/** @param {unknown} value */
export function normalizeClientIp(value) {
	let candidate = String(value || '').trim().replace(/^"|"$/g, '');
	if (!candidate || candidate.toLowerCase() === 'unknown') return '';
	if (candidate.startsWith('[')) {
		const end = candidate.indexOf(']');
		if (end > 0) candidate = candidate.slice(1, end);
	} else if ((candidate.match(/:/g) || []).length === 1) {
		const [host, port] = candidate.split(':');
		if (/^\d+$/.test(port) && isIP(host) === 4) candidate = host;
	}
	candidate = candidate.split('%')[0];
	return isIP(candidate) ? candidate : '';
}

/** @param {{headers?: Record<string, unknown>, remoteAddress?: string, trustProxy?: boolean}} input */
export function resolveClientIp({ headers, remoteAddress = '', trustProxy = false }) {
	if (trustProxy) {
		const candidates = [
			headers?.['cf-connecting-ip'],
			headers?.['true-client-ip'],
			first(headers?.['x-forwarded-for']),
			headers?.['x-real-ip'],
			forwardedFor(headers?.forwarded)
		];
		for (const value of candidates) {
			const ip = normalizeClientIp(value);
			if (ip) return ip;
		}
	}
	return normalizeClientIp(remoteAddress);
}
