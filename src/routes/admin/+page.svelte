<script lang="ts">
	import type { PageData } from './$types';
	import { pbBrowser } from '$lib/pb/client';
	import type { LeaseInstance } from '$lib/types';
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import AdminStats from '$lib/components/admin/AdminStats.svelte';
	import AdminQueueTable from '$lib/components/admin/AdminQueueTable.svelte';

	let { data, form }: { data: PageData; form: { error?: string; id?: string; recordId?: string } | null } = $props();

	// Live list — starts from the SSR snapshot and grows as the realtime
	// subscription fires.
	let items = $state<LeaseInstance[]>(untrack(() => [...data.items]));
	let connectionState = $state<'connecting' | 'live' | 'offline'>('connecting');
	let progressMap = $state<Record<string, { status: string; error?: string }>>({});

	$effect(() => {
		let active = true;
		const poll = async () => {
			try {
				const res = await fetch('/api/provision-status');
				if (res.ok) {
					const data = await res.json();
					if (active) {
						progressMap = data;
						// Trigger page data reload if any pending item completes provisioning
						let hasCompleted = false;
						for (const item of items) {
							if (item.status === 'pending' && data[item.id]?.status === 'Complete') {
								hasCompleted = true;
							}
						}
						if (hasCompleted) {
							invalidateAll();
						}
					}
				}
			} catch (err) {
				console.error('Failed to poll provision status', err);
			}
		};

		poll(); // initial fetch
		const interval = setInterval(poll, 2000);

		return () => {
			active = false;
			clearInterval(interval);
		};
	});

	const stats = $derived({
		total: items.length,
		pending: items.filter((i) => i.status === 'pending').length,
		completed: items.filter((i) => i.status === 'completed').length
	});

	$effect(() => {
		const pb = pbBrowser();
		let unsub: (() => void) | null = null;

		(async () => {
			try {
				// Subscribe to the whole collection — admins have listRule
				// access to every row.
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
						if (event.action === 'create') {
							const rec = event.record as unknown as LeaseInstance;
							items = [rec, ...items.filter((i) => i.id !== rec.id)];
						} else if (event.action === 'update') {
							const rec = event.record as unknown as LeaseInstance;
							items = items.map((i) => (i.id === rec.id ? rec : i));
						} else if (event.action === 'delete') {
							const id = event.record.id;
							items = items.filter((i) => i.id !== id);
						}
					},
					{ expand: 'passion_group' }
				);
				connectionState = 'live';
			} catch (err) {
				console.error('admin subscribe failed', err);
				connectionState = 'offline';
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

<div class="space-y-12">
	<!-- Header — INFRASTRUCTURE_QUEUE -->
	<div
		class="flex flex-col items-start justify-between gap-4 border-b border-app pb-6 sm:flex-row sm:items-center"
	>
		<div class="space-y-1">
			<h1 class="font-mono-app text-xl font-medium tracking-tight text-app">
				// INFRASTRUCTURE_QUEUE
			</h1>
			<p class="text-sm text-secondary-app">
				รายการคิวสเปค ระยะเวลา และพอร์ตที่ขอใช้งานเซิร์ฟเวอร์จาก PocketBase
			</p>
		</div>

		<div
			class="flex items-center gap-2 rounded-full border border-app bg-elevated px-3 py-1 font-mono-app text-xs text-secondary-app"
		>
			<span
				class="h-1.5 w-1.5 animate-pulse rounded-full {connectionState === 'live'
					? 'bg-accent'
					: connectionState === 'connecting'
						? 'bg-muted-app'
						: ''}"
				style={connectionState === 'offline' ? 'background-color: var(--danger)' : ''}
			></span>
			<span
				>PB_STREAM: {connectionState === 'live'
					? 'ACTIVE'
					: connectionState === 'connecting'
						? 'SYNCING'
						: 'OFFLINE'}</span
			>
		</div>
	</div>

	<!-- Mini Dashboard Analytics -->
	<AdminStats {stats} />

	<!-- Data Table -->
	<AdminQueueTable {items} {form} {progressMap} />
</div>

