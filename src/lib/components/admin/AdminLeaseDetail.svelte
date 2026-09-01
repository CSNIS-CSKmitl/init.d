<script lang="ts">
	import type { LeaseInstance } from "$lib/types";
	import { passionGroupName, creatorEmail, creatorName } from "$lib/types";
	import { enhance } from "$app/forms";
	import { cn } from "$lib/utils";
	import { leaseBadgeStatus, leaseNeedsResolve } from "$lib/leaseStatus";
	import * as Field from "$lib/components/ui/field";
	import * as Alert from "$lib/components/ui/alert";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Textarea } from "$lib/components/ui/textarea";
	import { Separator } from "$lib/components/ui/separator";
	import {
		MonitorPlay,
		SquareTerminal,
		MessageSquareText,
		Settings2,
		Cpu,
		Network,
		MemoryStick,
		HardDrive,
		Calendar,
		RotateCcw,
		Globe,
		Lock,
		Rocket,
	} from "@lucide/svelte";

	// This component is instantiated once per open row (the parent renders
	// one of these per id in its `openIds` set), so every field below is a
	// separate reactive slot per lease — opening several requests at once no
	// longer means they fight over one shared set of form variables.
	let {
		item,
		form,
		provisioning = false,
		progressMap = {},
		onOpenConsole,
		onOpenSsh,
	}: {
		item: LeaseInstance;
		form: { error?: string; id?: string; recordId?: string } | null;
		provisioning?: boolean;
		progressMap?: Record<string, { status: string; error?: string }>;
		onOpenConsole: (item: LeaseInstance) => void;
		onOpenSsh: (item: LeaseInstance) => void;
	} = $props();

	const badgeStatus = $derived(leaseBadgeStatus(item, progressMap[item.id]));
	const isFailed = $derived(badgeStatus === "failed");
	const needsResolve = $derived(leaseNeedsResolve(item, progressMap[item.id]));

	let replyDraft = $state(item.admin_reply ?? "");
	// A failed attempt never actually created the VM/CT, so "Manual — already
	// exists on Proxmox" would be the wrong default; start on Auto so the
	// visible primary action is the correct one (retry).
	let resolveMode = $state<"manual" | "auto">(isFailed ? "auto" : "manual");
	let resolveVmid = $state(item.vmid != null ? String(item.vmid) : "");
	let resolveNode = $state(item.node != null ? String(item.node) : "");
	let resolveStorage = $state("local-lvm");
	let editCpu = $state(String(item.specs.cpu));
	let editRam = $state(String(item.specs.ram));
	let editDisk = $state(String(item.specs.disk));
	let editPorts = $state(item.ports ?? "");
	let editVmid = $state(item.vmid != null ? String(item.vmid) : "");
	let editNode = $state(item.node != null ? String(item.node) : "");
	let provisionNode = $state("pve3");
	let provisionNetwork = $state("vmbr1");
	let provisionId = $state("");

	// Keep the vmid/node shown in Resolve→Auto and Edit Fields in sync with
	// this lease's actual record — e.g. after Resolve→Auto provisions and
	// writes back a vmid/node, both fields should reflect it immediately
	// instead of showing what was there when this panel was first opened.
	$effect(() => {
		resolveVmid = item.vmid != null ? String(item.vmid) : "";
		resolveNode = item.node != null ? String(item.node) : "";
		editVmid = item.vmid != null ? String(item.vmid) : "";
		editNode = item.node != null ? String(item.node) : "";
	});

	const portsFor = (s: string | undefined) =>
		(s ?? "")
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean);

	// Thai short month names with the Christian year (e.g. "23 มิ.ย. 2026")
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
	const fmt = (iso: string) => {
		const d = new Date(iso);
		return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
	};
</script>

