<script lang="ts">
	import SshTerminal from '$lib/components/status/SshTerminal.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Plus, X } from '@lucide/svelte';

	let { instanceId, defaultHost, defaultIP, defaultUsername = 'root' }: {
		instanceId: string;
		defaultHost: string;
		defaultIP?: string;
		defaultUsername?: string;
	} = $props();

	const MAX_SESSIONS = 8;
	let nextId = 2;
	let sessions = $state([1]);
	let active = $state(1);

	function addSession() {
		if (sessions.length >= MAX_SESSIONS) return;
		const id = nextId++;
		sessions = [...sessions, id];
		active = id;
	}

	function closeSession(id: number) {
		if (sessions.length === 1) return;
		const index = sessions.indexOf(id);
		sessions = sessions.filter((session) => session !== id);
		if (active === id) active = sessions[Math.max(0, index - 1)];
	}
</script>

<div class="flex h-full min-h-0 w-full flex-col">
	<div class="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted px-2 py-1" role="tablist" aria-label="SSH sessions">
		{#each sessions as id (id)}
			<div class="flex shrink-0 items-center rounded-md" class:bg-background={active === id}>
				<button type="button" role="tab" aria-selected={active === id} onclick={() => (active = id)}
					class="min-h-9 px-3 font-mono text-xs">SSH {id}</button>
				{#if sessions.length > 1}
					<button type="button" aria-label="Close SSH session {id}" onclick={() => closeSession(id)}
						class="flex size-9 items-center justify-center rounded hover:bg-accent"><X class="size-3" /></button>
				{/if}
			</div>
		{/each}
		<Button type="button" variant="ghost" size="sm" disabled={sessions.length >= MAX_SESSIONS}
			onclick={addSession} aria-label="New SSH session" title="New SSH session (up to 8)">
			<Plus data-icon="inline-start" /> New session
		</Button>
	</div>
	{#each sessions as id (id)}
		<div class="min-h-0 flex-1" class:hidden={active !== id} role="tabpanel">
			<SshTerminal {instanceId} {defaultHost} {defaultIP} {defaultUsername} />
		</div>
	{/each}
</div>
