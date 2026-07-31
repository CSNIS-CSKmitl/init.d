<script lang="ts">
	let {
		hostname = "",
		type = "vm",
		os_template = "",
		passionGroupName = "—",
		cpu = 2,
		ram = 1,
		disk = 10,
		network_type = "local",
		dns_name = "",
		portsList = [],
		start_date = "",
		end_date = "",
		leaseDays = null,
		isEdit = false,
	}: {
		hostname: string;
		type: "vm" | "container";
		os_template: string;
		passionGroupName: string;
		cpu: number;
		ram: number;
		disk: number;
		network_type: "local" | "public";
		dns_name: string;
		portsList: string[];
		start_date: string;
		end_date: string;
		leaseDays: number | null;
		isEdit?: boolean;
	} = $props();

	const TH_MONTHS = [
		"ม.ค.",
		"ก.พ.",
		"มี.ค.",
		"เม.ย.",
		"พ.ค.",
		"มิ.ย.",
		"ก.ค.",
		"ส.ค.",
		"ก.ย.",
		"ต.ค.",
		"พ.ย.",
		"ธ.ค.",
	];
	const fmtDate = (d: string) => {
		if (!d) return "—";
		const dt = new Date(d);
		return `${dt.getDate()} ${TH_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
	};
</script>

<aside
	class="space-y-8 font-mono-app text-xs lg:col-span-1 lg:self-start lg:sticky lg:top-20 lg:border-l lg:border-app lg:pl-12"
>
	<div class="space-y-1">
		<div
			class="text-[10px] font-bold uppercase tracking-widest text-muted-app"
		>
			System Preview
		</div>
		<div class="font-sans text-sm font-bold text-app">
			{hostname || "—"}
		</div>
	</div>

	<div class="space-y-4">
		<div class="flex justify-between border-b border-app/50 pb-2">
			<span class="text-muted-app">Node Type:</span>
			<span class="font-bold text-accent"
				>{type === "vm" ? "VM (KVM)" : "Container (LXC)"}</span
			>
		</div>
		<div class="flex justify-between border-b border-app/50 pb-2">
			<span class="text-muted-app">Template:</span>
			<span class="text-secondary-app">{os_template || "—"}</span>
		</div>
		<div class="flex justify-between border-b border-app/50 pb-2">
			<span class="text-muted-app">Group:</span>
			<span class="text-secondary-app">{passionGroupName}</span>
		</div>
	</div>

	<div class="space-y-2 rounded-lg border border-app/60 bg-elevated/10 p-4">
		<div
			class="text-[10px] font-bold uppercase tracking-wider text-muted-app"
		>
			Allocated Specs
		</div>
		<div class="flex justify-between">
			<span>• CPU:</span><span class="font-bold text-app border-solid"
				>{cpu} Cores</span
			>
		</div>
		<div class="flex justify-between">
			<span>• RAM:</span><span class="font-bold text-app">{ram} GB</span>
		</div>
		<div class="flex justify-between">
			<span>• Disk:</span><span class="font-bold text-app">{disk} GB</span
			>
		</div>
	</div>

	<div class="space-y-2 rounded-lg border border-app/60 bg-elevated/10 p-4">
		<div
			class="text-[10px] font-bold uppercase tracking-wider text-muted-app"
		>
			Network & Ports
		</div>
		<div class="flex justify-between">
			<span>Access:</span>
			<span class="text-secondary-app"
				>{network_type === "local" ? "LOCAL" : "PUBLIC"}</span
			>
		</div>
		<div class="flex justify-between gap-2">
			<span>DNS:</span>
			<span class="text-secondary-app">{dns_name || "—"}</span>
		</div>
		<div class="flex justify-between gap-2">
			<span>Open Ports:</span>
			<span class="font-bold text-accent">
				{portsList.length ? portsList.join(", ") : "None"}
			</span>
		</div>
	</div>

	<div class="space-y-2 rounded-lg border border-app/60 bg-elevated/10 p-4">
		<div
			class="text-[10px] font-bold uppercase tracking-wider text-muted-app"
		>
			Lease Duration
		</div>
		<div class="flex justify-between">
			<span>Start Date:</span><span class="text-secondary-app"
				>{fmtDate(start_date)}</span
			>
		</div>
		<div class="flex justify-between">
			<span>End Date:</span><span class="font-bold text-accent"
				>{fmtDate(end_date)}</span
			>
		</div>
		<div class="flex justify-between">
			<span>Duration:</span><span class="text-secondary-app"
				>{leaseDays ?? "—"} days</span
			>
		</div>
	</div>

	<div class="flex items-center justify-center gap-4">
		<input type="hidden" name="quantity" value="1" />
		{#if isEdit}
			<a
				href="/status"
				class="inline-flex h-10 items-center justify-center rounded-lg bg-surface border border-app px-4 font-mono-app text-xs font-bold uppercase tracking-wider text-secondary-app transition hover:border-strong-app hover:text-app"
			>
				cancel
			</a>
		{/if}
		<button
			type="submit"
			class="w-full rounded-lg bg-accent px-6 py-3 font-mono-app text-xs font-bold uppercase tracking-wider text-zinc-950 shadow-md transition hover:opacity-90 sm:w-auto"
		>
			{isEdit ? "save" : "send"}
		</button>
	</div>
</aside>
