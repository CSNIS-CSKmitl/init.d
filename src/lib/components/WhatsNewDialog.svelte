<script lang="ts">
	import { browser } from '$app/environment';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Check, Sparkles } from '@lucide/svelte';
	import { whatsNew } from '$lib/whats-new';

	let { userId }: { userId: string | null } = $props();
	let open = $state(false);

	function storageKey(id: string) {
		return `initd:whats-new:${id}`;
	}

	$effect(() => {
		if (!browser || !whatsNew.enabled || !userId) {
			open = false;
			return;
		}
		try {
			open = localStorage.getItem(storageKey(userId)) !== whatsNew.version;
		} catch {
			open = true;
		}
	});

	function remember() {
		if (!browser || !userId) return;
		try {
			localStorage.setItem(storageKey(userId), whatsNew.version);
		} catch {
			// The dialog can still be closed when browser storage is unavailable.
		}
	}

	function dismiss() {
		remember();
		open = false;
	}
</script>

<Dialog.Root bind:open onOpenChange={(nextOpen) => { if (!nextOpen) remember(); }}>
	<Dialog.Content class="max-h-[min(90vh,700px)] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<div class="mb-2 flex items-center gap-2">
				<Sparkles aria-hidden="true" class="size-5 text-primary" />
				<Badge variant="secondary">อัปเดตล่าสุด</Badge>
			</div>
			<Dialog.Title class="text-xl">{whatsNew.title}</Dialog.Title>
			<Dialog.Description>{whatsNew.intro}</Dialog.Description>
		</Dialog.Header>

		<ul class="flex flex-col gap-3" aria-label="รายการอัปเดต">
			{#each whatsNew.items as item (item.title)}
				<li class="flex gap-3 rounded-lg border border-border bg-muted/40 p-3">
					<Check aria-hidden="true" class="mt-0.5 size-4 shrink-0 text-primary" />
					<div class="flex flex-col gap-1">
						<p class="font-medium text-foreground">{item.title}</p>
						<p class="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
					</div>
				</li>
			{/each}
		</ul>

		<Dialog.Footer class="items-center sm:justify-between">
			<p class="text-xs text-muted-foreground">ปิดแล้วจะไม่แสดงซ้ำจนกว่าจะมีประกาศใหม่</p>
			<Button type="button" onclick={dismiss} class="w-full sm:w-auto">รับทราบ</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
