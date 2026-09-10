// Root server load — surfaces the resolved session and DISCORD_LINK env to every page.
import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: LayoutServerLoad = async ({ locals }) => {
	const discordLink = env.DISCORD_LINK || 'https://discord.gg/y8RdYEStQk';
	return { user: locals.user, discordLink };
};
