import { json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { loadAnnouncements } from '$lib/server/announcements';
import { adminPb } from '$lib/server/instance-owners';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals }) => {
  try { return json({ items: await loadAnnouncements(locals.pb, 'initd'), configured: true }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (cause) {
    const missing = (cause as { status?: number }).status === 404;
    return json({ items: [], configured: false }, { status: missing ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
};

export const POST: RequestHandler = async (event) => {
	let payload: Record<string, unknown> = {};
	try {
		payload = (await event.request.json()) as Record<string, unknown>;
	} catch {
		return json({ ok: false }, { status: 400 });
	}

	const announcement = String(payload.announcement || payload.id || '').trim();
	const revision = String(payload.revision || 'default').trim().slice(0, 100);
	if (!announcement || announcement === 'legacy-flood' || !/^[a-zA-Z0-9_-]{1,32}$/.test(announcement)) {
		return json({ ok: true, recorded: false });
	}

	const user = event.locals.user?.id || undefined;
	let ip = '127.0.0.1';
	try { ip = event.getClientAddress(); } catch { /* best effort */ }
	const viewer_hash = createHash('sha256')
		.update(`${user || ip}:${event.request.headers.get('user-agent') || 'unknown'}`)
		.digest('hex')
		.slice(0, 64);

	try {
		const pb = await adminPb();
		await pb.collection('announcement_reads').create({
			announcement,
			revision,
			site: 'initd',
			...(user ? { user } : {}),
			viewer_hash
		});
		return json({ ok: true, recorded: true });
	} catch {
		return json({ ok: true, recorded: false });
	}
};
