<script lang="ts">
	import QRCode from "qrcode";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Button } from "$lib/components/ui/button";
	import { Check, Copy, ExternalLink, MessageSquare } from "@lucide/svelte";

	let {
		open = $bindable(false),
		discordUrl = "https://discord.gg/y8RdYEStQk",
		onClose,
	}: {
		open?: boolean;
		discordUrl?: string;
		onClose?: () => void;
	} = $props();

	let qrSvg = $state<string>("");
	let copied = $state<boolean>(false);

	$effect(() => {
		const targetUrl = discordUrl || "https://discord.gg/y8RdYEStQk";
		QRCode.toString(targetUrl, {
			type: "svg",
			margin: 2,
			color: {
				dark: "#09090b",
				light: "#ffffff",
			},
		})
			.then((svg) => {
				qrSvg = svg;
			})
			.catch((err) => {
				console.error("[DiscordQrModal] Failed to generate QR code locally:", err);
			});
	});

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(discordUrl);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			/* fallback */
		}
	}

	function handleOpenChange(val: boolean) {
		open = val;
		if (!val) onClose?.();
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Content class="max-w-md bg-background border-border p-6 shadow-2xl rounded-2xl">
		<Dialog.Header class="space-y-2 text-center sm:text-center">
			<div class="mx-auto flex size-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500 ring-1 ring-indigo-500/20">
				<MessageSquare class="size-6" />
			</div>
			<Dialog.Title class="text-xl font-bold tracking-tight text-foreground">
				Request Submitted!
			</Dialog.Title>
			<Dialog.Description class="text-sm text-muted-foreground leading-relaxed">
				คำขอถูกบันทึกเรียบร้อยแล้ว เข้าร่วม <span class="font-semibold text-foreground">CS KMITL Discord</span> เพื่อติดตามสถานะและรับการแจ้งเตือนจากแอดมิน
			</Dialog.Description>
		</Dialog.Header>

		<div class="my-4 flex flex-col items-center gap-4">
			<!-- Offline Generated QR Code Container -->
			<div class="relative flex items-center justify-center rounded-2xl border border-border bg-white p-4 shadow-inner">
				{#if qrSvg}
					<div class="size-48 overflow-hidden rounded-lg">
						{@html qrSvg}
					</div>
				{:else}
					<div class="flex size-48 items-center justify-center font-mono text-xs text-muted-foreground">
						Loading QR Code...
					</div>
				{/if}
			</div>

			<!-- Discord Direct URL display & Copy Button -->
			<div class="flex w-full items-center gap-2 rounded-xl border border-border bg-muted/50 p-2 pl-3">
				<span class="truncate font-mono text-xs text-foreground/80 flex-1">
					{discordUrl}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={copyLink}
					class="h-8 px-2.5 font-mono text-xs"
				>
					{#if copied}
						<Check class="size-3.5 text-emerald-500 mr-1" />
						<span class="text-emerald-500 font-bold">Copied</span>
					{:else}
						<Copy class="size-3.5 text-muted-foreground mr-1" />
						<span>Copy</span>
					{/if}
				</Button>
			</div>
		</div>

		<Dialog.Footer class="flex flex-col sm:flex-row gap-2">
			<Button
				href={discordUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium shadow-md transition-all"
			>
				<ExternalLink class="size-4 mr-2" />
				Open Discord Invite
			</Button>
			<Button
				type="button"
				variant="outline"
				onclick={() => handleOpenChange(false)}
				class="w-full sm:w-auto font-mono text-xs"
			>
				Done
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