<div class="flex flex-col gap-6 px-6 py-5">
	<!-- Overview -->
	<section class="flex flex-col gap-3">
		<div class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
			<div>
				<div class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Group</div>
				<div class="font-bold text-foreground">{passionGroupName(item)}</div>
			</div>
			<div>
				<div class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Requester</div>
				<div class="font-bold text-foreground">{creatorName(item)}</div>
				<div class="font-mono text-[11px] text-muted-foreground">{creatorEmail(item)}</div>
			</div>
			<div>
				<div class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Type</div>
				<div class="font-bold text-foreground">{item.type === "vm" ? "Virtual Machine" : "Container"} · x{item.quantity}</div>
			</div>
			<div>
				<div class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">OS Template</div>
				<div class="font-mono text-xs text-foreground">{item.os_template}</div>
			</div>
			<div>
				<div class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Lease Window</div>
				<div class="flex items-center gap-1 font-mono text-xs text-foreground">
					<Calendar class="h-3 w-3 text-muted-foreground" />
					{fmt(item.start_date)} → {fmt(item.end_date)}
				</div>
			</div>
			<div>
				<div class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Network</div>
				<div class="flex items-center gap-1 font-mono text-xs text-foreground">
					{#if item.network_type === "local"}<Lock class="h-3 w-3" />{:else}<Globe class="h-3 w-3" />{/if}
					{item.network_type === "local" ? "Local" : "Public"}
				</div>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
			<span class="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 font-bold text-muted-foreground">
				<Cpu class="h-3 w-3" /> {item.specs.cpu}C
			</span>
			<span class="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 font-bold text-muted-foreground">
				<MemoryStick class="h-3 w-3" /> {item.specs.ram}GB
			</span>
			<span class="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 font-bold text-muted-foreground">
				<HardDrive class="h-3 w-3" /> {item.specs.disk}GB
			</span>
		</div>

		{#if item.dns_name}
			<div>
				<div class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">DNS</div>
				<div class="font-mono text-xs font-bold text-foreground underline">{item.dns_name}</div>
			</div>
		{/if}
		<div>
			<div class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Custom Ports</div>
			<div class="mt-1 flex flex-wrap gap-1">
				{#if portsFor(item.ports).length > 0}
					{#each portsFor(item.ports) as port}
						<span class="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold text-foreground">{port}</span>
					{/each}
				{:else}
					<span class="font-mono text-[11px] text-muted-foreground italic">None (default only)</span>
				{/if}
			</div>
		</div>

		{#if progressMap[item.id]}
			<Alert.Root class={cn("gap-0 p-3", isFailed ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-info/20 bg-info/5 text-info")}>
				<div class="flex items-center gap-2">
					<span class="relative flex h-2 w-2">
						{#if !isFailed && progressMap[item.id].status !== "Complete"}
							<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75"></span>
						{/if}
						<span class={cn("relative inline-flex h-2 w-2 rounded-full", isFailed ? "bg-destructive" : "bg-info")}></span>
					</span>
					<Alert.Title class="text-[10px] font-bold tracking-wider uppercase">Provisioning Status:</Alert.Title>
				</div>
				<Alert.Description class="mt-1 font-medium text-foreground">{progressMap[item.id].status}</Alert.Description>
				{#if progressMap[item.id].error}
					<div class="mt-1.5 text-xs leading-normal font-bold text-destructive">Error: {progressMap[item.id].error}</div>
				{/if}
			</Alert.Root>
		{:else if item.status === "completed" && item.vmid}
			<Alert.Root class="gap-0 border-border bg-muted p-2.5 text-muted-foreground">
				<div class="flex items-center gap-2">
					<span class="inline-flex h-2 w-2 rounded-full bg-success/60"></span>
					<Alert.Title class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Provisioning Status:</Alert.Title>
				</div>
				<Alert.Description class="mt-1 font-medium text-foreground">
					Complete (Node: pve{item.node || ""}, VMID: {item.vmid})
				</Alert.Description>
			</Alert.Root>
		{/if}

		{#if form?.error && (form?.recordId === item.id || form?.id === item.id)}
			<Alert.Root variant="destructive" class="gap-1 p-3">
				<Alert.Description class="text-xs">{form.error}</Alert.Description>
			</Alert.Root>
		{/if}
	</section>

	<Separator />

	<!-- Message to requester — always editable, no view/edit toggle to click through. -->
	<section class="flex flex-col gap-2">
		<div class="flex items-center justify-between">
			<h3 class="flex items-center gap-1.5 font-mono text-xs font-bold text-foreground uppercase">
				<MessageSquareText class="h-3.5 w-3.5" /> Message to requester
			</h3>
			{#if item.admin_reply_at}
				<span class="font-mono text-[10px] text-muted-foreground">sent {fmt(item.admin_reply_at)}</span>
			{/if}
		</div>
		<form method="POST" action="?/reply" use:enhance class="flex flex-col gap-2">
			<input type="hidden" name="id" value={item.id} />
			<Textarea
				name="reply"
				bind:value={replyDraft}
				rows={3}
				maxlength={4096}
				placeholder="พิมพ์ข้อความถึงผู้ขอ เช่น กำลังเตรียม VM อยู่ คาดว่าพร้อมใช้ภายใน 1 ชม."
				class="font-mono text-xs"
			/>
			<div class="flex justify-end gap-1.5">
				<Button type="submit" size="sm" disabled={replyDraft.trim().length === 0} class="font-mono">
					{item.admin_reply ? "Update" : "Send"}
				</Button>
			</div>
		</form>
		{#if item.admin_reply}
			<form method="POST" action="?/reply" use:enhance class="flex justify-end">
				<input type="hidden" name="id" value={item.id} />
				<input type="hidden" name="clear" value="1" />
				<Button type="submit" variant="outline" size="xs" class="border-destructive/20 font-mono text-destructive hover:bg-destructive/10">
					Clear reply
				</Button>
			</form>
		{/if}
	</section>

	<Separator />

	<!-- Resolve / Retry -->
	{#if needsResolve}
		<section class="flex flex-col gap-2">
			<h3 class={cn("flex items-center gap-1.5 font-mono text-xs font-bold uppercase", isFailed ? "text-destructive" : "text-foreground")}>
				<Settings2 class="h-3.5 w-3.5" /> {isFailed ? "Retry provisioning" : "Resolve"}
			</h3>
			{#if isFailed && progressMap[item.id]?.error}
				<p class="text-xs leading-relaxed text-destructive">{progressMap[item.id].error}</p>
			{/if}

			<form
				method="POST"
				action="?/resolve"
				use:enhance
				class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4"
			>
				<input type="hidden" name="id" value={item.id} />
				<input type="hidden" name="mode" value={resolveMode} />

				<ToggleGroup.Root
					type="single"
					value={resolveMode}
					onValueChange={(v) => { if (v) resolveMode = v as "manual" | "auto"; }}
					size="sm"
					variant="outline"
					class="w-fit"
				>
					<ToggleGroup.Item value="manual" class="font-mono text-[10px] tracking-wider uppercase">Manual</ToggleGroup.Item>
					<ToggleGroup.Item value="auto" class="font-mono text-[10px] tracking-wider uppercase">Auto</ToggleGroup.Item>
				</ToggleGroup.Root>
				<p class="font-mono text-[10px] text-muted-foreground">
					{resolveMode === "manual"
						? "Manual — mark this lease complete; the VM/CT already exists on Proxmox."
						: "Auto — provision a new VM/CT on Proxmox right now using the values below."}
				</p>

				{#if resolveMode === "auto"}
					<Field.FieldGroup class="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<Field.Field>
							<Field.FieldLabel for={`resolve-vmid-${item.id}`} class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">vmid</Field.FieldLabel>
							<Input id={`resolve-vmid-${item.id}`} name="vmid" type="number" min="1" bind:value={resolveVmid} required class="font-mono text-xs" placeholder="101" />
						</Field.Field>
						<Field.Field>
							<Field.FieldLabel for={`resolve-node-${item.id}`} class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">node</Field.FieldLabel>
							<Input id={`resolve-node-${item.id}`} name="node" type="number" min="1" bind:value={resolveNode} required class="font-mono text-xs" placeholder="3" />
						</Field.Field>
						<Field.Field>
							<Field.FieldLabel for={`resolve-storage-${item.id}`} class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">storage</Field.FieldLabel>
							<Input id={`resolve-storage-${item.id}`} name="storage" bind:value={resolveStorage} required class="font-mono text-xs" placeholder="local-lvm" />
						</Field.Field>
					</Field.FieldGroup>
					<p class="font-mono text-[10px] text-muted-foreground">
						vmid/node are prefilled from this lease's current values (set via Edit Fields below) when available — change them here only if provisioning to a different target.
					</p>
				{/if}

				<div class="flex justify-end">
					<Button type="submit" size="sm" variant={isFailed ? "destructive" : "default"} class="w-fit font-mono">
						{#if isFailed}<RotateCcw data-icon="inline-start" />{/if}
						{resolveMode === "manual" ? "Complete" : isFailed ? "Retry Provision" : "Provision"}
					</Button>
				</div>
			</form>
		</section>

		<Separator />
	{/if}

	<!-- Provision (legacy manual-create path) -->
	{#if provisioning}
		<section class="flex flex-col gap-2">
			<h3 class="flex items-center gap-1.5 font-mono text-xs font-bold text-foreground uppercase">
				<Rocket class="h-3.5 w-3.5" /> Provision
			</h3>
			<form
				method="POST"
				action="?/create"
				use:enhance
				class="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4"
			>
				<input type="hidden" name="recordId" value={item.id} />
				<Field.FieldGroup class="grid grid-cols-1 gap-3 sm:grid-cols-3">
					<Field.Field>
						<Field.FieldLabel for={`provision-node-${item.id}`} class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">node</Field.FieldLabel>
						<Input id={`provision-node-${item.id}`} name="node" bind:value={provisionNode} required class="font-mono text-xs" placeholder="pve3" />
					</Field.Field>
					<Field.Field>
						<Field.FieldLabel for={`provision-network-${item.id}`} class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">network</Field.FieldLabel>
						<Input id={`provision-network-${item.id}`} name="network" bind:value={provisionNetwork} required class="font-mono text-xs" placeholder="vmbr1" />
					</Field.Field>
					<Field.Field>
						<Field.FieldLabel for={`provision-id-${item.id}`} class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">id</Field.FieldLabel>
						<Input id={`provision-id-${item.id}`} name="id" type="number" min="1" bind:value={provisionId} required class="font-mono text-xs" placeholder="101" />
					</Field.Field>
				</Field.FieldGroup>
				<div class="flex justify-end">
					<Button type="submit" size="sm" class="w-fit font-mono">Create</Button>
				</div>
			</form>
		</section>

		<Separator />
	{/if}

	<!-- Edit fields -->
	<section class="flex flex-col gap-2">
		<h3 class="flex items-center gap-1.5 font-mono text-xs font-bold text-foreground uppercase">
			<Settings2 class="h-3.5 w-3.5" /> Edit lease fields
		</h3>
		<form method="POST" action="?/update" use:enhance class="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4">
			<input type="hidden" name="id" value={item.id} />
			<Field.FieldGroup class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<Field.Field>
					<Field.FieldLabel for={`edit-cpu-${item.id}`} class="font-mono text-[10px] tracking-wider text-foreground/70 uppercase">CPU Cores</Field.FieldLabel>
					<Input id={`edit-cpu-${item.id}`} name="cpu" type="number" step="1" bind:value={editCpu} required class="font-mono text-xs" />
				</Field.Field>
				<Field.Field>
					<Field.FieldLabel for={`edit-ram-${item.id}`} class="font-mono text-[10px] tracking-wider text-foreground/70 uppercase">RAM (GB)</Field.FieldLabel>
					<Input id={`edit-ram-${item.id}`} name="ram" type="number" step="1" bind:value={editRam} required class="font-mono text-xs" />
				</Field.Field>
				<Field.Field>
					<Field.FieldLabel for={`edit-disk-${item.id}`} class="font-mono text-[10px] tracking-wider text-foreground/70 uppercase">Disk (GB)</Field.FieldLabel>
					<Input id={`edit-disk-${item.id}`} name="disk" type="number" step="1" bind:value={editDisk} required class="font-mono text-xs" />
				</Field.Field>
				<Field.Field class="sm:col-span-3">
					<Field.FieldLabel for={`edit-ports-${item.id}`} class="font-mono text-[10px] tracking-wider text-foreground/70 uppercase">Custom Firewall Ports</Field.FieldLabel>
					<Input id={`edit-ports-${item.id}`} name="ports" bind:value={editPorts} class="font-mono text-xs" placeholder="e.g. 80, 443, 3000, 8080 (comma separated)" />
				</Field.Field>
				<Field.Field>
					<Field.FieldLabel for={`edit-vmid-${item.id}`} class="font-mono text-[10px] tracking-wider text-foreground/70 uppercase">Proxmox VMID</Field.FieldLabel>
					<Input id={`edit-vmid-${item.id}`} name="vmid" type="number" bind:value={editVmid} class="font-mono text-xs" placeholder="e.g. 101" />
				</Field.Field>
				<Field.Field>
					<Field.FieldLabel for={`edit-node-${item.id}`} class="font-mono text-[10px] tracking-wider text-foreground/70 uppercase">Proxmox Node</Field.FieldLabel>
					<Input id={`edit-node-${item.id}`} name="node" type="number" bind:value={editNode} class="font-mono text-xs" placeholder="e.g. 3" />
				</Field.Field>
			</Field.FieldGroup>
			<p class="font-mono text-[10px] text-muted-foreground">
				VMID/Node saved here become the defaults Resolve → Auto prefills for this lease.
			</p>
			<div class="flex justify-end">
				<Button type="submit" size="sm" class="w-fit font-mono">Save Fields</Button>
			</div>
		</form>
	</section>

	{#if !needsResolve && item.vmid}
		<Separator />
		<section class="flex flex-col gap-2">
			<h3 class="font-mono text-xs font-bold text-foreground uppercase">Remote access</h3>
			<div class="flex flex-col gap-2 sm:flex-row">
				<Button type="button" onclick={() => onOpenConsole(item)} class="flex-1 justify-start font-mono">
					<MonitorPlay data-icon="inline-start" />
					<span class="flex flex-col items-start">
						<span>Console</span>
						<span class="text-[10px] font-normal opacity-80">Browser noVNC — no credentials needed</span>
					</span>
				</Button>
				<Button type="button" variant="outline" onclick={() => onOpenSsh(item)} class="flex-1 justify-start font-mono">
					<SquareTerminal data-icon="inline-start" />
					<span class="flex flex-col items-start">
						<span>SSH</span>
						<span class="text-[10px] font-normal opacity-70">WebTTY — requires host credentials</span>
					</span>
				</Button>
			</div>
		</section>
	{/if}
</div>
