<script lang="ts">
	let {
		stats,
	}: {
		stats: { total: number; pending: number; provisioning: number; failed: number; completed: number; deleted: number };
	} = $props();

	const pad3 = (n: number) => String(n).padStart(2, "0");
	const attention = $derived(stats.pending + stats.failed);
</script>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
	<div class="rounded-lg border border-warning/25 bg-warning/5 px-4 py-3">
		<div class="text-[11px] text-muted-foreground">ต้องดำเนินการ</div>
		<div class="mt-1 font-mono text-2xl font-semibold text-warning">{pad3(attention)}</div>
	</div>
	<div class="rounded-lg border border-info/25 bg-info/5 px-4 py-3">
		<div class="text-[11px] text-muted-foreground">กำลังทำงาน</div>
		<div class="mt-1 font-mono text-2xl font-semibold text-info">{pad3(stats.provisioning)}</div>
	</div>
	<div class="rounded-lg border border-success/25 bg-success/5 px-4 py-3">
		<div class="text-[11px] text-muted-foreground">เสร็จแล้ว</div>
		<div class="mt-1 font-mono text-2xl font-semibold text-success">{pad3(stats.completed)}</div>
	</div>
	<div class="rounded-lg border border-border bg-card px-4 py-3">
		<div class="text-[11px] text-muted-foreground">รายการทั้งหมด</div>
		<div class="mt-1 font-mono text-2xl font-semibold text-foreground">{pad3(stats.total)}</div>
	</div>
</div>
