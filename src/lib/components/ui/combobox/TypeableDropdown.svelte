<script lang="ts">
	import { cn } from '$lib/utils';
	import { ChevronDown, Check, Loader2, CornerDownLeft } from 'lucide-svelte';
	import { onMount, tick } from 'svelte';

	export interface DropdownOption {
		value: string;
		label?: string;
		badge?: string;
		description?: string;
	}

	let {
		id = '',
		name = '',
		value = $bindable(''),
		options = [],
		placeholder = 'เลือกหรือพิมพ์...',
		disabled = false,
		required = false,
		loading = false,
		allowCustom = true,
		emptyMessage = 'ไม่พบตัวเลือกที่ตรงกัน',
		class: className = '',
		onselect,
		onchange,
		oninput
	}: {
		id?: string;
		name?: string;
		value?: string;
		options?: Array<string | DropdownOption>;
		placeholder?: string;
		disabled?: boolean;
		required?: boolean;
		loading?: boolean;
		allowCustom?: boolean;
		emptyMessage?: string;
		class?: string;
		onselect?: (val: string, option?: DropdownOption) => void;
		onchange?: (val: string) => void;
		oninput?: (val: string) => void;
	} = $props();

	let isOpen = $state(false);
	let highlightedIndex = $state(-1);
	let containerRef: HTMLDivElement | null = $state(null);
	let inputRef: HTMLInputElement | null = $state(null);
	let menuRef: HTMLDivElement | null = $state(null);

	// Normalize options to DropdownOption objects
	const normalizedOptions = $derived<DropdownOption[]>(
		options.map((opt) => (typeof opt === 'string' ? { value: opt, label: opt } : opt))
	);

	// Filter options based on typed input
	const filteredOptions = $derived<DropdownOption[]>(
		normalizedOptions.filter((opt) => {
			if (!value) return true;
			const q = value.toLowerCase().trim();
			const v = opt.value.toLowerCase();
			const l = (opt.label ?? '').toLowerCase();
			const b = (opt.badge ?? '').toLowerCase();
			const d = (opt.description ?? '').toLowerCase();
			return v.includes(q) || l.includes(q) || b.includes(q) || d.includes(q);
		})
	);

	function toggleDropdown() {
		if (disabled) return;
		isOpen = !isOpen;
		if (isOpen) {
			highlightedIndex = -1;
			tick().then(() => inputRef?.focus());
		}
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		value = target.value;
		isOpen = true;
		highlightedIndex = -1;
		oninput?.(value);
		onchange?.(value);
	}

	function handleFocus() {
		if (!disabled) {
			isOpen = true;
		}
	}

	function selectOption(opt: DropdownOption) {
		value = opt.value;
		isOpen = false;
		highlightedIndex = -1;
		onselect?.(opt.value, opt);
		onchange?.(opt.value);
	}

	function selectCustom(customVal: string) {
		value = customVal;
		isOpen = false;
		highlightedIndex = -1;
		onselect?.(customVal);
		onchange?.(customVal);
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (disabled) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!isOpen) {
				isOpen = true;
				highlightedIndex = 0;
			} else {
				highlightedIndex =
					highlightedIndex < filteredOptions.length - 1 ? highlightedIndex + 1 : 0;
			}
			scrollHighlightedIntoView();
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (!isOpen) {
				isOpen = true;
				highlightedIndex = filteredOptions.length - 1;
			} else {
				highlightedIndex =
					highlightedIndex > 0 ? highlightedIndex - 1 : filteredOptions.length - 1;
			}
			scrollHighlightedIntoView();
		} else if (e.key === 'Enter') {
			if (isOpen) {
				e.preventDefault();
				if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
					selectOption(filteredOptions[highlightedIndex]);
				} else if (allowCustom && value.trim()) {
					selectCustom(value.trim());
				}
			}
		} else if (e.key === 'Escape') {
			isOpen = false;
		}
	}

	function scrollHighlightedIntoView() {
		tick().then(() => {
			if (!menuRef) return;
			const el = menuRef.querySelector(`[data-index="${highlightedIndex}"]`) as HTMLElement;
			el?.scrollIntoView({ block: 'nearest' });
		});
	}

	onMount(() => {
		function handleClickOutside(e: MouseEvent) {
			if (containerRef && !containerRef.contains(e.target as Node)) {
				isOpen = false;
			}
		}
		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	});
</script>

<div bind:this={containerRef} class="relative w-full">
	<div class="relative flex items-center">
		<input
			bind:this={inputRef}
			{id}
			{name}
			type="text"
			autocomplete="off"
			{placeholder}
			{disabled}
			{required}
			bind:value
			oninput={handleInput}
			onfocus={handleFocus}
			onkeydown={handleKeyDown}
			class={cn(
				"h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 pl-3 pr-8 text-base md:text-xs font-mono transition-colors outline-none",
				"placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				className
			)}
		/>

		<button
			type="button"
			tabindex="-1"
			aria-label="Toggle options"
			onclick={toggleDropdown}
			{disabled}
			class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
		>
			{#if loading}
				<Loader2 class="h-3.5 w-3.5 animate-spin" />
			{:else}
				<ChevronDown
					class={cn("h-3.5 w-3.5 transition-transform duration-200", isOpen && "rotate-180")}
				/>
			{/if}
		</button>
	</div>

	{#if isOpen}
		<div
			bind:this={menuRef}
			class="absolute left-0 top-[calc(100%+4px)] z-50 max-h-60 w-full min-w-[200px] overflow-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl backdrop-blur-md outline-none"
		>
			{#if loading}
				<div class="flex items-center justify-center gap-2 py-3 font-mono text-xs text-muted-foreground">
					<Loader2 class="h-3.5 w-3.5 animate-spin" />
					<span>กำลังดึงข้อมูล...</span>
				</div>
			{:else if filteredOptions.length > 0}
				{#each filteredOptions as opt, i}
					{@const isSelected = opt.value.toLowerCase() === value.toLowerCase()}
					{@const isHighlighted = i === highlightedIndex}
					<button
						type="button"
						data-index={i}
						class={cn(
							"flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-mono text-xs transition-colors",
							(isHighlighted || isSelected)
								? "bg-accent text-accent-foreground font-medium"
								: "hover:bg-accent/60 text-foreground"
						)}
						onclick={() => selectOption(opt)}
						onmouseenter={() => (highlightedIndex = i)}
					>
						<div class="flex items-center gap-2 truncate">
							<Check class={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
							<span class="truncate">{opt.label || opt.value}</span>
						</div>
						{#if opt.badge || opt.description}
							<span class="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">
								{opt.badge || opt.description}
							</span>
						{/if}
					</button>
				{/each}
			{:else if allowCustom && value.trim()}
				<button
					type="button"
					class="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 font-mono text-xs text-accent-foreground bg-accent/40 hover:bg-accent transition-colors"
					onclick={() => selectCustom(value.trim())}
				>
					<div class="flex items-center gap-2 truncate">
						<CornerDownLeft class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						<span class="truncate">ใช้ค่า: <strong class="text-foreground">{value.trim()}</strong></span>
					</div>
					<span class="text-[10px] text-muted-foreground">Enter</span>
				</button>
			{:else}
				<div class="py-3 text-center font-mono text-xs text-muted-foreground">
					{emptyMessage}
				</div>
			{/if}
		</div>
	{/if}
</div>
