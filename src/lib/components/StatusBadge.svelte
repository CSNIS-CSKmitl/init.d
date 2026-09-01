<script lang="ts">
	import type { LeaseStatus } from "$lib/types";
	import { Badge } from "$lib/components/ui/badge";
	import { CheckCircle2, CircleDashed } from "@lucide/svelte";

	let { status }: { status: LeaseStatus } = $props();
</script>

{#if status === "pending"}
	<Badge variant="outline" class="uppercase tracking-widest">
		<CircleDashed class="text-warning" />
		pending
	</Badge>
{:else}
	<Badge variant="outline" class="uppercase tracking-widest">
		<CheckCircle2 class="text-success" />
		completed
	</Badge>
{/if}
