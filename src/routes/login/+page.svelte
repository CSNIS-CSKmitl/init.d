<script lang="ts">
	import { LogIn, AlertCircle, User, Lock, KeyRound } from "@lucide/svelte";
	import { pbBrowser } from "$lib/pb/client";
	import type { ActionData } from "./$types";

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
		<p class="font-mono text-xs uppercase tracking-[0.2em] text-accent">
			// sign in
		</p>
		<h1 class="mt-2 text-2xl font-semibold tracking-tight">Access LEASE</h1>
		<p class="mt-2 text-sm text-secondary-app">
			Authenticate with the operator directory username. The email on the
			lease request is pulled from the session — you cannot change it
			here.
		</p>
	</header>

	<button
		type="button"
		onclick={signInWithOidc}
		disabled={oauthLoading}
		class="mb-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-app bg-surface px-5 font-mono text-xs uppercase tracking-widest text-app transition-colors duration-300 hover:border-strong-app disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
	>
		<svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
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
		{oauthLoading ? "Signing in…" : "Continue with GOOGLE"}
	</button>

	<div class="my-4 flex items-center gap-3 text-muted-app">
		<div class="h-px flex-1 bg-app"></div>
		<span class="font-mono text-[10px] uppercase tracking-widest">or</span>
		<div class="h-px flex-1 bg-app"></div>
	</div>

	<form
		method="POST"
		class="space-y-4 rounded-lg border border-app bg-surface p-6"
	>
		<label class="block">
			<span
				class="mb-1 block font-mono text-[11px] uppercase tracking-widest text-muted-app"
			>
				Username or email
			</span>
			<div class="relative">
				<User
					class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-app"
				/>
				<input
					type="text"
					name="identity"
					autocomplete="username"
					required
					value={form?.username ?? ""}
					class="w-full pl-8 font-mono-app"
					placeholder="e.g. log  or  someone@kmitl.ac.th"
				/>
			</div>
		</label>

		<label class="block">
			<span
				class="mb-1 block font-mono text-[11px] uppercase tracking-widest text-muted-app"
			>
				Password
			</span>
			<div class="relative">
				<Lock
					class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-app"
				/>
				<input
					type="password"
					name="password"
					autocomplete="current-password"
					required
					class="w-full pl-8 font-mono-app"
				/>
			</div>
		</label>

		{#if form?.error}
			<p
				class="flex items-start gap-2 rounded-md border border-app bg-elevated p-3 text-sm"
				style="color: var(--danger)"
			>
				<AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
				<span>{form.error}</span>
			</p>
		{/if}

		{#if oauthError}
			<p
				class="flex items-start gap-2 rounded-md border border-app bg-elevated p-3 text-sm"
				style="color: var(--danger)"
			>
				<AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
				<span>{oauthError}</span>
			</p>
		{/if}

		<button
			type="submit"
			class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-5 font-mono text-xs uppercase tracking-widest text-app transition-colors duration-300 hover:bg-accent-soft hover:text-accent"
		>
			<LogIn class="h-4 w-4" />
			Sign in
		</button>
	</form>
	<p class="text-center text-xs text-zinc-500">
		พบปัญหา ติดต่อ 66050160@kmitl.ac.th หรือ bornzi
	</p>
</div>
