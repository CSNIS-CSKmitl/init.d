<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import Navbar from '$lib/components/Navbar.svelte';
	import WhatsNewDialog from '$lib/components/WhatsNewDialog.svelte';
	import AnnouncementCenter from '$lib/components/AnnouncementCenter.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	let announcementOpen = $state(false);
	let showUpdates = $state(false);
	let isLegalPage = $derived(['/privacy', '/terms'].includes(page.url.pathname.replace(/\/$/, '')));
</script>

<ModeWatcher defaultMode="dark" />

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>init.d — infrastructure provisioning</title>
</svelte:head>

<div class="relative flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground transition-colors duration-300">
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
	{#if !isLegalPage || announcementOpen}
		<AnnouncementCenter
			userId={data.user?.id ?? null}
			bind:open={announcementOpen}
			onInitialCheck={(unseen) => (showUpdates = !unseen)}
		/>
		{#if !isLegalPage && showUpdates && !announcementOpen}
			<WhatsNewDialog userId={data.user?.id ?? null} />
		{/if}
	{/if}
	<main class="relative mx-auto w-full max-w-[1400px] flex-1 px-6 py-10">
		{@render children()}
	</main>
	<footer class="relative border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
		<span>© {new Date().getFullYear()} <a href="https://github.com/techasit5415" target="_blank" rel="noopener noreferrer" class="hover:text-foreground hover:underline">Techasit Vanitpattarakul</a>
		<a href="https://github.com/BoByed" target="_blank" rel="noopener noreferrer" class="hover:text-foreground hover:underline">Pannawat Srithongnark</a>
		<a href="https://github.com/boon4681" target="_blank" rel="noopener noreferrer" class="hover:text-foreground hover:underline">Passawich Thongruang</a>

		</span>
		<nav aria-label="นโยบายและข้อกำหนด" class="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1">
		  <a href="/privacy" class="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground">นโยบายความเป็นส่วนตัว</a>
		  <a href="/terms" class="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground">ข้อกำหนดการใช้งาน</a>
		</nav>
	</footer>
</div>
