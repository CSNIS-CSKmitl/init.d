<script lang="ts">
	import type { ActionData, PageData } from "./$types";
	import { untrack } from "svelte";
	import PresetCombobox from "$lib/components/request/PresetCombobox.svelte";
	import RequestSidebarPreview from "$lib/components/request/RequestSidebarPreview.svelte";
	import * as Field from "$lib/components/ui/field";
	import * as Select from "$lib/components/ui/select";
	import * as ToggleGroup from "$lib/components/ui/toggle-group";
	import { Input } from "$lib/components/ui/input";
	import { Textarea } from "$lib/components/ui/textarea";
	import { Separator } from "$lib/components/ui/separator";
	import { Lock, Globe } from "@lucide/svelte";

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Suffix shown next to the DNS prefix input. The full DNS is built
	// client-side and sent via a hidden input so the form payload still
	// matches the server's `dns_name` schema field.
	const DNS_SUFFIX = ".cskmitl.com";

	// Today / +30 days, in YYYY-MM-DD (the wire format <input type="date">
	// expects). Computed once so the form has sensible defaults instead
	// of starting empty.
	const today = new Date().toISOString().slice(0, 10);
	const inThirtyDays = new Date(Date.now() + 30 * 86_400_000)
		.toISOString()
		.slice(0, 10);

	// Live form state. Mirrors the rendered inputs so the preview pane
	// can re-derive on every keystroke. Initial values are seeded from the
	// server-side defaults. We use `untrack` because the form fields are
	// intentionally a one-time copy of `data.defaults`; the user's typing
	// should not be invalidated by reactive prop churn.
	let passion_group = $state<string>(
		untrack(() => (data.editRecord?.passion_group as string) ?? ""),
	);
	let type = $state<"vm" | "container">(
		untrack(() => data.editRecord?.type ?? data.defaults.type),
	);
	let hostname = $state(untrack(() => data.editRecord?.hostname ?? ""));
	let os_template = $state(
		untrack(() => data.editRecord?.os_template ?? "ubuntu-24.04"),
	);
	let cpu = $state(
		untrack(() => data.editRecord?.specs?.cpu ?? data.defaults.cpu),
	);
	let ram = $state(
		untrack(() => data.editRecord?.specs?.ram ?? data.defaults.ram),
	);
	let disk = $state(
		untrack(() => data.editRecord?.specs?.disk ?? data.defaults.disk),
	);
	let network_type = $state<"local" | "public">(
		untrack(
			() => data.editRecord?.network_type ?? data.defaults.network_type,
		),
	);
	let dnsPrefix = $state(
		untrack(() => {
			if (data.editRecord?.dns_name) {
				if (data.editRecord.dns_name.endsWith(DNS_SUFFIX)) {
					return data.editRecord.dns_name.slice(
						0,
						-DNS_SUFFIX.length,
					);
				}
				return data.editRecord.dns_name;
			}
			return "";
		}),
	);
	let ports = $state(untrack(() => data.editRecord?.ports ?? ""));
	let purpose_notes = $state(
		untrack(() => data.editRecord?.purpose_notes ?? ""),
	);
	let start_date = $state(
		untrack(() => {
			if (data.editRecord?.start_date) {
				return new Date(data.editRecord.start_date)
					.toISOString()
					.slice(0, 10);
			}
			return today;
		}),
	);
	let end_date = $state(
		untrack(() => {
			if (data.editRecord?.end_date) {
				return new Date(data.editRecord.end_date)
					.toISOString()
					.slice(0, 10);
			}
			return inThirtyDays;
		}),
	);
	let quantity = $state(
		untrack(() => data.editRecord?.quantity ?? data.defaults.quantity),
	);

	let selectedPreset = $state("");

	// Apply a preset's defaults to the form. Slug is the key — `''` means
	// the user picked the blank option and we deliberately leave the
	// current values alone (no destructive clear).
	function applyPreset(slug: string) {
		selectedPreset = slug;
		if (!slug) return;

		const preset = data.presets.find((p) => p.slug === slug);
		if (!preset) return;

		// Fill the fields the preset defines. The user can still tweak
		// CPU/RAM/Disk/Network before submitting — the preset is just a
		// sensible starting point.
		hostname = preset.slug;
		type = preset.type;
		os_template = preset.os_template;
		cpu = preset.default_cpu;
		ram = preset.default_ram;
		disk = preset.default_disk;
		network_type = preset.default_network;
		if (preset.default_ports) ports = preset.default_ports;
		// Only pre-fill notes if the user hasn't already typed something.
		if (preset.description && !purpose_notes)
			purpose_notes = preset.description;
	}

	function handlePresetSelect(slug: string) {
		applyPreset(slug);
	}

	function handlePresetClear() {
		selectedPreset = "";
	}

	// Compose the full DNS for the hidden form field. If the user clears
	// the prefix, we send an empty string — the server treats empty DNS
	// as "no DNS requested".
	const dns_name = $derived(
		dnsPrefix.trim() ? `${dnsPrefix.trim()}${DNS_SUFFIX}` : "",
	);

	// If the server returned previous values (validation error), restore them.
	$effect(() => {
		const v = form?.values;
		if (!v) return;
		if (v.passion_group) passion_group = v.passion_group;
		if (v.type) type = v.type;
		if (v.hostname) hostname = v.hostname;
		if (v.os_template) os_template = v.os_template;
		if (v.specs?.cpu) cpu = v.specs.cpu;
		if (v.specs?.ram) ram = v.specs.ram;
		if (v.specs?.disk) disk = v.specs.disk;
		if (v.network_type) network_type = v.network_type;
		if (v.dns_name) {
			// Strip the suffix to restore just the editable prefix.
			if (v.dns_name.endsWith(DNS_SUFFIX)) {
				dnsPrefix = v.dns_name.slice(0, -DNS_SUFFIX.length);
			} else {
				dnsPrefix = v.dns_name;
			}
		}
		if (v.ports) ports = v.ports;
		if (v.purpose_notes) purpose_notes = v.purpose_notes;
		if (v.start_date) start_date = v.start_date;
		if (v.end_date) end_date = v.end_date;
		if (v.quantity) quantity = v.quantity;
	});

	// Derived values for the preview pane.
	const portsList = $derived(
		ports
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean),
	);
	const errors = $derived<Record<string, string>>(form?.errors ?? {});

	const leaseDays = $derived.by(() => {
		if (!start_date || !end_date) return null;
		const ms =
			new Date(end_date).getTime() - new Date(start_date).getTime();
		return Math.max(0, Math.ceil(ms / 86_400_000));
	});

	const passionGroupName = $derived(
		data.passionGroups.find((g) => g.id === passion_group)?.name ?? "—",
	);

	// Text shown in the Passion Group select trigger — mirrors the old
	// native <select>'s placeholder/selected-option display.
	const passionGroupLabel = $derived(
		data.passionGroups.find((g) => g.id === passion_group)?.name ??
			"— pick a group —",
	);
