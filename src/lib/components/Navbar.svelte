<script lang="ts">
	import { page } from "$app/state";
	import ThemeSwitcher from "./ThemeSwitcher.svelte";
	import { Button } from "$lib/components/ui/button";
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
	class="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur transition-colors duration-300"
>
	<div
		class="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-4 sm:gap-6 sm:px-6"
	>
		<div class="flex flex-col justify-center">
			<a
				href="/"
				class="flex items-center gap-2 font-mono text-sm tracking-tight text-foreground"
			>
				<Server class="text-primary" />
				<span class="font-semibold">init.d</span>
			</a>
			<p class="text-[10px] leading-tight text-muted-foreground sm:text-xs">
				พบปัญหาติดต่อที่ Support Server
			</p>
		</div>
		<!-- Desktop nav — hidden below lg where the hamburger takes over. -->
		<nav class="hidden items-center gap-1 lg:flex">
			{#each links as link (link.href)}
				{@const active = page.url.pathname.startsWith(link.href)}
				{@const Icon = link.icon}
				<Button
					href={link.href}
					variant={active ? "secondary" : "ghost"}
					size="sm"
					class="font-mono text-xs uppercase tracking-widest"
				>
					<Icon data-icon="inline-start" class={active ? "text-primary" : ""} />
					{link.label}
				</Button>
			{/each}

			<div class="ml-2 flex items-center gap-2">
				<ThemeSwitcher />
				{#if user}
					<form action="/logout" method="POST">
						<Button
							type="submit"
							variant="outline"
							size="sm"
							class="font-mono text-xs uppercase tracking-widest"
							title={user.email}
						>
							<LogOut data-icon="inline-start" />
							<span class="hidden xl:inline">Sign out</span>
						</Button>
					</form>
				{:else}
					<Button
						href="/login"
						variant="outline"
						size="sm"
						class="font-mono text-xs uppercase tracking-widest"
					>
						<LogIn data-icon="inline-start" />
						<span class="hidden xl:inline">Sign in</span>
					</Button>
				{/if}
			</div>
		</nav>

		<!-- Mobile controls — hamburger + always-visible auth button so
		     the user is never trapped without a sign-out. -->
		<div class="flex items-center gap-2 lg:hidden">
			<ThemeSwitcher />
			{#if user}
				<form action="/logout" method="POST">
					<Button
						type="submit"
						variant="outline"
						size="icon"
						aria-label="Sign out"
						title={user.email}
					>
						<LogOut />
					</Button>
				</form>
			{:else}
				<Button href="/login" variant="outline" size="icon" aria-label="Sign in">
					<LogIn />
				</Button>
			{/if}
			<Button
				variant="outline"
				size="icon"
				aria-label={mobileOpen ? "Close menu" : "Open menu"}
				aria-expanded={mobileOpen}
				onclick={() => (mobileOpen = !mobileOpen)}
			>
				{#if mobileOpen}
					<X />
				{:else}
					<Menu />
				{/if}
			</Button>
		</div>
	</div>

	<!-- Mobile sheet. Dropdown rather than full-screen overlay — keeps
	     it cheap and in keeping with the rest of the UI's tone. The
	     svelte:window click-outside handler closes it when the user
	     taps anywhere else. -->
	{#if mobileOpen}
		<div class="border-t border-border bg-card lg:hidden">
			<nav class="mx-auto flex max-w-[1400px] flex-col gap-1 px-4 py-3 sm:px-6">
				{#each links as link (link.href)}
					{@const active = page.url.pathname.startsWith(link.href)}
					{@const Icon = link.icon}
					<Button
						href={link.href}
						variant={active ? "secondary" : "ghost"}
						class="justify-start font-mono text-xs uppercase tracking-widest"
					>
						<Icon data-icon="inline-start" class={active ? "text-primary" : ""} />
						{link.label}
					</Button>
				{:else}
					<p class="px-3 py-4 text-center text-xs text-muted-foreground">
						Sign in to access Request and Status.
					</p>
				{/each}
				{#if user}
					<p
						class="mt-2 truncate border-t border-border pt-2 font-mono text-[11px] text-muted-foreground"
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
