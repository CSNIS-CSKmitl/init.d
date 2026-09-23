<script lang="ts">
	type Series = { label: string; color: string; values: (number | null)[] };
	let {
		title,
		times,
		series,
		maxValue,
		formatValue
	}: {
		title: string;
		times: number[];
		series: Series[];
		maxValue?: number;
		formatValue: (value: number) => string;
	} = $props();

	let ceiling = $derived(
		Math.max(1, maxValue ?? 0, ...series.flatMap((line) => line.values.filter((value): value is number => value !== null)))
	);
	let start = $derived(times[0] ?? 0);
	let span = $derived(Math.max(1, (times.at(-1) ?? start) - start));
	let hasData = $derived(series.some((line) => line.values.some((value) => value !== null)));

	function pathFor(values: (number | null)[]) {
		let drawing = false;
		return values.map((value, index) => {
			if (value === null || !Number.isFinite(value)) {
				drawing = false;
				return '';
			}
			const x = 8 + (((times[index] ?? start) - start) / span) * 584;
			const y = 132 - (Math.max(0, value) / ceiling) * 120;
			const command = drawing ? 'L' : 'M';
			drawing = true;
			return `${command}${x.toFixed(1)},${y.toFixed(1)}`;
		}).join(' ');
	}

	function timeLabel(value: number) {
		return new Date(value * 1000).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	}
</script>

<section class="rounded-xl border border-border bg-card p-4" aria-label={title}>
	<div class="mb-3 flex flex-wrap items-start justify-between gap-2">
		<h3 class="text-sm font-semibold text-foreground">{title}</h3>
		<div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
			{#each series as line (line.label)}
				<span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full" style:background-color={line.color}></span>{line.label}</span>
			{/each}
		</div>
	</div>
	{#if hasData}
		<div class="relative pl-11">
			<div class="absolute left-0 top-0 flex h-36 flex-col justify-between py-1 text-[10px] text-muted-foreground">
				<span>{formatValue(ceiling)}</span><span>{formatValue(ceiling / 2)}</span><span>0</span>
			</div>
			<svg class="h-36 w-full overflow-visible" viewBox="0 0 600 144" preserveAspectRatio="none" role="img" aria-label={`${title} ย้อนหลัง ${timeLabel(start)} ถึง ${timeLabel(times.at(-1) ?? start)}`}>
				<title>{title}</title>
				<path d="M8 12 H592 M8 72 H592 M8 132 H592" fill="none" stroke="currentColor" stroke-opacity="0.16" stroke-dasharray="3 4" />
				{#each series as line (line.label)}
					<path d={pathFor(line.values)} fill="none" stroke={line.color} stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
				{/each}
			</svg>
		</div>
		<div class="mt-2 flex justify-between pl-11 text-[10px] text-muted-foreground"><span>{timeLabel(start)}</span><span>{timeLabel(times.at(-1) ?? start)}</span></div>
	{:else}
		<div class="flex h-40 items-center justify-center rounded-lg bg-muted/40 text-xs text-muted-foreground">ยังไม่มีข้อมูลกราฟในช่วงเวลานี้</div>
	{/if}
</section>
