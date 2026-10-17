<script lang="ts">
	import type { AdminTimeRange, AdminTrendBucket } from '$lib/admin-stats';
	import { ADMIN_TIME_RANGES } from '$lib/admin-stats';

	let {
		buckets = [],
		timeRange = 'all'
	}: {
		buckets: AdminTrendBucket[];
		timeRange?: AdminTimeRange;
	} = $props();

	const maxTotal = $derived(Math.max(1, ...buckets.map((b) => b.total)));
	const periodTotal = $derived(buckets.reduce((sum, b) => sum + b.total, 0));
	const periodVm = $derived(buckets.reduce((sum, b) => sum + b.vm, 0));
	const periodContainer = $derived(buckets.reduce((sum, b) => sum + b.container, 0));
	const rangeLabel = $derived(
		ADMIN_TIME_RANGES.find((r) => r.value === timeRange)?.label ?? 'ทั้งหมด'
	);
</script>

<div class="rounded-lg border border-border bg-card p-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div>
			<div class="text-xs font-semibold text-foreground">
				แนวโน้มคำขอสร้าง VM / Container ({rangeLabel})
			</div>
			<div class="font-mono text-[11px] text-muted-foreground">
				รวม {periodTotal} รายการ · VM {periodVm} · Container {periodContainer}
			</div>
		</div>
		<div class="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
			<span class="inline-flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-xs bg-primary"></span>
				VM
			</span>
			<span class="inline-flex items-center gap-1.5">
				<span class="h-2.5 w-2.5 rounded-xs bg-info"></span>
				Container
			</span>
		</div>
	</div>

	{#if buckets.length === 0 || periodTotal === 0}
		<div
			class="mt-3 flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 font-mono text-xs text-muted-foreground"
		>
			ไม่มีคำขอที่สร้างในช่วงเวลานี้
		</div>
	{:else}
		<div class="mt-4 flex h-28 items-end gap-1.5 overflow-x-auto pb-1">
			{#each buckets as bucket (bucket.key)}
				{@const vmHeight = bucket.total > 0 ? Math.round((bucket.vm / maxTotal) * 100) : 0}
				{@const ctHeight =
					bucket.total > 0 ? Math.round((bucket.container / maxTotal) * 100) : 0}
				<div
					class="group flex min-w-[22px] flex-1 flex-col items-center gap-1"
					title="{bucket.label}: รวม {bucket.total} (VM {bucket.vm}, Container {bucket.container})"
				>
					<div class="font-mono text-[10px] text-muted-foreground">
						{bucket.total > 0 ? bucket.total : ''}
					</div>
					<div
						class="flex h-16 w-full max-w-[32px] flex-col justify-end overflow-hidden rounded-t-xs bg-muted/40"
					>
						{#if bucket.container > 0}
							<div
								class="w-full bg-info transition-all"
								style="height: {Math.max(ctHeight, 8)}%"
							></div>
						{/if}
						{#if bucket.vm > 0}
							<div
								class="w-full bg-primary transition-all"
								style="height: {Math.max(vmHeight, 8)}%"
							></div>
						{/if}
					</div>
					<div class="max-w-full truncate font-mono text-[10px] text-muted-foreground">
						{bucket.label}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
