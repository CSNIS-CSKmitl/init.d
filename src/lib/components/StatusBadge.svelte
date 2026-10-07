<script lang="ts">
	import type { LeaseStatus } from "$lib/types";
	import { Badge } from "$lib/components/ui/badge";
	import { CheckCircle2, CircleDashed, CircleX } from "@lucide/svelte";

	let { status }: { status: LeaseStatus } = $props();
</script>

{#if status === "pending"}
	<Badge variant="outline" class="uppercase tracking-widest">
		<CircleDashed class="text-warning" />
		pending
	</Badge>
{:else if status === "failed"}
	<Badge variant="destructive" class="uppercase tracking-widest">
		<CircleX />
		failed
	</Badge>
{:else}
	<Badge variant="outline" class="uppercase tracking-widest">
		<CheckCircle2 class="text-success" />
		completed
	</Badge>
{/if}
