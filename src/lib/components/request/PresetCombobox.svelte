<script lang="ts">
	import type { Preset } from '$lib/presets';
	import { TriangleAlert, Search, X } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import * as Alert from '$lib/components/ui/alert';
	import * as Field from '$lib/components/ui/field';

	let {
		presets = [],
		selectedPreset = $bindable(''),
		onSelect,
		onClear
	}: {
		presets: Preset[];
		selectedPreset: string;
		onSelect: (slug: string) => void;
		onClear: () => void;
	} = $props();

	let presetQuery = $state('');
	let presetDropdownOpen = $state(false);
	let acknowledgedDevelopSlug = $state('');

	const filteredPresets = $derived.by(() => {
		const q = presetQuery.trim().toLowerCase();
		if (!q) return presets;
		return presets.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				p.slug.toLowerCase().includes(q)
		);
	});

	const presetDisplayValue = $derived.by(() => {
		if (selectedPreset) {
			return (
				presets.find((p) => p.slug === selectedPreset)?.name ??
				presetQuery
			);
		}
		return presetQuery;
	});

	function selectPreset(slug: string) {
		selectedPreset = slug;
		const match = slug
			? presets.find((p) => p.slug === slug)
			: undefined;
		presetQuery = match?.name ?? '';
		presetDropdownOpen = false;
		onSelect(slug);
	}

	function clearPreset() {
		selectedPreset = '';
		presetQuery = '';
		presetDropdownOpen = false;
		onClear();
	}

	function handleWindowPointerDown(e: PointerEvent) {
		if (!presetDropdownOpen) return;
		const target = e.target as HTMLElement | null;
		if (target?.closest('.preset-combobox')) return;
		presetDropdownOpen = false;
	}
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

{#if presets.length > 0}
	{@const selectedPresetRecord = presets.find((p) => p.slug === selectedPreset)}
	{@const showDevelopWarning =
		selectedPresetRecord?.status === 'Develop' &&
		acknowledgedDevelopSlug !== selectedPreset}
	<div class="flex flex-col gap-4 rounded-lg border border-dashed border-border bg-card/40 p-5">
		<Field.Field>
			<Field.FieldLabel
				for="preset-combobox"
				class="font-mono text-xs uppercase tracking-wider text-foreground/70"
			>
				Quick Preset
				<span class="text-muted-foreground">
					· optional · auto-fills from catalog ({presets.length}) · type to search
				</span>
			</Field.FieldLabel>

			<div class="preset-combobox relative">
				<Search
					class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					id="preset-combobox"
					type="text"
					role="combobox"
					aria-expanded={presetDropdownOpen}
					aria-autocomplete="list"
					aria-controls="preset-listbox"
					placeholder="Search presets — e.g. nginx, postgres, ubuntu…"
					value={presetDisplayValue}
					oninput={(e) => {
						presetQuery = e.currentTarget.value;
						if (selectedPreset && presetQuery !== presetDisplayValue) {
							selectedPreset = '';
						}
						presetDropdownOpen = true;
					}}
					onfocus={() => (presetDropdownOpen = true)}
					class="pr-9 pl-9 font-mono"
				/>

				{#if selectedPreset}
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						aria-label="Clear preset selection"
						onclick={clearPreset}
						class="absolute top-1/2 right-2 -translate-y-1/2"
					>
						<X data-icon="inline-start" />
					</Button>
				{/if}

				{#if presetDropdownOpen}
					<ul
						id="preset-listbox"
						role="listbox"
						class="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-md"
					>
						<li
							role="option"
							aria-selected={selectedPreset === ''}
							onmousedown={() => selectPreset('')}
							class="cursor-pointer px-3 py-2 font-mono text-xs text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
						>
							— blank / start from scratch —
						</li>
						{#if filteredPresets.length === 0}
							<li class="px-3 py-2 font-mono text-xs text-muted-foreground">
								No matches for "{presetQuery}".
							</li>
						{:else}
							{#each filteredPresets as preset (preset.slug)}
								{@const isDevelop = preset.status === 'Develop'}
								<li
									role="option"
									aria-selected={selectedPreset === preset.slug}
									onmousedown={() => selectPreset(preset.slug)}
									class="flex cursor-pointer items-center justify-between gap-2 border-t border-border px-3 py-2 font-mono text-xs transition hover:bg-accent hover:text-accent-foreground"
								>
									<span class="flex flex-col gap-0.5">
										<span class="flex items-center gap-2 text-foreground">
											{preset.name}
											{#if isDevelop}
												<Badge variant="outline" class="text-primary">dev</Badge>
											{/if}
										</span>
										<span class="text-muted-foreground">
											{preset.type} · {preset.os_template} · {preset.slug}
										</span>
									</span>
									<span class="shrink-0 text-muted-foreground">
										{preset.default_cpu}C / {preset.default_ram}G / {preset.default_disk}G
									</span>
								</li>
							{/each}
						{/if}
					</ul>
				{/if}
			</div>
		</Field.Field>

		{#if showDevelopWarning}
			<Alert.Root class="border-primary/40 bg-primary/5 text-primary">
				<TriangleAlert />
				<Alert.Title
					class="font-mono text-sm font-bold uppercase tracking-wider"
				>
					Development script
				</Alert.Title>
				<Alert.Description class="text-foreground/70">
					This script is in active development and may be unstable, incomplete, or subject to
					breaking changes. It is
					<span class="font-semibold text-foreground">not recommended for production use</span>.
				</Alert.Description>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onclick={() => (acknowledgedDevelopSlug = selectedPreset)}
					class="col-start-2 mt-2 w-fit border-primary/40 font-mono text-[10px] font-bold tracking-wider text-primary uppercase hover:bg-primary/10"
				>
					I understand — show install command →
				</Button>
			</Alert.Root>
		{/if}

		{#if selectedPresetRecord}
			<div class="flex flex-col gap-2 border-t border-border pt-3 text-xs">
				<div class="flex items-start justify-between gap-3">
					<p class="flex-1 leading-relaxed text-foreground/70">
						{selectedPresetRecord.description || 'No description provided.'}
					</p>
					{#if selectedPresetRecord.source_url}
						<a
							href={selectedPresetRecord.source_url}
							target="_blank"
							rel="noopener noreferrer"
							class="shrink-0 font-mono text-[10px] tracking-wider text-primary uppercase whitespace-nowrap hover:underline"
						>
							community-scripts →
						</a>
					{/if}
				</div>
				<div class="flex flex-wrap gap-x-2 gap-y-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
					<span>type: <span class="text-foreground">{selectedPresetRecord.type}</span></span>
					<span>·</span>
					<span>os: <span class="text-foreground">{selectedPresetRecord.os_template}</span></span>
					<span>·</span>
					<span>net: <span class="text-foreground">{selectedPresetRecord.default_network}</span></span>
					{#if selectedPresetRecord.default_ports}
						<span>·</span>
						<span>port: <span class="text-foreground">{selectedPresetRecord.default_ports}</span></span>
					{/if}
					{#if selectedPresetRecord.category}
						<span>·</span>
						<span>cat: <span class="text-foreground">{selectedPresetRecord.category}</span></span>
					{/if}
					{#if selectedPresetRecord.status}
						<span>·</span>
						<span>
							status:
							<span class={selectedPresetRecord.status === 'Develop' ? 'font-bold text-primary' : 'text-foreground'}>
								{selectedPresetRecord.status}
							</span>
						</span>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}
