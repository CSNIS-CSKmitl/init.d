<script lang="ts">
	import type { PageData } from './$types';
	import { pbBrowser } from '$lib/pb/client';
	import type { LeaseInstance } from '$lib/types';
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import AdminStats from '$lib/components/admin/AdminStats.svelte';
	import AdminQueueTable from '$lib/components/admin/AdminQueueTable.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { leaseBadgeStatus } from '$lib/leaseStatus';

	let { data, form }: { data: PageData; form: { error?: string; id?: string; recordId?: string } | null } = $props();

	// Live list — starts from the SSR snapshot and grows as the realtime
	// subscription fires.
	let items = $state<LeaseInstance[]>(untrack(() => [...data.items]));
	let connectionState = $state<'connecting' | 'live' | 'offline'>('connecting');
	let progressMap = $state<Record<string, { status: string; error?: string }>>({});

	// Keep items synchronized when data.items updates (e.g. after invalidateAll)
	$effect(() => {
		items = [...data.items];
	});

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

	// Same classifier the table uses for its badges, so this bar can never
	// disagree with what the admin sees row-by-row (it used to: this only
	// checked `item.status`, while the table also folds in live progress).
	const stats = $derived.by(() => {
		const counts = { total: items.length, pending: 0, provisioning: 0, failed: 0, completed: 0 };
		for (const item of items) {
			counts[leaseBadgeStatus(item, progressMap[item.id])]++;
		}
		return counts;
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
							// Invalidate to trigger page reload using superuser client so we get expanded email
							invalidateAll();
						} else if (event.action === 'update') {
							const rec = event.record as unknown as LeaseInstance;

							// If the update event does not have expanded email (due to client permissions),
							// preserve the existing expanded email from our list.
							const old = items.find((i) => i.id === rec.id);
							if (old && old.expand?.email && !rec.expand?.email?.email) {
								rec.expand = {
									...rec.expand,
									email: {
										...old.expand.email,
										...(rec.expand?.email || {})
									}
								};
							}
							items = items.map((i) => (i.id === rec.id ? rec : i));
						} else if (event.action === 'delete') {
							const id = event.record.id;
							items = items.filter((i) => i.id !== id);
						}
					},
					{ expand: 'passion_group,email' }
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

<div class="flex flex-col gap-12">
	<!-- Header — INFRASTRUCTURE_QUEUE -->
	<div
		class="flex flex-col items-start justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center"
	>
		<div class="flex flex-col gap-1">
			<h1 class="font-mono text-xl font-medium tracking-tight text-foreground">
				// INFRASTRUCTURE_QUEUE
			</h1>
			<p class="text-sm text-foreground/70">
				รายการคิวสเปค ระยะเวลา และพอร์ตที่ขอใช้งานเซิร์ฟเวอร์จาก PocketBase
			</p>
		</div>

		<Badge variant="outline" class="gap-2 font-mono text-xs text-muted-foreground">
			<span
				class="h-1.5 w-1.5 animate-pulse rounded-full {connectionState === 'live'
					? 'bg-success'
					: connectionState === 'connecting'
						? 'bg-warning'
						: 'bg-destructive'}"
			></span>
			<span
				>PB_STREAM: {connectionState === 'live'
					? 'ACTIVE'
					: connectionState === 'connecting'
						? 'SYNCING'
						: 'OFFLINE'}</span
			>
		</Badge>
	</div>

	<!-- Mini Dashboard Analytics -->
	<AdminStats {stats} />

	<!-- Data Table -->
	<AdminQueueTable {items} {form} {progressMap} />
</div>
