<script lang="ts">
	import * as Card from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";

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
	class="flex flex-col gap-8 font-mono text-xs lg:sticky lg:top-20 lg:col-span-1 lg:self-start lg:border-l lg:border-border lg:pl-12"
>
	<div class="flex flex-col gap-1">
		<div
			class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
		>
			System Preview
		</div>
		<div class="font-sans text-sm font-bold text-foreground">
			{hostname || "—"}
		</div>
	</div>

	<div class="flex flex-col gap-4">
		<div class="flex justify-between border-b border-border/50 pb-2">
			<span class="text-muted-foreground">Node Type:</span>
			<span class="font-bold text-primary"
				>{type === "vm" ? "VM (KVM)" : "Container (LXC)"}</span
			>
		</div>
		<div class="flex justify-between border-b border-border/50 pb-2">
			<span class="text-muted-foreground">Template:</span>
			<span class="text-foreground/70">{os_template || "—"}</span>
		</div>
		<div class="flex justify-between border-b border-border/50 pb-2">
			<span class="text-muted-foreground">Group:</span>
			<span class="text-foreground/70">{passionGroupName}</span>
		</div>
	</div>

	<Card.Root size="sm">
		<Card.Header>
			<Card.Title
				class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
			>
				Allocated Specs
			</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			<div class="flex justify-between">
				<span>• CPU:</span><span class="font-bold text-foreground"
					>{cpu} Cores</span
				>
			</div>
			<div class="flex justify-between">
				<span>• RAM:</span><span class="font-bold text-foreground"
					>{ram} GB</span
				>
			</div>
			<div class="flex justify-between">
				<span>• Disk:</span><span class="font-bold text-foreground"
					>{disk} GB</span
				>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root size="sm">
		<Card.Header>
			<Card.Title
				class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
			>
				Network & Ports
			</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			<div class="flex justify-between">
				<span>Access:</span>
				<span class="text-foreground/70"
					>{network_type === "local" ? "LOCAL" : "PUBLIC"}</span
				>
			</div>
			<div class="flex justify-between gap-2">
				<span>DNS:</span>
				<span class="text-foreground/70">{dns_name || "—"}</span>
			</div>
			<div class="flex justify-between gap-2">
				<span>Open Ports:</span>
				<span class="font-bold text-primary">
					{portsList.length ? portsList.join(", ") : "None"}
				</span>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root size="sm">
		<Card.Header>
			<Card.Title
				class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
			>
				Lease Duration
			</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-2">
			<div class="flex justify-between">
				<span>Start Date:</span><span class="text-foreground/70"
					>{fmtDate(start_date)}</span
				>
			</div>
			<div class="flex justify-between">
				<span>End Date:</span><span class="font-bold text-primary"
					>{fmtDate(end_date)}</span
				>
			</div>
			<div class="flex justify-between">
				<span>Duration:</span><span class="text-foreground/70"
					>{leaseDays ?? "—"} days</span
				>
			</div>
		</Card.Content>
	</Card.Root>

	<div class="flex items-center justify-center gap-4">
		<input type="hidden" name="quantity" value="1" />
		{#if isEdit}
			<Button
				href="/status"
				variant="outline"
				class="font-mono text-xs font-bold tracking-wider uppercase"
			>
				cancel
			</Button>
		{/if}
		<Button
			type="submit"
			class="w-full font-mono text-xs font-bold tracking-wider uppercase sm:w-auto"
		>
			{isEdit ? "save" : "send"}
		</Button>
	</div>
</aside>
