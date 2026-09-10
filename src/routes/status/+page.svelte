<script lang="ts">
	import type { PageData } from './$types';
	import { pbBrowser } from '$lib/pb/client';
	import type { LeaseInstance } from '$lib/types';
	import { untrack, onMount } from 'svelte';
	import StatusList from '$lib/components/status/StatusList.svelte';
	import DiscordQrModal from '$lib/components/DiscordQrModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/state';
	import { MessageSquare } from '@lucide/svelte';

	let { data }: { data: PageData } = $props();

	let items = $state<LeaseInstance[]>(untrack(() => [...data.items]));
	let showDiscordModal = $state<boolean>(false);

	onMount(() => {
		if (page.url.searchParams.has('submitted')) {
			showDiscordModal = true;
		}
	});

	$effect(() => {
		const pb = pbBrowser();
		let unsub: (() => void) | null = null;

		(async () => {
			try {
				const col = (pb as unknown as {
					collection(name: string): {
						subscribe(
							topic: string,
							cb: (e: { action: string; record: { id: string } & Record<string, unknown> }) => void,
							opts?: { expand?: string }
						): Promise<() => void>;
					};
				}).collection('instances');
				unsub = await col.subscribe(
					'*',
					(event) => {
						const rec = event.record as unknown as LeaseInstance;
						if (event.action === 'create') {
							items = [rec, ...items.filter((i) => i.id !== rec.id)];
						} else if (event.action === 'update') {
							items = items.map((i) => (i.id === rec.id ? rec : i));
						} else if (event.action === 'delete') {
							const id = rec.id;
							items = items.filter((i) => i.id !== id);
						}
					},
					{ expand: 'passion_group' }
				);
			} catch (err) {
				console.error('status subscribe failed', err);
			}
		})();

		return () => {
			try {
				unsub?.();
			} catch {
				/* noop */
			}
		};
	});
</script>

<header class="mb-8 flex flex-wrap items-end justify-between gap-4">
	<div>
		<p class="font-mono text-xs uppercase tracking-[0.2em] text-primary">// init.d</p>
		<h1 class="mt-2 text-2xl font-semibold tracking-tight">Status</h1>
		<p class="mt-1 text-sm text-foreground/70">
			Everything you have requested, scoped to
			<span class="font-mono text-foreground">{data.email}</span>.
		</p>
	</div>
	<div class="flex items-center gap-3">
		<Button
			variant="outline"
			onclick={() => (showDiscordModal = true)}
			class="font-mono text-xs uppercase tracking-wider text-indigo-400 hover:text-indigo-300 border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10"
		>
			<MessageSquare class="size-3.5 mr-1.5 text-indigo-400" />
			Discord Community
		</Button>
		<Button
			href="/request"
			variant="outline"
			class="font-mono text-xs uppercase tracking-widest"
		>
			+ new request
		</Button>
	</div>
</header>

<StatusList {items} />

<DiscordQrModal bind:open={showDiscordModal} discordUrl={data.discordLink} />
