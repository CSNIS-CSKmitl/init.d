<script lang="ts">
	import { LogIn, AlertCircle, User, Lock, KeyRound } from '@lucide/svelte';
	import { pbBrowser } from '$lib/pb/client';
	import type { ActionData } from './$types';

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
			const result = await pb.collection('users').authWithOAuth2({ provider: 'oidc' });

			const res = await fetch('/auth/oidc', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					token: result.token,
					record: result.record,
					meta: (result as any).meta
				})
			});
			if (!res.ok) throw new Error('failed to persist session');
			// Hard reload so every layout/page load re-runs on the
			// server with the freshly-set `pb_auth` cookie (and the
			// just-assigned `user_type`) — `goto()` keeps the client
			// router state and can miss the new auth.
			window.location.assign('/');
		} catch (e: unknown) {
			oauthError =
				(e as { message?: string })?.message ??
				'KMITL IAM sign-in failed. Please try again.';
		} finally {
			oauthLoading = false;
		}
	}
</script>

<div class="mx-auto max-w-md">
	<header class="mb-8">
		<p class="font-mono text-xs uppercase tracking-[0.2em] text-accent">// sign in</p>
		<h1 class="mt-2 text-2xl font-semibold tracking-tight">Access LEASE</h1>
		<p class="mt-2 text-sm text-secondary-app">
			Authenticate with the operator directory username. The email on the lease request is
			pulled from the session — you cannot change it here.
		</p>
	</header>

	<button
		type="button"
		onclick={signInWithOidc}
		disabled={oauthLoading}
		class="mb-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-app bg-surface px-5 font-mono text-xs uppercase tracking-widest text-app transition-colors duration-300 hover:border-strong-app disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
	>
		<KeyRound class="h-4 w-4 text-accent" />
		{oauthLoading ? 'Signing in…' : 'Continue with IAM KMITL'}
	</button>

	<div class="my-4 flex items-center gap-3 text-muted-app">
		<div class="h-px flex-1 bg-app"></div>
		<span class="font-mono text-[10px] uppercase tracking-widest">or</span>
		<div class="h-px flex-1 bg-app"></div>
	</div>

	<form method="POST" class="space-y-4 rounded-lg border border-app bg-surface p-6">
		<label class="block">
			<span class="mb-1 block font-mono text-[11px] uppercase tracking-widest text-muted-app">
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
					value={form?.username ?? ''}
					class="w-full pl-8 font-mono-app"
					placeholder="e.g. log  or  someone@kmitl.ac.th"
				/>
			</div>
		</label>

		<label class="block">
			<span class="mb-1 block font-mono text-[11px] uppercase tracking-widest text-muted-app">
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
	<p class="text-center text-xs text-zinc-500">พบปัญหา ติดต่อ 66050160@kmitl.ac.th หรือ bornzi</p>
</div>
