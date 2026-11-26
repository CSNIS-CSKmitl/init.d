<script lang="ts">
	import '../app.css';
	import { version } from '$app/environment';
	import { page } from '$app/state';
	import { fly } from 'svelte/transition';
	import favicon from '$lib/assets/favicon.svg';
	import Navbar from '$lib/components/Navbar.svelte';
	import WhatsNewDialog from '$lib/components/WhatsNewDialog.svelte';
	import AnnouncementCenter from '$lib/components/AnnouncementCenter.svelte';
	import LegalConsent from '$lib/components/LegalConsent.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { toasts, dismissToast } from '$lib/toast';
	import { CheckCircle2, AlertCircle, Info, X } from '@lucide/svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	let announcementOpen = $state(false);
	let showUpdates = $state(false);
	let legalAccepted = $state(false);
	let isLegalPage = $derived(['/privacy', '/terms'].includes(page.url.pathname.replace(/\/$/, '')));

	$effect(() => {
		if (isLegalPage || !data.user?.id) {
			legalAccepted = true;
			return;
		}
		if (typeof localStorage !== 'undefined') {
			legalAccepted = localStorage.getItem(`initd:legal-consent:v1:${data.user.id}`) === 'accepted';
		}
	});
</script>

<ModeWatcher defaultMode="dark" />

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>init.d — infrastructure provisioning</title>
</svelte:head>

<div class="relative flex min-h-screen flex-col overflow-x-clip bg-background text-foreground transition-colors duration-300">
	<!-- Ambient Background Glows -->
	<div
		class="pointer-events-none absolute top-0 left-1/2 -z-10 h-[350px] w-full max-w-[1200px] -translate-x-1/2 opacity-20 blur-[100px] transition-opacity duration-300"
		style="background: radial-gradient(circle at top, var(--primary), transparent 70%);"
	></div>
	
	<!-- Fine Grid Mesh Overlay -->
	<div 
		class="pointer-events-none absolute inset-0 -z-20 opacity-30"
		style="
			background-image: 
				linear-gradient(to right, var(--border) 1px, transparent 1px),
				linear-gradient(to bottom, var(--border) 1px, transparent 1px);
			background-size: 24px 24px;
			mask-image: radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%);
			-webkit-mask-image: radial-gradient(ellipse 60% 50% at 50% 0%, #000 70%, transparent 100%);
		"
	></div>

	<Navbar onAnnouncement={() => (announcementOpen = true)} />
	{#if legalAccepted && (!isLegalPage || announcementOpen)}
		<AnnouncementCenter
			userId={data.user?.id ?? null}
			bind:open={announcementOpen}
			onInitialCheck={(unseen) => (showUpdates = !unseen)}
		/>
		{#if legalAccepted && !isLegalPage && showUpdates && !announcementOpen}
			<WhatsNewDialog userId={data.user?.id ?? null} />
		{/if}
	{/if}
	<main class="relative mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-10">
		{#key page.url.pathname}
			<div class="animate-page-enter">
				{@render children()}
			</div>
		{/key}
	</main>
	<footer class="relative border-t border-border px-6 py-3 text-center text-[11px] text-muted-foreground">
		<span>© {new Date().getFullYear()} · <a href="https://github.com/techasit5415" target="_blank" rel="noopener noreferrer" class="hover:text-foreground hover:underline">Techasit Vanitpattarakul</a>
		<a href="https://github.com/BoByed" target="_blank" rel="noopener noreferrer" class="hover:text-foreground hover:underline">Pannawat Srithongnark</a>
		<a href="https://github.com/boon4681" target="_blank" rel="noopener noreferrer" class="hover:text-foreground hover:underline">Passawich Thongruang</a>
		· <span class="font-mono tabular-nums" title="Semantic Versioning: MAJOR.MINOR.PATCH">v{version}</span>
		</span>
		<nav aria-label="นโยบายและข้อกำหนด" class="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-0">
		  <a href="/privacy" class="inline-flex min-h-7 items-center underline underline-offset-4 hover:text-foreground">นโยบายความเป็นส่วนตัว</a>
		  <a href="/terms" class="inline-flex min-h-7 items-center underline underline-offset-4 hover:text-foreground">ข้อกำหนดการใช้งาน</a>
		</nav>
	</footer>
  <LegalConsent userId={data.user?.id ?? null} enabled={!isLegalPage} onAccepted={() => (legalAccepted = true)} />
</div>

<!-- Top-center toast notifications -->
<div
	aria-live="polite"
	aria-atomic="false"
	class="pointer-events-none fixed top-4 left-1/2 z-[120] flex w-[min(92vw,28rem)] -translate-x-1/2 flex-col items-center gap-2"
>
	{#each $toasts as item (item.id)}
		<div
			role={item.type === 'error' ? 'alert' : 'status'}
			transition:fly={{ y: -24, duration: 220 }}
			class="pointer-events-auto flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm shadow-lg backdrop-blur-md {item.type === 'success'
				? 'border-success/30 bg-card/95 text-foreground'
				: item.type === 'error'
					? 'border-destructive/40 bg-card/95 text-destructive'
					: 'border-border bg-card/95 text-foreground'}"
		>
			{#if item.type === 'success'}
				<CheckCircle2 class="size-4 shrink-0 text-success" aria-hidden="true" />
			{:else if item.type === 'error'}
				<AlertCircle class="size-4 shrink-0 text-destructive" aria-hidden="true" />
			{:else}
				<Info class="size-4 shrink-0 text-primary" aria-hidden="true" />
			{/if}
			<span class="min-w-0 flex-1 leading-snug">{item.message}</span>
			<button
				type="button"
				onclick={() => dismissToast(item.id)}
				aria-label="ปิดการแจ้งเตือน"
				class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			>
				<X class="size-3.5" />
			</button>
		</div>
	{/each}
</div>