</script>

<form
	method="POST"
	class="mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-16 xl:max-w-7xl 2xl:max-w-[1600px] 2xl:gap-20"
>
	<!-- LEFT: form fields (~70%) -------------------------------------------- -->
	<div class="flex flex-col gap-10 lg:col-span-2">
		<!-- Header -->
		{#if data.editRecord}
			<input type="hidden" name="id" value={data.editRecord.id} />
		{/if}
		<div class="flex flex-col gap-2">
			<h1 class="font-mono text-xl font-medium tracking-tight text-foreground">
				{data.editRecord
					? "// EDIT_INSTANCE_REQUEST"
					: "// PROVISION_NEW_INSTANCE"}
			</h1>
			<p class="text-sm text-foreground/70">
				ระบุข้อมูลสเปคระบบ ช่วงเวลา และวัตถุประสงค์เพื่อบันทึกคำขอลง
				PocketBase
			</p>
		</div>

		<!-- Quick Preset (optional) -->
		<PresetCombobox
			presets={data.presets}
			bind:selectedPreset
			onSelect={handlePresetSelect}
			onClear={handlePresetClear}
		/>

		<Field.FieldGroup class="gap-10">
			<!-- Section 1: Ownership & Environment Type -->
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<Field.Field>
					<Field.FieldLabel
						for="creator-email"
						class="font-mono text-xs uppercase tracking-wider text-foreground/70"
					>
						Creator
					</Field.FieldLabel>
					<Input
						id="creator-email"
						type="email"
						value={data.email}
						disabled
						class="font-mono"
					/>
				</Field.Field>
				<Field.Field data-invalid={!!errors.passion_group}>
					<Field.FieldLabel
						for="passion_group"
						class="font-mono text-xs uppercase tracking-wider text-foreground/70"
					>
						Passion Group
					</Field.FieldLabel>
					<Select.Root
						type="single"
						bind:value={passion_group}
						name="passion_group"
						required
					>
						<Select.Trigger
							id="passion_group"
							class="w-full font-mono"
							aria-invalid={!!errors.passion_group}
						>
							{passionGroupLabel}
						</Select.Trigger>
						<Select.Content>
							<Select.Group>
								{#each data.passionGroups as group (group.id)}
									<Select.Item
										value={group.id}
										label={group.name}
									>
										{group.name}
									</Select.Item>
								{/each}
							</Select.Group>
						</Select.Content>
					</Select.Root>
					{#if errors.passion_group}
						<Field.FieldError>{errors.passion_group}</Field.FieldError>
					{/if}
				</Field.Field>
			</div>

			<!-- Environment Type toggle (VM / Container) -->
			<Field.FieldSet>
				<Field.FieldLegend
					variant="label"
					class="font-mono text-xs uppercase tracking-wider text-foreground/70"
				>
					Environment Type
				</Field.FieldLegend>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					value={type}
					onValueChange={(v) => {
						if (v) type = v as "vm" | "container";
					}}
					class="max-w-xs"
				>
					<ToggleGroup.Item value="vm" class="flex-1 font-mono text-xs">
						Virtual Machine
					</ToggleGroup.Item>
					<ToggleGroup.Item
						value="container"
						class="flex-1 font-mono text-xs"
					>
						Container
					</ToggleGroup.Item>
				</ToggleGroup.Root>
				<!-- Buttons don't submit values, so the toggle state rides on a hidden input. -->
				<input type="hidden" name="type" value={type} />
			</Field.FieldSet>

			<Separator />

			<!-- Section 2: Hardware Resources -->
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<Field.Field data-invalid={!!errors.hostname}>
					<Field.FieldLabel
						for="hostname"
						class="font-mono text-xs uppercase tracking-wider text-foreground/70"
					>
						Hostname
					</Field.FieldLabel>
					<Input
						id="hostname"
						type="text"
						name="hostname"
						bind:value={hostname}
						class="font-mono"
						placeholder="web-01"
						pattern="[a-z0-9-]+"
						aria-invalid={!!errors.hostname}
						required
					/>
					{#if errors.hostname}
						<Field.FieldError>{errors.hostname}</Field.FieldError>
					{/if}
				</Field.Field>
				<Field.Field data-invalid={!!errors.os_template}>
					<Field.FieldLabel
						for="os_template"
						class="font-mono text-xs uppercase tracking-wider text-foreground/70"
					>
						OS Template
					</Field.FieldLabel>
					<Input
						id="os_template"
						type="text"
						name="os_template"
						bind:value={os_template}
						class="font-mono"
						placeholder="e.g. ubuntu-24.04"
						aria-invalid={!!errors.os_template}
						required
					/>
					{#if errors.os_template}
						<Field.FieldError>{errors.os_template}</Field.FieldError>
					{/if}
				</Field.Field>
			</div>

			<!-- Spec sliders -->
			<Field.FieldGroup class="gap-5">
				<Field.Field>
					<div class="flex items-center justify-between gap-2">
						<Field.FieldLabel
							class="font-mono text-xs text-muted-foreground"
						>
							CPU Cores
						</Field.FieldLabel>
						<div class="flex items-center gap-1.5">
							<Input
								type="number"
								min="1"
								max="32"
								bind:value={cpu}
								class="h-7 w-16 px-1.5 py-0.5 text-right font-mono text-xs font-bold text-primary"
							/>
							<span class="font-mono text-xs font-bold text-primary"
								>Cores</span
							>
						</div>
					</div>
					<input
						type="range"
						name="cpu"
						min="1"
						max="16"
						bind:value={cpu}
						style="accent-color: var(--primary)"
						class="h-1.5 w-full cursor-pointer rounded-lg bg-muted"
						required
					/>
				</Field.Field>
				<Field.Field>
					<div class="flex items-center justify-between gap-2">
						<Field.FieldLabel
							class="font-mono text-xs text-muted-foreground"
						>
							Memory (RAM)
						</Field.FieldLabel>
						<div class="flex items-center gap-1.5">
							<Input
								type="number"
								min="1"
								max="16"
								bind:value={ram}
								class="h-7 w-16 px-1.5 py-0.5 text-right font-mono text-xs font-bold text-primary"
							/>
							<span class="font-mono text-xs font-bold text-primary"
								>GB</span
							>
						</div>
					</div>
					<input
						type="range"
						name="ram"
						min="1"
						max="24"
						bind:value={ram}
						style="accent-color: var(--primary)"
						class="h-1.5 w-full cursor-pointer rounded-lg bg-muted"
						required
					/>
				</Field.Field>
				<Field.Field>
					<div class="flex items-center justify-between gap-2">
						<Field.FieldLabel
							class="font-mono text-xs text-muted-foreground"
						>
							Storage (Disk)
						</Field.FieldLabel>
						<div class="flex items-center gap-1.5">
							<Input
								type="number"
								min="1"
								max="16384"
								bind:value={disk}
								class="h-7 w-20 px-1.5 py-0.5 text-right font-mono text-xs font-bold text-primary"
							/>
							<span class="font-mono text-xs font-bold text-primary"
								>GB</span
							>
						</div>
					</div>
					<input
						type="range"
						name="disk"
						min="1"
						max="1000"
						bind:value={disk}
						style="accent-color: var(--primary)"
						class="h-1.5 w-full cursor-pointer rounded-lg bg-muted"
						required
					/>
				</Field.Field>
			</Field.FieldGroup>

			<Separator />

			<!-- Section 3: Networking & Custom Ports -->
			<!-- Network Access toggle -->
			<Field.FieldSet>
				<Field.FieldLegend
					variant="label"
					class="font-mono text-xs uppercase tracking-wider text-foreground/70"
				>
					Network Access
				</Field.FieldLegend>
				<ToggleGroup.Root
					type="single"
					variant="outline"
					value={network_type}
					onValueChange={(v) => {
						if (v) network_type = v as "local" | "public";
					}}
					class="max-w-xs"
				>
					<ToggleGroup.Item
						value="local"
						class="flex-1 font-mono text-xs"
					>
						<Lock data-icon="inline-start" />
						Local IP
					</ToggleGroup.Item>
					<ToggleGroup.Item
						value="public"
						class="flex-1 font-mono text-xs"
					>
						<Globe data-icon="inline-start" />
						Public IP
					</ToggleGroup.Item>
				</ToggleGroup.Root>
				<input type="hidden" name="network_type" value={network_type} />
			</Field.FieldSet>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<Field.Field>
					<Field.FieldLabel
						for="dns_prefix"
						class="font-mono text-xs uppercase tracking-wider text-foreground/70"
					>
						DNS Request
					</Field.FieldLabel>
					<div class="relative">
						<Input
							id="dns_prefix"
							type="text"
							bind:value={dnsPrefix}
							class="pr-24 font-mono"
							placeholder="api-gateway-prod"
						/>
						<span
							class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs whitespace-nowrap text-muted-foreground"
						>
							{DNS_SUFFIX}
						</span>
					</div>
					<!-- Composed DNS rides on a hidden field -->
					<input type="hidden" name="dns_name" value={dns_name} />
				</Field.Field>
				<Field.Field data-invalid={!!errors.ports}>
					<Field.FieldLabel
						for="ports"
						class="font-mono text-xs uppercase tracking-wider text-foreground/70"
					>
						Custom Open Ports
					</Field.FieldLabel>
					<Input
						id="ports"
						type="text"
						name="ports"
						bind:value={ports}
						class="font-mono"
						placeholder="e.g. 8080, 3000"
						aria-invalid={!!errors.ports}
					/>
					{#if errors.ports}
						<Field.FieldError>{errors.ports}</Field.FieldError>
					{/if}
				</Field.Field>
			</div>

			<Separator />

			<!-- Section 4: Timeline Retention -->
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
				<Field.Field data-invalid={!!errors.start_date}>
					<Field.FieldLabel
						for="start_date"
						class="font-mono text-xs uppercase tracking-wider text-foreground/70"
					>
						Start Date <span class="text-muted-foreground"
							>(วันเริ่มใช้)</span
						>
					</Field.FieldLabel>
					<Input
						id="start_date"
						type="date"
						name="start_date"
						bind:value={start_date}
						class="font-mono"
						aria-invalid={!!errors.start_date}
						required
					/>
					{#if errors.start_date}
						<Field.FieldError>{errors.start_date}</Field.FieldError>
					{/if}
				</Field.Field>
				<Field.Field data-invalid={!!errors.end_date}>
					<Field.FieldLabel
						for="end_date"
						class="font-mono text-xs uppercase tracking-wider text-foreground/70"
					>
						End Date <span class="text-muted-foreground"
							>(วันสิ้นสุด)</span
						>
					</Field.FieldLabel>
					<Input
						id="end_date"
						type="date"
						name="end_date"
						bind:value={end_date}
						class="font-mono font-bold text-primary"
						aria-invalid={!!errors.end_date}
						required
					/>
					{#if errors.end_date}
						<Field.FieldError>{errors.end_date}</Field.FieldError>
					{/if}
				</Field.Field>
			</div>

			<Separator />

			<!-- Section 5: Purpose / Notes -->
			<Field.Field data-invalid={!!errors.purpose_notes}>
				<Field.FieldLabel
					for="purpose_notes"
					class="font-mono text-xs uppercase tracking-wider text-foreground/70"
				>
					Purpose / Notes <span class="text-muted-foreground"
						>(อธิบายวัตถุประสงค์เพิ่มเติม)</span
					>
				</Field.FieldLabel>
				<Textarea
					id="purpose_notes"
					name="purpose_notes"
					bind:value={purpose_notes}
					rows={3}
					class="font-mono text-foreground/70"
					placeholder="ระบุเหตุผลในการขอใช้เครื่อง เช่น ใช้เป็น API Gateway สเปคสำหรับโปรเจกต์ AuthWeb คอนฟิก VLAN 10..."
					aria-invalid={!!errors.purpose_notes}
					required
				></Textarea>
				{#if errors.purpose_notes}
					<Field.FieldError>{errors.purpose_notes}</Field.FieldError>
				{/if}
			</Field.Field>
		</Field.FieldGroup>
	</div>

	<!-- RIGHT: Live Summary Sidebar (~30%) -->
	<RequestSidebarPreview
		{hostname}
		{type}
		{os_template}
		{passionGroupName}
		{cpu}
		{ram}
		{disk}
		{network_type}
		{dns_name}
		{portsList}
		{start_date}
		{end_date}
		{leaseDays}
		isEdit={!!data.editRecord}
	/>
</form>
