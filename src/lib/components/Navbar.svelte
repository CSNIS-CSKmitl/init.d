<script lang="ts">
	import { page } from "$app/state";
	import ThemeSwitcher from "./ThemeSwitcher.svelte";
	import {
		Server,
		FilePlus2,
		Activity,
		ShieldCheck,
		LogOut,
		LogIn,
		Menu,
		X,
	} from "@lucide/svelte";

	let user = $derived(page.data.user);
	const isAdmin = $derived(user?.role === "admin");

	const links = $derived([
		...(user
			? [{ href: "/request", label: "Request", icon: FilePlus2 }]
			: []),
		...(user ? [{ href: "/status", label: "Status", icon: Activity }] : []),
		...(isAdmin
			? [{ href: "/admin", label: "Admin", icon: ShieldCheck }]
			: []),
	]);

	// Mobile menu state — separate from the desktop nav so the hamburger
	// can collapse everything into a sheet on small screens. The menu
	// auto-closes on route change so we don't have a stale open sheet
	// when the user navigates.
	let mobileOpen = $state(false);

	$effect(() => {
		// Re-run when the pathname changes — reading `page.url.pathname`
		// inside the effect registers it as a reactive dependency.
		page.url.pathname;
		mobileOpen = false;
	});
</script>

<header
	class="sticky top-0 z-30 border-b border-app bg-app/80 backdrop-blur transition-colors duration-300"
>
	<div
		class="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-4 sm:gap-6 sm:px-6"
	>
		<div class="flex flex-col justify-center">
			<a
				href="/"
				class="flex items-center gap-2 font-mono text-sm tracking-tight text-app"
			>
				<Server class="h-4 w-4 text-accent" />
				<span class="font-semibold">init.d</span>

				<!-- Brand suffix only shows from md up — keeps the row from
				     getting crowded on phones where every pixel counts. -->
				<!-- <span class="hidden text-muted-app md:inline">/ infrastructure provisioning</span> -->
			</a>
			<p class="text-[10px] leading-tight text-zinc-500 sm:text-xs">
				พบปัญหา ติดต่อ 66050160@kmitl.ac.th หรือ bornzi
			</p>
		</div>
		<!-- Desktop nav — hidden below lg where the hamburger takes over. -->
		<nav class="hidden items-center gap-1 lg:flex">
			{#each links as link (link.href)}
				{@const active = page.url.pathname.startsWith(link.href)}
				{@const Icon = link.icon}
				<a
					href={link.href}
					class="inline-flex h-8 items-center gap-1.5 rounded-md px-3 font-mono text-xs uppercase tracking-widest transition-colors duration-200 {active
						? 'bg-elevated text-app'
						: 'text-secondary-app hover:bg-elevated hover:text-app'}"
				>
					<Icon class="h-3.5 w-3.5 {active ? 'text-accent' : ''}" />
					{link.label}
				</a>
			{/each}

			<div class="ml-2 flex items-center gap-2">
				<ThemeSwitcher />
				{#if user}
					<form action="/logout" method="POST">
						<button
							type="submit"
							class="inline-flex h-9 items-center gap-1.5 rounded-md border border-app bg-surface px-3 font-mono text-xs uppercase tracking-widest text-secondary-app transition-colors duration-200 hover:border-strong-app hover:text-app"
							title={user.email}
						>
							<LogOut class="h-3.5 w-3.5" />
							<span class="hidden xl:inline">Sign out</span>
						</button>
					</form>
				{:else}
					<a
						href="/login"
						class="inline-flex h-9 items-center gap-1.5 rounded-md border border-app bg-surface px-3 font-mono text-xs uppercase tracking-widest text-secondary-app transition-colors duration-200 hover:border-strong-app hover:text-app"
					>
						<LogIn class="h-3.5 w-3.5" />
						<span class="hidden xl:inline">Sign in</span>
					</a>
				{/if}
			</div>
		</nav>

		<!-- Mobile controls — hamburger + always-visible auth button so
		     the user is never trapped without a sign-out. -->
		<div class="flex items-center gap-2 lg:hidden">
			<ThemeSwitcher />
			{#if user}
				<form action="/logout" method="POST">
					<button
						type="submit"
						aria-label="Sign out"
						title={user.email}
						class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-app bg-surface text-secondary-app transition-colors duration-200 hover:border-strong-app hover:text-app"
					>
						<LogOut class="h-3.5 w-3.5" />
					</button>
				</form>
			{:else}
				<a
					href="/login"
					aria-label="Sign in"
					class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-app bg-surface text-secondary-app transition-colors duration-200 hover:border-strong-app hover:text-app"
				>
					<LogIn class="h-3.5 w-3.5" />
				</a>
			{/if}
			<button
				type="button"
				aria-label={mobileOpen ? "Close menu" : "Open menu"}
				aria-expanded={mobileOpen}
				onclick={() => (mobileOpen = !mobileOpen)}
				class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-app bg-surface text-secondary-app transition-colors duration-200 hover:border-strong-app hover:text-app"
			>
				{#if mobileOpen}
					<X class="h-4 w-4" />
				{:else}
					<Menu class="h-4 w-4" />
				{/if}
			</button>
		</div>
	</div>

	<!-- Mobile sheet. Dropdown rather than full-screen overlay — keeps
	     it cheap and in keeping with the rest of the UI's tone. The
	     svelte:window click-outside handler closes it when the user
	     taps anywhere else. -->
	{#if mobileOpen}
		<div class="border-t border-app bg-surface lg:hidden">
			<nav
				class="mx-auto flex max-w-[1400px] flex-col gap-1 px-4 py-3 sm:px-6"
			>
				{#each links as link (link.href)}
					{@const active = page.url.pathname.startsWith(link.href)}
					{@const Icon = link.icon}
					<a
						href={link.href}
						class="inline-flex h-10 items-center gap-2 rounded-md px-3 font-mono text-xs uppercase tracking-widest transition-colors duration-200 {active
							? 'bg-elevated text-app'
							: 'text-secondary-app hover:bg-elevated hover:text-app'}"
					>
						<Icon class="h-4 w-4 {active ? 'text-accent' : ''}" />
						{link.label}
					</a>
				{:else}
					<p class="px-3 py-4 text-center text-xs text-muted-app">
						Sign in to access Request and Status.
					</p>
				{/each}
				{#if user}
					<p
						class="mt-2 truncate border-t border-app pt-2 font-mono text-[11px] text-muted-app"
					>
						{user.email}
					</p>
				{/if}
			</nav>
		</div>
	{/if}
</header>

<svelte:window
	onpointerdown={(e) => {
		if (!mobileOpen) return;
		const target = e.target as HTMLElement | null;
		if (target?.closest("header")) return;
		mobileOpen = false;
	}}
/>
