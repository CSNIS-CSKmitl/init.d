<script lang="ts">
	import {
		FilePlus2,
		Activity,
		ShieldCheck,
		Server,
		ArrowUpRight,
		Terminal,
		Cpu,
		HardDrive
	} from "@lucide/svelte";
	import { page } from "$app/state";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";

	const user = $derived(page.data.user);
	const isAdmin = $derived(
		user?.role === "admin" ||
		Boolean(user?.roles?.some((r) => ["admin", "head", "super_admin"].includes(r)))
	);

	const features = $derived([
		{
			href: "/request",
			icon: FilePlus2,
			title: "Request provisioning",
			badge: "Compute & storage",
			body: "Submit requests for new virtual machines or container instances with custom CPU cores, memory limits, and networking leases.",
			action: "Open request form"
		},
		{
			href: "/status",
			icon: Activity,
			title: "Instance status",
			badge: "Telemetry & queue",
			body: "Monitor provisioning state, track lease queue positions, and retrieve web console or SSH credentials for active instances.",
			action: "View instances"
		},
		...(isAdmin
			? [
					{
						href: "/admin",
						icon: ShieldCheck,
						title: "Cluster administration",
						badge: "Hypervisor control",
						body: "Manage pending leases, review hypervisor resource quotas, approve container templates, and oversee node health.",
						action: "Open admin panel"
					},
				]
			: []),
	]);
</script>

<svelte:head>
	<title>Infrastructure Provisioning · CS KMITL init.d</title>
</svelte:head>

<div class="mx-auto max-w-5xl py-8">
	<!-- Operational Header -->
	<header class="mb-10 flex flex-col justify-between gap-6 border-b border-border/80 pb-8 sm:flex-row sm:items-end">
		<div class="space-y-2">
			<h1 class="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
				Infrastructure Provisioning
			</h1>
			<p class="max-w-2xl text-sm leading-relaxed text-muted-foreground">
				Automated virtual machine and LXC container lifecycle management for CS KMITL academic labs, student research, and service deployments.
			</p>
		</div>

		{#if !user}
			<div class="flex sm:shrink-0">
				<Button href="/login" class="h-10 px-4 text-xs font-medium">
					<Server class="size-4" strokeWidth={1.5} />
					<span>Sign in to manage instances</span>
				</Button>
			</div>
		{/if}
	</header>

	<!-- Features & Resource Grid -->
	<section class="grid grid-cols-1 gap-5 {features.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}" aria-label="System actions">
		{#each features as feature (feature.href)}
			{@const Icon = feature.icon}
			<a href={feature.href} class="group block h-full focus:outline-none">
				<div class="flex h-full flex-col justify-between rounded-xl border border-border bg-card p-6 transition-colors duration-150 hover:border-foreground/30">
					<div>
						<div class="mb-5 flex items-center justify-between">
							<div class="grid size-10 place-items-center rounded-lg border border-border bg-muted/40 text-foreground">
								<Icon class="size-5" strokeWidth={1.5} />
							</div>
							<span class="font-mono text-[11px] text-muted-foreground">
								{feature.badge}
							</span>
						</div>

						<h2 class="text-base font-semibold text-foreground">
							{feature.title}
						</h2>

						<p class="mt-2 text-xs leading-relaxed text-muted-foreground">
							{feature.body}
						</p>
					</div>

					<div class="mt-6 flex items-center justify-between border-t border-border/60 pt-4 text-xs">
						<span class="font-medium text-foreground transition-colors group-hover:text-primary">
							{feature.action}
						</span>
						<ArrowUpRight class="size-4 text-muted-foreground transition-colors group-hover:text-primary" strokeWidth={1.5} />
					</div>
				</div>
			</a>
		{/each}
	</section>
</div>
