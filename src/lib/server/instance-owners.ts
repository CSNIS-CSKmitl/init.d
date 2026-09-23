import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/private';
import type { LeaseInstance } from '$lib/types';

export function canAccessInstance(record: LeaseInstance, userId: string, isAdmin = false): boolean {
	return isAdmin || record.email === userId || (record.owners ?? []).includes(userId);
}

export function canManageOwners(record: LeaseInstance, userId: string, isAdmin = false): boolean {
	return isAdmin || record.email === userId;
}

export async function adminPb(): Promise<PocketBase> {
	const pb = new PocketBase(env.POCKETBASE_URL);
	pb.autoCancellation(false);
	await pb.admins.authWithPassword(env.PB_ADMIN_EMAIL, env.PB_ADMIN_PASSWORD);
	return pb;
}

export async function resolveOwnerIds(pb: PocketBase, raw: string, requesterId: string): Promise<string[]> {
	const emails = [...new Set(raw.split(/[\s,;]+/).map((value) => value.trim().toLowerCase()).filter(Boolean))];
	if (emails.length > 10) throw new Error('Add up to 10 co-owners.');
	if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
		throw new Error('Enter valid co-owner email addresses.');
	}
	const ids: string[] = [];
	for (const email of emails) {
		const user = await pb.collection('users').getFirstListItem<{ id: string }>(pb.filter('email = {:email}', { email })).catch(() => null);
		if (!user) throw new Error(`No account found for ${email}.`);
		if (user.id !== requesterId) ids.push(user.id);
	}
	return ids;
}

export async function addOwnerEmails(pb: PocketBase, items: LeaseInstance[]): Promise<LeaseInstance[]> {
	const ids = [...new Set(items.flatMap((item) => [item.email, ...(item.owners ?? [])]))];
	const emails = new Map<string, string>();
	await Promise.all(ids.map(async (id) => {
		const user = await pb.collection('users').getOne<{ email: string }>(id, { fields: 'id,email' }).catch(() => null);
		if (user?.email) emails.set(id, user.email);
	}));
	return items.map((item) => ({
		...item,
		requester_email: emails.get(item.email) ?? item.expand?.email?.email,
		owner_emails: (item.owners ?? []).map((id) => emails.get(id)).filter((email): email is string => !!email)
	}));
}
