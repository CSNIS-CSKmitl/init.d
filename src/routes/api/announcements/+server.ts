import { json } from '@sveltejs/kit';
import { loadAnnouncements } from '$lib/server/announcements';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals }) => {
  try { return json({ items: await loadAnnouncements(locals.pb, 'initd'), configured: true }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (cause) {
    const missing = (cause as { status?: number }).status === 404;
    return json({ items: [], configured: false }, { status: missing ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
};
