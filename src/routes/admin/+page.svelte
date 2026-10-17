<script lang="ts">
	import type { PageData } from './$types';
	import { pbBrowser } from '$lib/pb/client';
	import type { LeaseInstance } from '$lib/types';
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import AdminStats from '$lib/components/admin/AdminStats.svelte';
	import AdminQueueTable from '$lib/components/admin/AdminQueueTable.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import {
		computeAdminStats,
		filterInstancesByTimeRange,
		type AdminStatusFilter,
		type AdminTimeRange,
		type AdminTypeFilter
	} from '$lib/admin-stats';

	let {
		data,
		form
	}: {
		data: PageData & { loadedAt?: string; loadError?: string | null };
		form: { error?: string; id?: string; recordId?: string } | null;
	} = $props();

	// Live list — starts from the SSR snapshot and grows as the realtime
	// subscription fires.
	let items = $state<LeaseInstance[]>(untrack(() => [...data.items]));
	let connectionState = $state<'connecting' | 'live' | 'offline'>('connecting');
	let progressMap = $state<Record<string, { status: string; error?: string; taskState?: string }>>({});
	let timeRange = $state<AdminTimeRange>('all');
	let statusFilter = $state<AdminStatusFilter>('all');
	let typeFilter = $state<AdminTypeFilter>('all');
	let lastUpdatedAt = $state<string>(untrack(() => data.loadedAt ?? new Date().toISOString()));
	let statsError = $state<string | null>(untrack(() => data.loadError ?? null));
	let refreshing = $state<boolean>(false);

	// Keep items synchronized when data.items updates (e.g. after invalidateAll)
	$effect(() => {
		items = [...data.items];
		statsError = data.loadError ?? null;
		if (data.loadedAt) {
			lastUpdatedAt = data.loadedAt;
		} else {
			lastUpdatedAt = new Date().toISOString();
		}
	});

	async function fetchProvisionStatus() {
		const res = await fetch('/api/provision-status');
		if (!res.ok) return null;
		return (await res.json()) as Record<string, { status: string; error?: string; taskState?: string }>;
	}

	async function handleRefresh() {
		if (refreshing) return;
		refreshing = true;
		try {
			await invalidateAll();
			const latestProgress = await fetchProvisionStatus().catch(() => null);
			if (latestProgress) {
				progressMap = latestProgress;
			}
			lastUpdatedAt = new Date().toISOString();
		} catch (err) {
			console.error('Failed to refresh admin stats', err);
			statsError = 'ไม่สามารถรีเฟรชข้อมูลสถิติได้';
		} finally {
			refreshing = false;
		}
	}

	$effect(() => {
		let active = true;
		const poll = async () => {
			try {
				const latest = await fetchProvisionStatus();
				if (latest && active) {
					progressMap = latest;
					// Trigger page data reload if any pending item completes provisioning
					let hasCompleted = false;
					for (const item of items) {
						if (
							item.status !== 'deleted' &&
							((latest[item.id]?.status === 'Complete' && item.status !== 'completed') ||
								(latest[item.id]?.status === 'Failed' && item.status !== 'failed'))
						) {
							hasCompleted = true;
						}
					}
					if (hasCompleted) {
						await invalidateAll();
						lastUpdatedAt = new Date().toISOString();
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

	// Same classifier the table uses for its badges, computed over the selected time range.
	const stats = $derived(computeAdminStats(items, progressMap, { range: timeRange }));
	const rangeItems = $derived(filterInstancesByTimeRange(items, timeRange));

	$effect(() => {
		const pb = pbBrowser();
		let unsub: (() => void) | null = null;

		(async () => {
			try {
				// Subscribe to the whole collection — admins have listRule
				// access to every row.
				const col = (
					pb as unknown as {
						collection(name: string): {
							subscribe(
								topic: string,
								cb: (e: { action: string; record: { id: string } & Record<string, unknown> }) => void,
								opts?: { expand?: string }
							): Promise<() => void>;
						};
					}
				).collection('instances');
				unsub = await col.subscribe(
					'*',
					(event) => {
						lastUpdatedAt = new Date().toISOString();
						if (event.action === 'create') {
							// Invalidate to trigger page reload using superuser client so we get expanded email
							invalidateAll();
						} else if (event.action === 'update') {
							const rec = event.record as unknown as LeaseInstance;

							// If the update event does not have expanded email (due to client permissions),
							// preserve the existing expanded email from our list.
							const old = items.find((i) => i.id === rec.id);
							if (old && JSON.stringify(old.owners ?? []) !== JSON.stringify(rec.owners ?? [])) {
								void invalidateAll();
							}
							rec.owner_emails = old?.owner_emails;
							rec.requester_email = old?.requester_email;
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
					{ expand: 'passion_group,email,owners' }
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

<div class="flex flex-col gap-7">
	<div
		class="flex flex-col items-start justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center"
	>
		<div class="flex flex-col gap-1">
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				จัดการคำขอใช้งานเซิร์ฟเวอร์
			</h1>
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
				>{connectionState === 'live'
					? 'ACTIVE'
					: connectionState === 'connecting'
						? 'SYNCING'
						: 'OFFLINE'}</span
			>
		</Badge>
	</div>

	<!-- Mini Dashboard Analytics -->
	<AdminStats
		{stats}
		bind:timeRange
		bind:statusFilter
		bind:typeFilter
		loading={refreshing && items.length === 0}
		error={statsError}
		{lastUpdatedAt}
		isRealtime={connectionState === 'live'}
		{refreshing}
		onRefresh={handleRefresh}
	/>

	<!-- Data Table -->
	<AdminQueueTable
		items={rangeItems}
		{form}
		{progressMap}
		userId={data.user?.id ?? ''}
		bind:filterTab={statusFilter}
		bind:typeFilter
	/>
</div>
