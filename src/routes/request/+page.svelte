<script lang="ts">
	import type { ActionData, PageData } from "./$types";
	import { untrack } from "svelte";
	import PresetCombobox from "$lib/components/request/PresetCombobox.svelte";
	import RequestSidebarPreview from "$lib/components/request/RequestSidebarPreview.svelte";

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
	let passion_group = $state(
		untrack(() => data.editRecord?.passion_group ?? ""),
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
</script>

<form
	method="POST"
	class="mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-16 xl:max-w-7xl 2xl:max-w-[1600px] 2xl:gap-20"
>
	<!-- LEFT: form fields (~70%) -------------------------------------------- -->
	<div class="space-y-10 lg:col-span-2">
		<!-- Header -->
		{#if data.editRecord}
			<input type="hidden" name="id" value={data.editRecord.id} />
		{/if}
		<div class="space-y-2">
			<h1
				class="font-mono-app text-xl font-medium tracking-tight text-app"
			>
				{data.editRecord
					? "// EDIT_INSTANCE_REQUEST"
					: "// PROVISION_NEW_INSTANCE"}
			</h1>
			<p class="text-sm text-secondary-app">
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

		<!-- Section 1: Ownership & Environment Type -->
		<div class="space-y-6">
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div class="space-y-2">
					<label
						for="creator-email"
						class="block text-xs font-medium uppercase tracking-wider text-secondary-app font-mono-app"
					>
						Creator
					</label>
					<input
						id="creator-email"
						type="email"
						value={data.email}
						disabled
						class="w-full cursor-not-allowed rounded-lg border border-app bg-elevated px-3 py-2 font-mono-app text-sm text-muted-app focus:outline-none"
					/>
				</div>
				<div class="space-y-2">
					<label
						for="passion_group"
						class="block text-xs font-medium uppercase tracking-wider text-secondary-app font-mono-app"
					>
						Passion Group
					</label>
					<select
						id="passion_group"
						name="passion_group"
						bind:value={passion_group}
						required
						class="w-full appearance-none rounded-lg border border-app bg-elevated px-3 py-2 font-mono-app text-sm text-app focus:border-strong-app focus:outline-none"
					>
						<option value="" disabled>— pick a group —</option>
						{#each data.passionGroups as group (group.id)}
							<option value={group.id}>{group.name}</option>
						{/each}
					</select>
					{#if errors.passion_group}
						<p class="mt-1 text-xs" style="color: var(--danger)">
							{errors.passion_group}
						</p>
					{/if}
				</div>
			</div>

			<!-- Environment Type toggle (VM / Container) -->
			<fieldset class="space-y-2">
				<legend
					class="block text-xs font-medium uppercase tracking-wider text-secondary-app font-mono-app"
				>
					Environment Type
				</legend>
				<div
					class="flex max-w-xs rounded-lg border border-app bg-surface p-1"
					role="radiogroup"
				>
					<button
						type="button"
						role="radio"
						aria-checked={type === "vm"}
						onclick={() => (type = "vm")}
						class="flex-1 rounded-md py-1.5 font-mono-app text-xs font-medium transition {type ===
						'vm'
							? 'border border-strong-app bg-elevated text-accent shadow-sm'
							: 'text-muted-app hover:text-app'}"
					>
						Virtual Machine
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={type === "container"}
						onclick={() => (type = "container")}
						class="flex-1 rounded-md py-1.5 font-mono-app text-xs font-medium transition {type ===
						'container'
							? 'border border-strong-app bg-elevated text-accent shadow-sm'
							: 'text-muted-app hover:text-app'}"
					>
						Container
					</button>
				</div>
				<!-- Buttons don't submit values, so the toggle state rides on a hidden input. -->
				<input type="hidden" name="type" value={type} />
			</fieldset>
		</div>

		<!-- Section 2: Hardware Resources -->
		<div class="space-y-6 border-t border-app pt-4">
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div class="space-y-2">
					<label
						for="hostname"
						class="block text-xs font-medium uppercase tracking-wider text-secondary-app font-mono-app"
					>
						Hostname
					</label>
					<input
						id="hostname"
						type="text"
						name="hostname"
						bind:value={hostname}
						class="w-full rounded-lg border border-app bg-elevated px-3 py-2 font-mono-app text-sm text-app focus:border-strong-app focus:outline-none"
						placeholder="web-01"
						pattern="[a-z0-9-]+"
						required
					/>
					{#if errors.hostname}
						<p class="mt-1 text-xs" style="color: var(--danger)">
							{errors.hostname}
						</p>
					{/if}
				</div>
				<div class="space-y-2">
					<label
						for="os_template"
						class="block text-xs font-medium uppercase tracking-wider text-secondary-app font-mono-app"
					>
						OS Template
					</label>
					<input
						id="os_template"
						type="text"
						name="os_template"
						bind:value={os_template}
						class="w-full rounded-lg border border-app bg-elevated px-3 py-2 font-mono-app text-sm text-app focus:border-strong-app focus:outline-none"
						placeholder="e.g. ubuntu-24.04"
						required
					/>
					{#if errors.os_template}
						<p class="mt-1 text-xs" style="color: var(--danger)">
							{errors.os_template}
						</p>
					{/if}
				</div>
			</div>

			<!-- Spec sliders -->
			<div class="space-y-5 pt-2">
				<div class="space-y-2">
					<div
						class="flex justify-between items-center font-mono-app text-xs"
					>
						<span class="text-muted-app">CPU Cores</span>
						<div class="flex items-center gap-1.5">
							<input
								type="number"
								min="1"
								max="32"
								bind:value={cpu}
								class="w-16 rounded border border-app bg-elevated px-1.5 py-0.5 text-right font-bold text-accent focus:border-strong-app focus:outline-none"
							/>
							<span class="font-bold text-accent">Cores</span>
						</div>
					</div>
					<input
						type="range"
						name="cpu"
						min="1"
						max="16"
						bind:value={cpu}
						style="accent-color: var(--accent)"
						class="h-1.5 w-full cursor-pointer rounded-lg bg-elevated"
						required
					/>
				</div>
				<div class="space-y-2">
					<div
						class="flex justify-between items-center font-mono-app text-xs"
					>
						<span class="text-muted-app">Memory (RAM)</span>
						<div class="flex items-center gap-1.5">
							<input
								type="number"
								min="1"
								max="16"
								bind:value={ram}
								class="w-16 rounded border border-app bg-elevated px-1.5 py-0.5 text-right font-bold text-accent focus:border-strong-app focus:outline-none"
							/>
							<span class="font-bold text-accent">GB</span>
						</div>
					</div>
					<input
						type="range"
						name="ram"
						min="1"
						max="24"
						bind:value={ram}
						style="accent-color: var(--accent)"
						class="h-1.5 w-full cursor-pointer rounded-lg bg-elevated"
						required
					/>
				</div>
				<div class="space-y-2">
					<div
						class="flex justify-between items-center font-mono-app text-xs"
					>
						<span class="text-muted-app">Storage (Disk)</span>
						<div class="flex items-center gap-1.5">
							<input
								type="number"
								min="1"
								max="16384"
								bind:value={disk}
								class="w-20 rounded border border-app bg-elevated px-1.5 py-0.5 text-right font-bold text-accent focus:border-strong-app focus:outline-none"
							/>
							<span class="font-bold text-accent">GB</span>
						</div>
					</div>
					<input
						type="range"
						name="disk"
						min="1"
						max="1000"
						bind:value={disk}
						style="accent-color: var(--accent)"
						class="h-1.5 w-full cursor-pointer rounded-lg bg-elevated"
						required
					/>
				</div>
			</div>
		</div>

		<!-- Section 3: Networking & Custom Ports -->
		<div class="space-y-6 border-t border-app pt-4">
			<!-- Network Access toggle -->
			<fieldset class="space-y-2">
				<legend
					class="block text-xs font-medium uppercase tracking-wider text-secondary-app font-mono-app"
				>
					Network Access
				</legend>
				<div
					class="flex max-w-xs rounded-lg border border-app bg-surface p-1"
					role="radiogroup"
				>
					<button
						type="button"
						role="radio"
						aria-checked={network_type === "local"}
						onclick={() => (network_type = "local")}
						class="flex-1 rounded-md py-1.5 font-mono-app text-xs font-medium transition {network_type ===
						'local'
							? 'border border-strong-app bg-elevated text-app shadow-sm'
							: 'text-muted-app hover:text-app'}"
					>
						🔒 Local IP
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={network_type === "public"}
						onclick={() => (network_type = "public")}
						class="flex-1 rounded-md py-1.5 font-mono-app text-xs font-medium transition {network_type ===
						'public'
							? 'border border-strong-app bg-elevated text-app shadow-sm'
							: 'text-muted-app hover:text-app'}"
					>
						🌐 Public IP
					</button>
				</div>
				<input type="hidden" name="network_type" value={network_type} />
			</fieldset>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div class="space-y-2">
					<label
						for="dns_prefix"
						class="block text-xs font-medium uppercase tracking-wider text-secondary-app font-mono-app"
					>
						DNS Request
					</label>
					<div
						class="flex items-center rounded-lg border border-app bg-elevated pr-3 transition-colors focus-within:border-strong-app"
					>
						<input
							id="dns_prefix"
							type="text"
							bind:value={dnsPrefix}
							class="w-full border-0 bg-transparent px-3 py-2 font-mono-app text-sm text-app focus:outline-none"
							placeholder="api-gateway-prod"
						/>
						<span
							class="whitespace-nowrap font-mono-app text-xs text-muted-app"
							>{DNS_SUFFIX}</span
						>
					</div>
					<!-- Composed DNS rides on a hidden field -->
					<input type="hidden" name="dns_name" value={dns_name} />
				</div>
				<div class="space-y-2">
					<label
						for="ports"
						class="block text-xs font-medium uppercase tracking-wider text-secondary-app font-mono-app"
					>
						Custom Open Ports
					</label>
					<input
						id="ports"
						type="text"
						name="ports"
						bind:value={ports}
						class="w-full rounded-lg border border-app bg-elevated px-3 py-2 font-mono-app text-sm text-app focus:border-strong-app focus:outline-none"
						placeholder="e.g. 8080, 3000"
					/>
					{#if errors.ports}
						<p class="mt-1 text-xs" style="color: var(--danger)">
							{errors.ports}
						</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Section 4: Timeline Retention -->
		<div class="space-y-6 border-t border-app pt-4">
			<div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
				<div class="space-y-2">
					<label
						for="start_date"
						class="block text-xs font-medium uppercase tracking-wider text-secondary-app font-mono-app"
					>
						Start Date <span class="text-muted-app"
							>(วันเริ่มใช้)</span
						>
					</label>
					<input
						id="start_date"
						type="date"
						name="start_date"
						bind:value={start_date}
						style="color-scheme: dark"
						class="w-full rounded-lg border border-app bg-elevated px-3 py-2 font-mono-app text-sm text-app focus:border-strong-app focus:outline-none"
						required
					/>
					{#if errors.start_date}
						<p class="mt-1 text-xs" style="color: var(--danger)">
							{errors.start_date}
						</p>
					{/if}
				</div>
				<div class="space-y-2">
					<label
						for="end_date"
						class="block text-xs font-medium uppercase tracking-wider text-secondary-app font-mono-app"
					>
						End Date <span class="text-muted-app">(วันสิ้นสุด)</span
						>
					</label>
					<input
						id="end_date"
						type="date"
						name="end_date"
						bind:value={end_date}
						style="color-scheme: dark"
						class="w-full rounded-lg border border-app bg-elevated px-3 py-2 font-mono-app text-sm font-bold text-accent focus:border-strong-app focus:outline-none"
						required
					/>
					{#if errors.end_date}
						<p class="mt-1 text-xs" style="color: var(--danger)">
							{errors.end_date}
						</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Section 5: Purpose / Notes -->
		<div class="space-y-4 border-t border-app pt-4">
			<div class="space-y-2">
				<label
					for="purpose_notes"
					class="block text-xs font-medium uppercase tracking-wider text-secondary-app font-mono-app"
				>
					Purpose / Notes <span class="text-muted-app"
						>(อธิบายวัตถุประสงค์เพิ่มเติม)</span
					>
				</label>
				<textarea
					id="purpose_notes"
					name="purpose_notes"
					bind:value={purpose_notes}
					rows="3"
					class="w-full rounded-lg border border-app bg-elevated px-3 py-2 font-mono-app text-sm text-secondary-app focus:border-strong-app focus:outline-none"
					placeholder="ระบุเหตุผลในการขอใช้เครื่อง เช่น ใช้เป็น API Gateway สเปคสำหรับโปรเจกต์ AuthWeb คอนฟิก VLAN 10..."
					required
				></textarea>
				{#if errors.purpose_notes}
					<p class="mt-1 text-xs" style="color: var(--danger)">
						{errors.purpose_notes}
					</p>
				{/if}
			</div>
		</div>

		<!-- Section 6: Quantity & Submit -->
		<div
			class="flex flex-col items-center justify-between gap-4 border-t border-app pt-6 sm:flex-row"
		></div>
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
