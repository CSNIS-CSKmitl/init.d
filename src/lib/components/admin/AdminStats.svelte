<script lang="ts">
	import {
		ADMIN_TIME_RANGES,
		toggleDrilldownFilter,
		type AdminStatusFilter,
		type AdminTimeRange,
		type AdminTrendBucket,
		type AdminTypeFilter
	} from '$lib/admin-stats';
	import AdminTrendChart from '$lib/components/admin/AdminTrendChart.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';

	type StatsInput = {
		total: number;
		pending: number;
		provisioning: number;
		failed: number;
		completed: number;
		deleted: number;
		needAction?: number;
		vm: number;
		container: number;
		cpu: number;
		ram: number;
		disk: number;
		averageProvisionMinutes: number;
		provisionedCount?: number;
		trend?: AdminTrendBucket[];
	};

	let {
		stats,
		timeRange = $bindable<AdminTimeRange>('all'),
		statusFilter = $bindable<AdminStatusFilter>('all'),
		typeFilter = $bindable<AdminTypeFilter>('all'),
		loading = false,
		error = null,
		lastUpdatedAt = null,
		isRealtime = false,
		refreshing = false,
		onRefresh
	}: {
		stats: StatsInput;
		timeRange?: AdminTimeRange;
		statusFilter?: AdminStatusFilter;
		typeFilter?: AdminTypeFilter;
		loading?: boolean;
		error?: string | null;
		lastUpdatedAt?: string | Date | null;
		isRealtime?: boolean;
		refreshing?: boolean;
		onRefresh?: () => void | Promise<void>;
	} = $props();

	const pad2 = (n: number) => String(n).padStart(2, '0');
	const attention = $derived(stats.needAction ?? stats.pending + stats.failed);

	const formattedUpdatedAt = $derived.by(() => {
		if (!lastUpdatedAt) return '—';
		const d = lastUpdatedAt instanceof Date ? lastUpdatedAt : new Date(lastUpdatedAt);
		if (Number.isNaN(d.getTime())) return '—';
		return d.toLocaleTimeString('th-TH', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	});

	function selectStatus(target: AdminStatusFilter) {
		statusFilter = toggleDrilldownFilter(statusFilter, target, 'all');
	}

	function selectType(target: AdminTypeFilter) {
		typeFilter = toggleDrilldownFilter(typeFilter, target, 'all');
	}

	function resetFilters() {
		statusFilter = 'all';
		typeFilter = 'all';
	}
</script>

<div class="flex flex-col gap-3">
	<!-- Toolbar: Time range selector + Realtime/Snapshot indicator + Last updated + Refresh -->
	<div
		class="flex flex-col gap-2.5 rounded-lg border border-border bg-card px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
	>
		<div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="ช่วงเวลาสถิติ">
			<span class="mr-1 font-mono text-[11px] text-muted-foreground">ช่วงเวลา:</span>
			{#each ADMIN_TIME_RANGES as range (range.value)}
				<button
					type="button"
					onclick={() => (timeRange = range.value)}
					aria-pressed={timeRange === range.value}
					class={cn(
						'rounded-md px-2.5 py-1 font-mono text-xs transition-colors',
						timeRange === range.value
							? 'bg-primary text-primary-foreground font-semibold'
							: 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
					)}
				>
					{range.label}
				</button>
			{/each}
		</div>

		<div class="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
			<Badge variant="outline" class="gap-1.5 font-mono text-[11px]">
				<span
					class={cn(
						'h-1.5 w-1.5 rounded-full',
						isRealtime ? 'animate-pulse bg-success' : 'bg-warning'
					)}
				></span>
				{isRealtime ? 'Realtime' : 'Snapshot'}
			</Badge>
			<span class="text-[11px]">อัปเดตล่าสุด {formattedUpdatedAt}</span>
			{#if onRefresh}
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={refreshing || loading}
					onclick={() => onRefresh?.()}
					class="h-7 px-2.5 font-mono text-xs"
				>
					{refreshing ? 'กำลังรีเฟรช...' : 'รีเฟรช'}
				</Button>
			{/if}
		</div>
	</div>

	{#if error}
		<div
			role="alert"
			class="flex flex-col items-start justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center"
		>
			<div>
				<div class="font-semibold">โหลดข้อมูลสถิติไม่ได้</div>
				<div class="font-mono text-xs opacity-90">{error}</div>
			</div>
			{#if onRefresh}
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={() => onRefresh?.()}
					class="font-mono text-xs"
				>
					ลองอีกครั้ง
				</Button>
			{/if}
		</div>
	{:else if loading}
		<div
			role="status"
			class="flex items-center justify-center rounded-lg border border-border bg-card px-4 py-8 font-mono text-xs text-muted-foreground"
		>
			กำลังโหลดสถิติ...
		</div>
	{:else}
		<!-- Status Drill-down Cards -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
			<button
				type="button"
				onclick={() => selectStatus('need-action')}
				aria-pressed={statusFilter === 'need-action'}
				class={cn(
					'cursor-pointer rounded-lg border border-warning/25 bg-warning/5 px-4 py-3 text-left transition-all hover:border-warning/60',
					statusFilter === 'need-action' && 'ring-2 ring-warning border-warning'
				)}
			>
				<div class="text-[11px] text-muted-foreground">ต้องดำเนินการ</div>
				<div class="mt-1 font-mono text-2xl font-semibold text-warning">{pad2(attention)}</div>
			</button>

			<button
				type="button"
				onclick={() => selectStatus('provisioning')}
				aria-pressed={statusFilter === 'provisioning'}
				class={cn(
					'cursor-pointer rounded-lg border border-info/25 bg-info/5 px-4 py-3 text-left transition-all hover:border-info/60',
					statusFilter === 'provisioning' && 'ring-2 ring-info border-info'
				)}
			>
				<div class="text-[11px] text-muted-foreground">กำลังทำงาน</div>
				<div class="mt-1 font-mono text-2xl font-semibold text-info">
					{pad2(stats.provisioning)}
				</div>
			</button>

			<button
				type="button"
				onclick={() => selectStatus('completed')}
				aria-pressed={statusFilter === 'completed'}
				class={cn(
					'cursor-pointer rounded-lg border border-success/25 bg-success/5 px-4 py-3 text-left transition-all hover:border-success/60',
					statusFilter === 'completed' && 'ring-2 ring-success border-success'
				)}
			>
				<div class="text-[11px] text-muted-foreground">เสร็จแล้ว</div>
				<div class="mt-1 font-mono text-2xl font-semibold text-success">
					{pad2(stats.completed)}
				</div>
			</button>

			<button
				type="button"
				onclick={() => selectStatus('failed')}
				aria-pressed={statusFilter === 'failed'}
				class={cn(
					'cursor-pointer rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-left transition-all hover:border-destructive/60',
					statusFilter === 'failed' && 'ring-2 ring-destructive border-destructive'
				)}
			>
				<div class="text-[11px] text-muted-foreground">ล้มเหลว</div>
				<div class="mt-1 font-mono text-2xl font-semibold text-destructive">
					{pad2(stats.failed)}
				</div>
			</button>

			<button
				type="button"
				onclick={() => selectStatus('deleted')}
				aria-pressed={statusFilter === 'deleted'}
				class={cn(
					'cursor-pointer rounded-lg border border-border bg-card px-4 py-3 text-left transition-all hover:border-primary/40',
					statusFilter === 'deleted' && 'ring-2 ring-primary border-primary'
				)}
			>
				<div class="text-[11px] text-muted-foreground">ลบแล้ว</div>
				<div class="mt-1 font-mono text-2xl font-semibold text-muted-foreground">
					{pad2(stats.deleted)}
				</div>
			</button>

			<button
				type="button"
				onclick={() => selectStatus('all')}
				aria-pressed={statusFilter === 'all'}
				class={cn(
					'cursor-pointer rounded-lg border border-border bg-card px-4 py-3 text-left transition-all hover:border-primary/40',
					statusFilter === 'all' && 'ring-1 ring-border'
				)}
			>
				<div class="text-[11px] text-muted-foreground">รายการทั้งหมด</div>
				<div class="mt-1 font-mono text-2xl font-semibold text-foreground">
					{pad2(stats.total)}
				</div>
			</button>
		</div>

		<!-- App-specific Resource & Type Metrics (with VM / Container drill-down) -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
			<div class="rounded-lg border border-border bg-card px-4 py-3">
				<div class="text-[11px] text-muted-foreground">VM / Container (คลิกกรอง)</div>
				<div class="mt-1 flex items-center gap-1.5 font-mono text-lg font-semibold">
					<button
						type="button"
						onclick={() => selectType('vm')}
						aria-pressed={typeFilter === 'vm'}
						class={cn(
							'cursor-pointer rounded px-1.5 py-0.5 transition-colors',
							typeFilter === 'vm'
								? 'bg-primary text-primary-foreground'
								: 'hover:bg-muted text-foreground'
						)}
					>
						VM {stats.vm}
					</button>
					<span class="text-muted-foreground">/</span>
					<button
						type="button"
						onclick={() => selectType('container')}
						aria-pressed={typeFilter === 'container'}
						class={cn(
							'cursor-pointer rounded px-1.5 py-0.5 transition-colors',
							typeFilter === 'container'
								? 'bg-info text-info-foreground'
								: 'hover:bg-muted text-foreground'
						)}
					>
						CT {stats.container}
					</button>
				</div>
			</div>

			<div class="rounded-lg border border-border bg-card px-4 py-3">
				<div class="text-[11px] text-muted-foreground">CPU ที่ขอรวม</div>
				<div class="mt-1 font-mono text-lg font-semibold">{stats.cpu} cores</div>
			</div>

			<div class="rounded-lg border border-border bg-card px-4 py-3">
				<div class="text-[11px] text-muted-foreground">RAM ที่ขอรวม</div>
				<div class="mt-1 font-mono text-lg font-semibold">{stats.ram} GB</div>
			</div>

			<div class="rounded-lg border border-border bg-card px-4 py-3">
				<div class="text-[11px] text-muted-foreground">Disk ที่ขอรวม</div>
				<div class="mt-1 font-mono text-lg font-semibold">{stats.disk} GB</div>
			</div>

			<div class="rounded-lg border border-border bg-card px-4 py-3">
				<div class="text-[11px] text-muted-foreground">เวลา Provision เฉลี่ย</div>
				<div class="mt-1 font-mono text-lg font-semibold">
					{stats.averageProvisionMinutes} นาที
				</div>
			</div>
		</div>

		{#if statusFilter !== 'all' || typeFilter !== 'all'}
			<div
				class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 font-mono text-xs"
			>
				<div class="flex flex-wrap items-center gap-2 text-foreground">
					<span>ตัวกรองจากกราฟ/สถิติ:</span>
					{#if statusFilter !== 'all'}
						<Badge variant="secondary" class="font-mono text-[11px]">
							สถานะ: {statusFilter}
						</Badge>
					{/if}
					{#if typeFilter !== 'all'}
						<Badge variant="secondary" class="font-mono text-[11px]">
							ประเภท: {typeFilter === 'vm' ? 'VM' : 'Container'}
						</Badge>
					{/if}
				</div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={resetFilters}
					class="h-6 px-2 font-mono text-xs"
				>
					ล้างตัวกรอง
				</Button>
			</div>
		{/if}

		<!-- Trend Chart -->
		<AdminTrendChart buckets={stats.trend ?? []} {timeRange} />
	{/if}
</div>
