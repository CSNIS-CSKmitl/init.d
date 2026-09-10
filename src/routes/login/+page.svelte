<script lang="ts">
	import { LogIn, AlertCircle, User, Lock } from "@lucide/svelte";
	import { pbBrowser } from "$lib/pb/client";
	import type { ActionData } from "./$types";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import * as Field from "$lib/components/ui/field";
	import * as Alert from "$lib/components/ui/alert";
	import { Separator } from "$lib/components/ui/separator";
	import { Spinner } from "$lib/components/ui/spinner";

	let { form }: { form: ActionData } = $props();

	let oauthLoading = $state(false);
	let oauthError = $state<string | null>(null);

	async function signInWithOidc() {
		oauthLoading = true;
		oauthError = null;
		try {
			const pb = pbBrowser();
			// Triggers the full client-side OAuth dance: opens the
			// provider, completes the round-trip, and returns the
			// freshly-authenticated record. PB auto-creates the user
			// record on first login.
			const result = await pb
				.collection("users")
				.authWithOAuth2({ provider: "oidc" });

			const res = await fetch("/auth/oidc", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token: result.token,
					record: result.record,
					meta: (result as any).meta,
				}),
			});
			if (!res.ok) throw new Error("failed to persist session");
			// Hard reload so every layout/page load re-runs on the
			// server with the freshly-set `pb_auth` cookie (and the
			// just-assigned `user_type`) — `goto()` keeps the client
			// router state and can miss the new auth.
			window.location.assign("/");
		} catch (e: unknown) {
			oauthError =
				(e as { message?: string })?.message ??
				"KMITL IAM sign-in failed. Please try again.";
		} finally {
			oauthLoading = false;
		}
	}
</script>

<div class="mx-auto max-w-md">
	<header class="mb-8">
		<p class="font-mono text-xs uppercase tracking-[0.2em] text-primary">
			// sign in
		</p>
		<h1 class="mt-2 text-2xl font-semibold tracking-tight">Access LEASE</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			Authenticate with the operator directory username. The email on the
			lease request is pulled from the session — you cannot change it
			here.
		</p>
	</header>

	<Button
		type="button"
		onclick={signInWithOidc}
		disabled={oauthLoading}
		variant="outline"
		size="lg"
		class="mb-3 w-full font-mono text-xs uppercase tracking-widest"
	>
		{#if oauthLoading}
			<Spinner data-icon="inline-start" />
		{:else}
			<svg class="size-4" viewBox="0 0 24 24" aria-hidden="true">
				<path
					fill="#4285F4"
					d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
				/>
				<path
					fill="#34A853"
					d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
				/>
				<path
					fill="#FBBC05"
					d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.83Z"
				/>
				<path
					fill="#EA4335"
					d="M12 4.75c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 1.55 14.97.5 12 .5A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 6.66 9.14 4.75 12 4.75Z"
				/>
			</svg>
		{/if}
		{oauthLoading ? "Signing in…" : "Continue with GOOGLE"}
	</Button>

	<div class="my-4 flex items-center gap-3">
		<Separator class="flex-1" />
		<span
			class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
			>or</span
		>
		<Separator class="flex-1" />
	</div>

	<form method="POST" class="rounded-lg border border-border bg-card p-6">
		<Field.FieldGroup>
			<Field.Field>
				<Field.FieldLabel for="identity" class="text-[11px] uppercase tracking-widest text-muted-foreground">
					Username or email
				</Field.FieldLabel>
				<div class="relative">
					<User
						class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						id="identity"
						type="text"
						name="identity"
						autocomplete="username"
						required
						value={form?.username ?? ""}
						class="pl-8 font-mono"
						placeholder="e.g. log  or  someone@kmitl.ac.th"
					/>
				</div>
			</Field.Field>

			<Field.Field>
				<Field.FieldLabel for="password" class="text-[11px] uppercase tracking-widest text-muted-foreground">
					Password
				</Field.FieldLabel>
				<div class="relative">
					<Lock
						class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						id="password"
						type="password"
						name="password"
						autocomplete="current-password"
						required
						class="pl-8"
					/>
				</div>
			</Field.Field>

			{#if form?.error}
				<Alert.Root variant="destructive">
					<AlertCircle />
					<Alert.Description>{form.error}</Alert.Description>
				</Alert.Root>
			{/if}

			{#if oauthError}
				<Alert.Root variant="destructive">
					<AlertCircle />
					<Alert.Description>{oauthError}</Alert.Description>
				</Alert.Root>
			{/if}

			<Button type="submit" size="lg" class="w-full font-mono text-xs uppercase tracking-widest">
				<LogIn data-icon="inline-start" />
				Sign in
			</Button>
		</Field.FieldGroup>
	</form>
	<p class="mt-4 text-center text-xs text-muted-foreground">
		พบปัญหาติดต่อที่ Discord Support Server
	</p>
</div>
