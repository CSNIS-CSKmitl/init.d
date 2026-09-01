<script lang="ts">
	import {
		FilePlus2,
		Activity,
		ShieldCheck,
		Server,
		ArrowRight,
	} from "@lucide/svelte";
	import { page } from "$app/state";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";

	const user = $derived(page.data.user);
	const isAdmin = $derived(user?.role === "admin");

	const features = $derived([
		{
			href: "/request",
			icon: FilePlus2,
			title: "Request Provisioning",
			body: "Submit requests for new virtual machines or container instances with custom compute, storage, and networking configurations.",
		},
		{
			href: "/status",
			icon: Activity,
			title: "Instance Status",
			body: "Track active provisioning status, lease queue placement, and retrieve access credentials for your active instances.",
		},
		...(isAdmin
			? [
					{
						href: "/admin",
						icon: ShieldCheck,
						title: "Admin Dashboard",
						body: "Manage pending leases, review system resource allocations, issue replies, and oversee active system queue.",
					},
				]
			: []),
	]);
</script>

<section class="mx-auto max-w-2xl py-12 text-center sm:py-20">
	<h1
		class="mt-4 bg-linear-to-r from-foreground to-primary/60 bg-clip-text pb-1 text-4xl leading-tight font-bold tracking-tight text-transparent sm:text-5xl"
	>
		Infrastructure Provisioning
	</h1>

	{#if !user}
		<Button href="/login" size="lg" class="mt-8">
			<Server data-icon="inline-start" />
			Sign in to start
			<ArrowRight data-icon="inline-end" />
		</Button>
	{/if}
</section>

<!-- Features Grid -->
<section
	class="mt-4 grid grid-cols-1 gap-6 {features.length === 3
		? 'md:grid-cols-3'
		: 'md:grid-cols-2'}"
>
	{#each features as feature (feature.href)}
		{@const Icon = feature.icon}
		<a href={feature.href} class="group block">
			<Card.Root
				class="h-full justify-between transition-all duration-300 hover:-translate-y-1 hover:ring-primary/40"
			>
				<Card.Header>
					<div
						class="inline-flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground"
					>
						<Icon class="size-6" />
					</div>
					<Card.Title
						class="mt-4 font-mono text-xs font-semibold uppercase tracking-wider transition-colors duration-300 group-hover:text-primary"
					>
						{feature.title}
					</Card.Title>
					<Card.Description class="leading-relaxed">
						{feature.body}
					</Card.Description>
				</Card.Header>
				<Card.Footer>
					<div
						class="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary opacity-80 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100"
					>
						<span>Access Dashboard</span>
						<ArrowRight class="size-3.5" />
					</div>
				</Card.Footer>
			</Card.Root>
		</a>
	{/each}
</section>
