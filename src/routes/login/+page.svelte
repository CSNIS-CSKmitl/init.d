<script lang="ts">
	import { LogIn, AlertCircle, User, Lock, KeyRound } from "@lucide/svelte";
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
		let pb: ReturnType<typeof pbBrowser> | null = null;
		try {
			pb = pbBrowser();
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
				}),
			});
			if (!res.ok) {
				const result = await res.json().catch(() => null);
				throw new Error(result?.error || "KMITL IAM sign-in failed.");
			}
			// Hard reload so every layout/page load re-runs on the
			// server with the freshly-set `pb_auth` cookie — `goto()` keeps the client
			// router state and can miss the new auth.
			window.location.assign("/");
		} catch (e: unknown) {
			pb?.authStore.clear();
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
			นักศึกษาวิทยาการคอมพิวเตอร์เข้าใช้ผ่าน KMITL IAM ได้ หรือใช้บัญชีเว็บที่ได้รับสิทธิ์
			อีเมลในคำขอจะอ้างอิงจากบัญชีที่เข้าสู่ระบบ
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
			<KeyRound class="size-4" aria-hidden="true" />
		{/if}
		{oauthLoading ? "Signing in…" : "Continue with KMITL IAM"}
	</Button>
	<p class="mb-3 text-center text-xs text-muted-foreground">สำหรับนักศึกษาสาขาวิทยาการคอมพิวเตอร์</p>

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
