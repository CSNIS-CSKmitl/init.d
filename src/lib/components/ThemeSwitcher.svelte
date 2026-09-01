<script lang="ts">
	import { toggleMode, mode } from "mode-watcher";
	import { Sun, Moon } from "@lucide/svelte";
	import { Button } from "$lib/components/ui/button";
</script>

<Button
	variant="outline"
	size="icon"
	onclick={toggleMode}
	aria-label="Toggle color theme"
	title="Toggle color theme"
>
	{#if mode.current === "dark"}
		<Sun />
	{:else}
		<Moon />
	{/if}
</Button>
