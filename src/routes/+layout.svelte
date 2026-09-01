<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Navbar from '$lib/components/Navbar.svelte';
	import { ModeWatcher } from 'mode-watcher';

	let { children } = $props();
</script>

<ModeWatcher defaultMode="dark" />

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>init.d — infrastructure provisioning</title>
</svelte:head>

<div class="relative min-h-screen overflow-x-hidden bg-background text-foreground transition-colors duration-300">
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

	<Navbar />
	<main class="relative mx-auto max-w-[1400px] px-6 py-10">
		{@render children()}
	</main>
</div>
