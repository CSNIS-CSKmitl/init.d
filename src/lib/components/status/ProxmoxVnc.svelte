<script lang="ts">
	import { onMount } from 'svelte';
	import type RFB from '@novnc/novnc';
	import { Button } from '$lib/components/ui/button';

	let { wsUrl, password, onRetry }: { wsUrl: string; password: string; onRetry: () => void } = $props();
	let screen: HTMLDivElement;
	let client: RFB | undefined;
	let connectionState = $state<'connecting' | 'connected' | 'disconnected'>('connecting');
	let error = $state<string | null>(null);

	onMount(() => {
		let disposed = false;
		void import('@novnc/novnc').then(({ default: RFBClient }) => {
			if (disposed) return;
			const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
			client = new RFBClient(screen, `${protocol}//${location.host}${wsUrl}`, {
				credentials: { password }
			});
			client.scaleViewport = true;
			client.clipViewport = true;
			client.addEventListener('connect', () => {
				connectionState = 'connected';
				error = null;
			});
			client.addEventListener('credentialsrequired', () => {
				client?.sendCredentials({ password });
			});
			client.addEventListener('securityfailure', (event) => {
				error = event.detail?.reason || 'VNC authentication failed.';
			});
			client.addEventListener('disconnect', (event) => {
				if (disposed) return;
				connectionState = 'disconnected';
				error ||= event.detail?.clean ? 'VNC session ended.' : 'VNC connection was lost.';
			});
		}).catch(() => {
			if (!disposed) {
				connectionState = 'disconnected';
				error = 'Could not load the VNC viewer.';
			}
		});
		return () => {
			disposed = true;
			client?.disconnect();
		};
	});
</script>

<div class="flex h-full w-full min-h-0 flex-col bg-zinc-950">
	<div class="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2 font-mono text-xs text-zinc-300">
		<span>VM graphical console · {connectionState}</span>
		{#if connectionState === 'connected'}
			<Button type="button" variant="outline" size="xs" onclick={() => client?.sendCtrlAltDel()}>
				Ctrl+Alt+Del
			</Button>
		{/if}
	</div>
	<div class="relative min-h-0 flex-1">
		<div bind:this={screen} class="h-full w-full overflow-hidden"></div>
		{#if connectionState !== 'connected'}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-zinc-950/85 p-6 text-center text-sm text-zinc-200">
				<p>{error || 'Connecting to VM display…'}</p>
				{#if connectionState === 'disconnected'}
					<Button type="button" variant="outline" size="sm" onclick={onRetry}>Reconnect</Button>
				{/if}
			</div>
		{/if}
	</div>
</div>
