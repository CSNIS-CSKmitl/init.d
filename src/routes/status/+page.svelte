<script lang="ts">
	import type { PageData } from './$types';
	import { pbBrowser } from '$lib/pb/client';
	import type { LeaseInstance } from '$lib/types';
	import { untrack } from 'svelte';
	import StatusList from '$lib/components/status/StatusList.svelte';
	import { Button } from '$lib/components/ui/button';

	let { data }: { data: PageData } = $props();

	// Live list — starts from the SSR snapshot and grows as the realtime
	// subscription fires. The viewRule on `instances` already restricts
	// realtime events to rows the user can see (their own), so we just
	// merge everything we receive — no client-side creator filter needed.
	let items = $state<LeaseInstance[]>(untrack(() => [...data.items]));

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
	<Button
		href="/request"
		variant="outline"
		class="font-mono text-xs uppercase tracking-widest"
	>
		+ new request
	</Button>
</header>

<StatusList {items} />
