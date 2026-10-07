<script lang="ts">
	let {
		stats,
	}: {
		stats: { total: number; pending: number; provisioning: number; failed: number; completed: number; deleted: number };
	} = $props();

	const pad3 = (n: number) => String(n).padStart(3, "0");
</script>

<div class="grid grid-cols-2 gap-6 font-mono sm:grid-cols-3 lg:grid-cols-6">
	<div class="flex flex-col gap-1">
		<div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
			Total Requests
		</div>
		<div class="text-xl font-bold text-foreground">{pad3(stats.total)}</div>
	</div>
	<div class="flex flex-col gap-1">
		<div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
			Pending
		</div>
		<div class="text-xl font-bold text-warning">
			{pad3(stats.pending)}
		</div>
	</div>
	<div class="flex flex-col gap-1">
		<div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
			Provisioning
		</div>
		<div class="text-xl font-bold text-info">
			{pad3(stats.provisioning)}
		</div>
	</div>
	<div class="flex flex-col gap-1">
		<div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
			Failed
		</div>
		<div class="text-xl font-bold text-destructive">
			{pad3(stats.failed)}
		</div>
	</div>
	<div class="flex flex-col gap-1">
		<div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
			Completed
		</div>
		<div class="text-xl font-bold text-success">
			{pad3(stats.completed)}
		</div>
	</div>
	<div class="flex flex-col gap-1">
		<div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Deleted</div>
		<div class="text-xl font-bold text-muted-foreground">{pad3(stats.deleted)}</div>
	</div>
</div>
