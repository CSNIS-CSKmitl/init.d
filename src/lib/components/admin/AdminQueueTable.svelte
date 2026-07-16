<script lang="ts">
	import type { LeaseInstance } from "$lib/types";
	import { passionGroupName, creatorEmail } from "$lib/types";
	import { enhance } from "$app/forms";
	import SshTerminal from "$lib/components/status/SshTerminal.svelte";
	import ProxmoxTerminal from "$lib/components/status/ProxmoxTerminal.svelte";
	import { Terminal, X, RefreshCw, MessageSquareText, Settings2, Cpu, Network, MemoryStick, HardDrive, Calendar } from "@lucide/svelte";

	let consoleTarget = $state<LeaseInstance | null>(null);
	let consoleWsUrl = $state<string | null>(null);
	let consoleTicket = $state<string | null>(null);
	let consoleUser = $state<string | null>(null);
	let consoleLoading = $state<boolean>(false);
	let consoleError = $state<string | null>(null);
	let terminalType = $state<"console" | "ssh" | null>(null);

	async function openConsole(item: LeaseInstance) {
		terminalType = "console";
		consoleTarget = item;
		consoleWsUrl = null;
		consoleTicket = null;
		consoleLoading = true;
		consoleError = null;

		try {
			const res = await fetch("/api/console", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ instanceId: item.id }),
			});

			const data = await res.json();
			if (!res.ok) {
				throw new Error(
					data.error || "Failed to fetch console ticket.",
				);
			}
			if (!data.success || !data.wsUrl) {
				throw new Error(
					data.error || "Invalid ticket response from server.",
				);
			}
			consoleWsUrl = data.wsUrl;
			consoleTicket = data.ticket;
			consoleUser = data.user;
		} catch (err: any) {
			consoleError = err.message || "An unexpected error occurred.";
		} finally {
			consoleLoading = false;
		}
	}

	function closeConsole() {
		consoleTarget = null;
		consoleWsUrl = null;
		consoleTicket = null;
		consoleUser = null;
		consoleLoading = false;
		consoleError = null;
		terminalType = null;
	}

	function openSsh(item: LeaseInstance) {
		consoleTarget = item;
		terminalType = "ssh";
	}

	type Props = {
		items: LeaseInstance[];
		form: { error?: string; id?: string; recordId?: string } | null;
		provisioning?: boolean;
		progressMap?: Record<string, { status: string; error?: string }>;
	};

	let {
		items = [],
		form,
		provisioning = false,
		progressMap = {},
	}: Props = $props();

	// Per-row reply editor state
	let replyOpen = $state<string | null>(null);
	let replyDraft = $state<string>("");
	let resolveOpen = $state<string | null>(null);
	let resolveMode = $state<"manual" | "auto">("manual");
	let resolveVmid = $state("");
	let resolveNode = $state("");
	let resolveStorage = $state("local-lvm");
	let editOpen = $state<string | null>(null);
	let editCpu = $state("");
	let editRam = $state("");
	let editDisk = $state("");
	let editPorts = $state("");
	let editVmid = $state("");
	let editNode = $state("");
	let provisionOpen = $state<string | null>(null);
	let provisionNode = $state("pve3");
	let provisionNetwork = $state("vmbr1");
	let provisionId = $state("");

	function openReply(item: LeaseInstance) {
		replyDraft = item.admin_reply ?? "";
		replyOpen = item.id;
	}
	function cancelReply() {
		replyOpen = null;
		replyDraft = "";
	}

	function openResolve(item: LeaseInstance) {
		resolveOpen = item.id;
		resolveMode = "manual";
		resolveVmid = item.vmid != null ? String(item.vmid) : "";
		resolveNode = item.node != null ? String(item.node) : "";
		resolveStorage = "local-lvm";
	}

	function cancelResolve() {
		resolveOpen = null;
		resolveMode = "manual";
		resolveVmid = "";
		resolveNode = "";
		resolveStorage = "local-lvm";
	}

	function openEdit(item: LeaseInstance) {
		editCpu = String(item.specs.cpu);
		editRam = String(item.specs.ram);
		editDisk = String(item.specs.disk);
		editPorts = item.ports ?? "";
		editVmid = item.vmid != null ? String(item.vmid) : "";
		editNode = item.node != null ? String(item.node) : "";
		editOpen = item.id;
	}

	function cancelEdit() {
		editOpen = null;
		editCpu = "";
		editRam = "";
		editDisk = "";
		editPorts = "";
		editVmid = "";
		editNode = "";
	}

	function openProvision(item: LeaseInstance) {
		provisionOpen = item.id;
		provisionNode = "pve3";
		provisionNetwork = "vmbr1";
		provisionId = "";
	}

	function cancelProvision() {
		provisionOpen = null;
		provisionNode = "pve3";
		provisionNetwork = "vmbr1";
		provisionId = "";
	}

	const portsFor = (s: string | undefined) =>
		(s ?? "")
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean);

	// Thai short month names with the Christian year (e.g. "23 มิ.ย. 2026")
	const TH_MONTHS = [
		"ม.ค.",
		"ก.พ.",
		"มี.ค.",
		"เม.ย.",
		"พ.ค.",
		"มิ.ย.",
		"ก.ค.",
		"ส.ค.",
		"ก.ย.",
		"ต.ค.",
		"พ.ย.",
		"ธ.ค.",
	];
	const fmt = (iso: string) => {
		const d = new Date(iso);
		return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
	};
</script>

{#if items.length === 0}
	<div
		class="rounded-xl border border-dashed border-app bg-surface p-12 text-center"
	>
		<p
			class="font-mono-app text-xs uppercase tracking-widest text-muted-app"
		>
			Queue is empty
		</p>
	</div>
{:else}
	<div
		class="overflow-x-auto rounded-xl border border-app bg-surface shadow-2xl"
	>
		<table class="w-full min-w-190 border-collapse text-left text-sm">
			<thead>
				<tr
					class="border-b border-app bg-elevated font-mono-app text-xs uppercase tracking-wider text-muted-app"
				>
					<th class="p-5 font-bold">// Instance Specs & Details</th>
					<th class="p-5 font-bold">// Group / Requester</th>
					<th class="p-5 font-bold">// Network & Firewall (Ports)</th>
					<th class="p-5 text-right font-bold">// Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					{@const isFailed = progressMap[item.id]?.status === "Failed"}
					{@const isProvisioning = progressMap[item.id] && progressMap[item.id].status !== "Complete" && !isFailed}
					{@const isPending = item.status === "pending" && !isFailed && !isProvisioning}
					{@const isCompleted = item.status === "completed" || progressMap[item.id]?.status === "Complete"}
					{@const isEditing = replyOpen === item.id}
					{@const isResolving = resolveOpen === item.id}
					{@const isFieldEditing = editOpen === item.id}
					<tr
						class="border-b border-app/60 align-top transition-colors last:border-0 {
							isFailed ? 'bg-red-500/[0.03] hover:bg-red-500/[0.08] text-app' :
							isProvisioning ? 'bg-cyan-500/[0.03] hover:bg-cyan-500/[0.08] text-app' :
							isPending ? 'bg-amber-500/[0.03] hover:bg-amber-500/[0.08] text-app' :
							'bg-emerald-500/[0.01] hover:bg-elevated/30 text-secondary-app'
						}"
					>
						<!-- Specs column -->
						<td class="space-y-3 p-5 border-l-4 {
							isFailed ? 'border-red-500/80' :
							isProvisioning ? 'border-cyan-500/80' :
							isPending ? 'border-amber-500/80' :
							'border-emerald-500/80'
						}">
							<div class="flex flex-wrap items-center gap-2">
								<span
									class="font-mono-app text-sm font-semibold {
										isFailed ? 'text-red-400' :
										isProvisioning ? 'text-cyan-400' :
										isPending ? 'text-amber-400' :
										'text-app'
									}"
								>
									{item.hostname}
								</span>
							</div>

							<!-- Status Badges & VM/CT Badges -->
							<div class="flex flex-wrap items-center gap-1.5">
								{#if isFailed}
									<span class="inline-flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400 border border-red-500/20">
										<span class="h-1.5 w-1.5 rounded-full bg-red-500"></span>
										Failed
									</span>
								{:else if isProvisioning}
									<span class="inline-flex items-center gap-1 rounded bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-400 border border-cyan-500/20">
										<span class="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
										Provisioning
									</span>
								{:else if isPending}
									<span class="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/20">
										<span class="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
										In Queue
									</span>
								{:else}
									<span class="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 border border-emerald-500/20">
										<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
										Completed
									</span>
								{/if}

								<span
									class="rounded border border-app bg-elevated px-1.5 py-0.5 font-mono-app text-[10px] uppercase font-bold text-secondary-app"
								>
									{item.type === "vm" ? "VM" : "CT"}
								</span>
								<span
									class="rounded border border-accent/20 bg-accent-soft/30 px-1.5 py-0.5 font-mono-app text-[10px] font-bold text-accent"
								>
									x{item.quantity}
								</span>
							</div>

							<!-- OS Template & Specs capsules -->
							<div class="space-y-1.5">
								<div class="font-mono-app text-xs text-secondary-app max-w-sm truncate">
									{item.os_template}
								</div>
								<div class="flex flex-wrap items-center gap-1.5 font-mono-app text-[10px]">
									<span class="inline-flex items-center gap-1 rounded bg-elevated px-1.5 py-0.5 border border-app text-muted-app font-bold">
										<Cpu class="h-3 w-3 text-accent" />
										<span>{item.specs.cpu}C</span>
									</span>
									<span class="inline-flex items-center gap-1 rounded bg-elevated px-1.5 py-0.5 border border-app text-muted-app font-bold">
										<MemoryStick class="h-3 w-3 text-accent" />
										<span>{item.specs.ram}GB</span>
									</span>
									<span class="inline-flex items-center gap-1 rounded bg-elevated px-1.5 py-0.5 border border-app text-muted-app font-bold">
										<HardDrive class="h-3 w-3 text-accent" />
										<span>{item.specs.disk}GB</span>
									</span>
								</div>
							</div>

							{#if progressMap[item.id]}
								<div
									class="max-w-xs rounded-lg border border-accent bg-accent-soft p-3 font-mono-app text-xs text-accent"
								>
									<div class="flex items-center gap-2">
										<span class="relative flex h-2 w-2">
											{#if progressMap[item.id].status !== "Complete" && progressMap[item.id].status !== "Failed"}
												<span
													class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"
												></span>
											{/if}
											<span
												class="relative inline-flex rounded-full h-2 w-2 bg-accent"
											></span>
										</span>
										<span
											class="font-bold uppercase tracking-wider text-[10px] text-accent"
											>Provisioning Status:</span
										>
									</div>
									<div class="mt-1 text-app font-medium">
										{progressMap[item.id].status}
									</div>
									{#if progressMap[item.id].error}
										<div
											class="mt-1.5 text-xs text-red-500 font-bold leading-normal"
										>
											Error: {progressMap[item.id].error}
										</div>
									{/if}
								</div>
							{:else}
								{#if item.status === "completed" && item.vmid}
									<div
										class="max-w-xs rounded-lg border border-app bg-elevated p-2.5 font-mono-app text-xs text-secondary-app"
									>
										<div class="flex items-center gap-2">
											<span
												class="inline-flex rounded-full h-2 w-2 bg-accent/60"
											></span>
											<span
												class="font-bold uppercase tracking-wider text-[10px] text-muted-app"
												>Provisioning Status:</span
											>
										</div>
										<div class="mt-1 text-app font-medium">
											Complete (Node: pve{item.node || ""}, VMID: {item.vmid})
										</div>
									</div>
								{/if}
							{/if}

							<div class="max-w-xs text-left">
								<div class="font-mono-app text-[9px] font-bold uppercase text-muted-app">
									// PURPOSE / NOTES:
								</div>
								<div class="mt-0.5 font-mono-app text-xs leading-normal text-secondary-app">
									{item.purpose_notes}
								</div>
							</div>
						</td>

						<!-- Group / Requester column -->
						<td class="space-y-3 p-5">
							<div>
								<div
									class="text-sm font-bold text-app"
								>
									{passionGroupName(item)}
								</div>
								<div
									class="font-mono-app text-xs text-muted-app mt-0.5"
								>
									{creatorEmail(item)}
								</div>

								{#if provisioning}
									{#if provisionOpen === item.id}
										<form
											method="POST"
											action="?/create"
											use:enhance={() => {
												return async ({ update }) => {
													await update();
													provisionOpen = null;
												};
											}}
											class="mt-2 space-y-2 rounded border border-app bg-elevated p-2 text-left"
										>
											<input
												type="hidden"
												name="recordId"
												value={item.id}
											/>
											<div
												class="grid gap-2 sm:grid-cols-3"
											>
												<label class="space-y-1">
													<span
														class="font-mono-app text-[10px] uppercase tracking-wider text-muted-app"
														>node</span
													>
													<input
														name="node"
														bind:value={
															provisionNode
														}
														required
														class="w-full rounded border border-app bg-surface px-2 py-1 font-mono-app text-xs text-app focus:border-accent focus:outline-none"
														placeholder="pve3"
													/>
												</label>
												<label class="space-y-1">
													<span
														class="font-mono-app text-[10px] uppercase tracking-wider text-muted-app"
														>network</span
													>
													<input
														name="network"
														bind:value={
															provisionNetwork
														}
														required
														class="w-full rounded border border-app bg-surface px-2 py-1 font-mono-app text-xs text-app focus:border-accent focus:outline-none"
														placeholder="vmbr1"
													/>
												</label>
												<label class="space-y-1">
													<span
														class="font-mono-app text-[10px] uppercase tracking-wider text-muted-app"
														>id</span
													>
													<input
														name="id"
														type="number"
														min="1"
														bind:value={provisionId}
														required
														class="w-full rounded border border-app bg-surface px-2 py-1 font-mono-app text-xs text-app focus:border-accent focus:outline-none"
														placeholder="101"
													/>
												</label>
											</div>
											<div
												class="flex justify-end gap-1.5"
											>
												<button
													type="button"
													onclick={cancelProvision}
													class="rounded border border-app bg-surface px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition hover:bg-elevated hover:text-app"
												>
													Cancel
												</button>
												<button
													type="submit"
													class="rounded bg-accent px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-zinc-950 shadow-sm transition hover:opacity-90"
												>
													Create
												</button>
											</div>
										</form>
									{:else}
										<button
											type="button"
											onclick={() => openProvision(item)}
											class="mt-2 rounded border border-app bg-surface px-2.5 py-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition hover:bg-elevated hover:text-app cursor-pointer"
										>
											Resolve
										</button>
									{/if}
								{/if}
							</div>
							
							<div class="space-y-1 font-mono-app text-[11px] border-t border-app/40 pt-2 text-muted-app">
								<div class="flex items-center gap-1.5">
									<Calendar class="h-3 w-3 text-muted-app" />
									<span>FROM:</span>
									<span class="text-secondary-app font-bold">{fmt(item.start_date)}</span>
								</div>
								<div class="flex items-center gap-1.5">
									<Calendar class="h-3 w-3 text-muted-app" />
									<span>EXP:</span>
									<span class="text-muted-app font-bold">{fmt(item.end_date)}</span>
								</div>
							</div>
						</td>

						<!-- Network & Firewall column -->
						<td class="space-y-3 p-5 font-mono-app text-xs">
							<div>
								<span class="font-mono text-[9px] uppercase tracking-wider text-muted-app">Zone</span>
								<div class="mt-0.5">
									{#if item.network_type === 'local'}
										<span class="rounded bg-elevated border border-app px-2 py-0.5 font-bold text-secondary-app text-[10px]">LOCAL</span>
									{:else}
										<span class="rounded bg-accent-soft border border-accent/20 px-2 py-0.5 font-bold text-accent text-[10px]">PUBLIC</span>
									{/if}
								</div>
							</div>

							{#if item.dns_name}
								<div>
									<span class="font-mono text-[9px] uppercase tracking-wider text-muted-app">DNS Routing</span>
									<div class="mt-0.5 font-bold text-secondary-app underline max-w-[180px] truncate">
										{item.dns_name}
									</div>
								</div>
							{/if}

							<div>
								<span class="font-mono text-[9px] uppercase tracking-wider text-muted-app">Custom Ports</span>
								<div class="mt-1 flex flex-wrap gap-1">
									{#if portsFor(item.ports).length > 0}
										{#each portsFor(item.ports) as port}
											<span class="rounded border border-app bg-elevated px-1.5 py-0.5 font-bold text-accent">
												{port}
											</span>
										{/each}
									{:else}
										<span class="text-muted-app italic">None (Default Only)</span>
									{/if}
								</div>
							</div>
						</td>

						<!-- Action column -->
						<td class="space-y-3 p-5 text-right">
							<div class="text-left">
								<div class="mb-2 flex flex-wrap gap-1.5">
									{#if !isFieldEditing}
										<button
											type="button"
											onclick={() => openEdit(item)}
											class="inline-flex items-center gap-1 rounded border border-app bg-surface px-2 py-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition duration-200 hover:bg-elevated hover:text-accent cursor-pointer"
										>
											<Settings2 class="h-3 w-3" />
											Edit Fields
										</button>
									{:else}
										<button
											type="button"
											onclick={cancelEdit}
											class="inline-flex items-center gap-1 rounded border border-accent bg-accent/5 px-2 py-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-accent transition duration-200 cursor-pointer"
										>
											<X class="h-3 w-3" />
											Close Fields
										</button>
									{/if}
								</div>
								{#if !isEditing && item.admin_reply}
									<div
										class="rounded-lg border border-accent/20 bg-accent/5 p-3.5 shadow-sm space-y-2 text-left"
									>
										<div class="flex items-center justify-between">
											<div class="flex items-center gap-1.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-accent">
												<MessageSquareText class="h-3.5 w-3.5" />
												<span>Reply_Sent</span>
											</div>
											{#if item.admin_reply_at}
												<span class="font-mono-app text-[10px] text-muted-app">
													{fmt(item.admin_reply_at)}
												</span>
											{/if}
										</div>
										<p class="whitespace-pre-wrap font-mono-app text-xs leading-relaxed text-secondary-app">
											{item.admin_reply}
										</p>
									</div>
									<div class="mt-2 flex justify-end gap-2">
										<button
											type="button"
											onclick={() => openReply(item)}
											class="inline-flex items-center gap-1 rounded-md border border-app bg-surface px-2.5 py-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition duration-200 hover:bg-elevated hover:text-app cursor-pointer"
										>
											Edit
										</button>
										<form
											method="POST"
											action="?/reply"
											class="inline"
										>
											<input
												type="hidden"
												name="id"
												value={item.id}
											/>
											<input
												type="hidden"
												name="clear"
												value="1"
											/>
											<button
												type="submit"
												class="inline-flex items-center gap-1 rounded-md border border-red-500/20 bg-surface px-2.5 py-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-red-400 transition duration-200 hover:bg-red-500/5 hover:border-red-500/30 cursor-pointer"
											>
												Clear
											</button>
										</form>
									</div>
								{:else if isEditing}
									<form
										method="POST"
										action="?/reply"
										class="space-y-2.5 rounded-lg border border-app bg-surface/50 p-3 text-left"
									>
										<input
											type="hidden"
											name="id"
											value={item.id}
										/>
										<div class="flex items-center gap-1.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-muted-app">
											<MessageSquareText class="h-3.5 w-3.5" />
											<span>Draft_Reply</span>
										</div>
										<textarea
											name="reply"
											bind:value={replyDraft}
											rows="3"
											maxlength="4096"
											placeholder="พิมพ์ข้อความถึงผู้ขอ เช่น กำลังเตรียม VM อยู่ คาดว่าพร้อมใช้ภายใน 1 ชม."
											class="w-full rounded-md border border-app bg-elevated p-2.5 font-mono-app text-xs text-app placeholder:text-muted-app focus:border-accent/40 focus:ring-1 focus:ring-accent focus:outline-none transition-all duration-200"
										></textarea>
										<div class="flex justify-end gap-1.5">
											<button
												type="button"
												onclick={cancelReply}
												class="rounded border border-app bg-surface px-2.5 py-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition duration-200 hover:bg-elevated hover:text-app cursor-pointer"
											>
												Cancel
											</button>
											<button
												type="submit"
												disabled={replyDraft.trim().length === 0}
												class="rounded bg-accent px-3 py-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-zinc-950 shadow-md transition duration-200 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
											>
												{item.admin_reply ? "Update" : "Send"}
											</button>
										</div>
									</form>
								{:else}
									<button
										type="button"
										onclick={() => openReply(item)}
										class="inline-flex items-center gap-1 rounded border border-app bg-surface px-3 py-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition duration-200 hover:bg-elevated hover:text-accent cursor-pointer"
									>
										<MessageSquareText class="h-3 w-3" />
										Reply
									</button>
								{/if}
							</div>

							{#if isPending}
								{#if isResolving}
									<form
										method="POST"
										action="?/resolve"
										use:enhance={() => {
											return async ({ update }) => {
												await update();
												resolveOpen = null;
											};
										}}
										class="space-y-2 rounded border border-app bg-surface p-2 text-left"
									>
										<input
											type="hidden"
											name="id"
											value={item.id}
										/>
										<input
											type="hidden"
											name="mode"
											value={resolveMode}
										/>
										<div class="flex gap-1.5">
											<button
												type="button"
												onclick={() =>
													(resolveMode = "manual")}
												class="rounded border px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider transition {resolveMode ===
												'manual'
													? 'border-accent bg-accent-soft text-app'
													: 'border-app bg-elevated text-secondary-app hover:text-app'}"
											>
												Manual
											</button>
											<button
												type="button"
												onclick={() =>
													(resolveMode = "auto")}
												class="rounded border px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider transition {resolveMode ===
												'auto'
													? 'border-accent bg-accent-soft text-app'
													: 'border-app bg-elevated text-secondary-app hover:text-app'}"
											>
												Auto
											</button>
										</div>
										{#if resolveMode === "auto"}
											<div
												class="grid gap-2 sm:grid-cols-3"
											>
												<label class="space-y-1">
													<span
														class="font-mono-app text-[10px] uppercase tracking-wider text-muted-app"
														>vmid</span
													>
													<input
														name="vmid"
														type="number"
														min="1"
														bind:value={resolveVmid}
														required
														class="w-full rounded border border-app bg-elevated px-2 py-1 font-mono-app text-xs text-app focus:border-accent focus:outline-none"
														placeholder="101"
													/>
												</label>
												<label class="space-y-1">
													<span
														class="font-mono-app text-[10px] uppercase tracking-wider text-muted-app"
														>node</span
													>
													<input
														name="node"
														type="number"
														min="1"
														bind:value={resolveNode}
														required
														class="w-full rounded border border-app bg-elevated px-2 py-1 font-mono-app text-xs text-app focus:border-accent focus:outline-none"
														placeholder="3"
													/>
												</label>
												<label class="space-y-1">
													<span
														class="font-mono-app text-[10px] uppercase tracking-wider text-muted-app"
														>storage</span
													>
													<input
														name="storage"
														bind:value={
															resolveStorage
														}
														required
														class="w-full rounded border border-app bg-elevated px-2 py-1 font-mono-app text-xs text-app focus:border-accent focus:outline-none"
														placeholder="local-lvm"
													/>
												</label>
											</div>
											<p
												class="font-mono-app text-[10px] text-muted-app"
											>
												Auto provisioning will use the
												VMID entered here.
											</p>
										{/if}
										<div class="flex justify-end gap-1.5">
											<button
												type="button"
												onclick={cancelResolve}
												class="rounded border border-app bg-surface px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition hover:bg-elevated hover:text-app"
											>
												Cancel
											</button>
											<button
												type="submit"
												class="rounded-lg bg-accent px-3 py-1.5 font-mono-app text-xs font-bold uppercase tracking-wider text-zinc-950 shadow-md transition hover:opacity-90"
											>
												{resolveMode === "manual"
													? "Complete"
													: "Provision"}
											</button>
										</div>
									</form>
								{:else}
									<div class="flex justify-end gap-1.5">
										<button
											type="button"
											onclick={() => openResolve(item)}
											class="rounded-lg bg-accent px-3 py-1.5 font-mono-app text-xs font-bold uppercase tracking-wider text-zinc-950 shadow-md transition hover:opacity-90"
										>
											Resolve
										</button>
									</div>
								{/if}
							{:else}
								<div class="flex flex-col items-end gap-1.5">
									<span
										class="inline-flex items-center rounded-md border border-app bg-elevated px-2.5 py-1 font-mono-app text-xs text-muted-app"
									>
										Synced_Ok
									</span>
									{#if item.vmid}
										<div class="flex gap-1.5">
											<button
												type="button"
												onclick={() => openConsole(item)}
												class="inline-flex h-8 items-center justify-center rounded bg-accent border border-accent/20 px-3 font-mono text-[11px] uppercase tracking-wider text-zinc-950 transition-colors duration-200 hover:opacity-90 cursor-pointer font-bold"
											>
												Console
											</button>
											<button
												type="button"
												onclick={() => openSsh(item)}
												class="inline-flex h-8 items-center justify-center rounded border border-app bg-elevated px-3 font-mono text-[11px] uppercase tracking-wider text-app transition-colors duration-200 hover:border-strong-app hover:text-accent cursor-pointer font-bold"
											>
												SSH
											</button>
										</div>
									{/if}
								</div>
							{/if}

							{#if form?.error && form?.recordId === item.id}
								<p
									class="text-right font-mono-app text-[10px]"
									style="color: var(--danger)"
								>
									{form.error}
								</p>
							{/if}

							{#if form?.error && form?.id === item.id}
								<p
									class="text-right font-mono-app text-[10px]"
									style="color: var(--danger)"
								>
									{form.error}
								</p>
							{/if}
						</td>
					</tr>
					{#if isFieldEditing}
						<tr
							class="border-b border-app bg-elevated/40 last:border-0"
						>
							<td colspan="4" class="p-6">
								<form
									method="POST"
									action="?/update"
									class="relative space-y-6 rounded-xl border border-app bg-surface/80 backdrop-blur-sm p-6 shadow-2xl transition-all duration-300"
								>
									<input
										type="hidden"
										name="id"
										value={item.id}
									/>

									<!-- Section Header -->
									<div class="flex items-center gap-2 border-b border-app pb-3">
										<Settings2 class="h-4 w-4 text-accent animate-pulse" />
										<div>
											<h4 class="font-mono-app text-sm font-bold tracking-tight text-app">
												// EDIT_LEASE_SPECIFICATIONS
											</h4>
											<p class="font-mono text-[9px] uppercase tracking-widest text-muted-app">
												Lease ID: {item.id}
											</p>
										</div>
									</div>

									<div class="grid gap-5 md:grid-cols-3">
										<!-- Hardware Specifications Group -->
										<div class="md:col-span-3 grid gap-4 md:grid-cols-3 rounded-lg border border-app bg-elevated/30 p-4">
											<div class="md:col-span-3 font-mono-app text-[10px] font-bold uppercase tracking-wider text-accent/80 flex items-center gap-1.5 border-b border-app pb-1.5 mb-1">
												<Cpu class="h-3.5 w-3.5" />
												<span>Hardware Specifications</span>
											</div>
											<label class="space-y-1.5">
												<span class="block font-mono-app text-[10px] uppercase tracking-wider text-secondary-app">CPU Cores</span>
												<div class="relative">
													<input
														name="cpu"
														type="number"
														step="1"
														bind:value={editCpu}
														required
														class="w-full rounded border border-app bg-elevated pl-3 pr-12 py-1.5 font-mono-app text-xs text-app focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-all duration-200"
													/>
													<span class="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] text-muted-app uppercase">Cores</span>
												</div>
											</label>
											<label class="space-y-1.5">
												<span class="block font-mono-app text-[10px] uppercase tracking-wider text-secondary-app">RAM Memory</span>
												<div class="relative">
													<input
														name="ram"
														type="number"
														step="1"
														bind:value={editRam}
														required
														class="w-full rounded border border-app bg-elevated pl-3 pr-10 py-1.5 font-mono-app text-xs text-app focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-all duration-200"
													/>
													<span class="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] text-muted-app uppercase">GB</span>
												</div>
											</label>
											<label class="space-y-1.5">
												<span class="block font-mono-app text-[10px] uppercase tracking-wider text-secondary-app">Disk Space</span>
												<div class="relative">
													<input
														name="disk"
														type="number"
														step="1"
														bind:value={editDisk}
														required
														class="w-full rounded border border-app bg-elevated pl-3 pr-10 py-1.5 font-mono-app text-xs text-app focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-all duration-200"
													/>
													<span class="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[9px] text-muted-app uppercase">GB</span>
												</div>
											</label>
										</div>

										<!-- Network & Ports Group -->
										<div class="md:col-span-3 grid gap-4 md:grid-cols-3 rounded-lg border border-app bg-elevated/30 p-4">
											<div class="md:col-span-3 font-mono-app text-[10px] font-bold uppercase tracking-wider text-accent/80 flex items-center gap-1.5 border-b border-app pb-1.5 mb-1">
												<Network class="h-3.5 w-3.5" />
												<span>Network & Mapping</span>
											</div>
											<label class="space-y-1.5 md:col-span-3">
												<span class="block font-mono-app text-[10px] uppercase tracking-wider text-secondary-app">Custom Firewall Ports</span>
												<input
													name="ports"
													bind:value={editPorts}
													class="w-full rounded border border-app bg-elevated px-3 py-1.5 font-mono-app text-xs text-app focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-all duration-200"
													placeholder="e.g. 80, 443, 3000, 8080 (comma separated)"
												/>
											</label>
											<label class="space-y-1.5">
												<span class="block font-mono-app text-[10px] uppercase tracking-wider text-secondary-app">Proxmox VMID</span>
												<input
													name="vmid"
													type="number"
													bind:value={editVmid}
													class="w-full rounded border border-app bg-elevated px-3 py-1.5 font-mono-app text-xs text-app focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-all duration-200"
													placeholder="e.g. 101"
												/>
											</label>
											<label class="space-y-1.5">
												<span class="block font-mono-app text-[10px] uppercase tracking-wider text-secondary-app">Proxmox Node</span>
												<input
													name="node"
													type="number"
													bind:value={editNode}
													class="w-full rounded border border-app bg-elevated px-3 py-1.5 font-mono-app text-xs text-app focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition-all duration-200"
													placeholder="e.g. 3"
												/>
											</label>
										</div>
									</div>

									<!-- Action Buttons -->
									<div class="flex justify-end gap-2 border-t border-app pt-4">
										<button
											type="button"
											onclick={cancelEdit}
											class="rounded-lg border border-app bg-surface px-4 py-2 font-mono-app text-xs font-bold uppercase tracking-wider text-secondary-app transition duration-200 hover:bg-elevated hover:text-app cursor-pointer"
										>
											Cancel
										</button>
										<button
											type="submit"
											class="rounded-lg bg-accent px-5 py-2 font-mono-app text-xs font-bold uppercase tracking-wider text-zinc-950 shadow-md transition duration-200 hover:opacity-90 active:scale-[0.98] cursor-pointer"
										>
											Save Fields
										</button>
									</div>
								</form>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
{/if}

{#if consoleTarget && terminalType}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4 sm:p-6 transition-all duration-300"
	>
		<div
			class="flex h-[80vh] w-full max-w-5xl flex-col rounded-xl border border-app bg-surface shadow-2xl overflow-hidden transition-all duration-300 transform scale-100"
		>
			<!-- Modal Header -->
			<header
				class="flex items-center justify-between border-b border-app bg-elevated px-4 py-3 sm:px-6"
			>
				<div class="flex items-center gap-2.5">
					<Terminal class="h-4 w-4 text-accent animate-pulse" />
					<div class="min-w-0">
						<h3
							class="font-mono-app text-sm font-semibold text-app truncate"
						>
							{consoleTarget.hostname}
							{terminalType === "ssh"
								? "SSH Terminal"
								: "Console"}
						</h3>
						<p
							class="font-mono text-[10px] text-muted-app uppercase tracking-wider"
						>
							NODE: {consoleTarget.node} · VMID: {consoleTarget.vmid}
							· TYPE: {consoleTarget.type}
						</p>
					</div>
				</div>
				<button
					type="button"
					onclick={closeConsole}
					class="rounded-md p-1.5 text-secondary-app hover:bg-surface hover:text-app transition-colors duration-200 cursor-pointer"
					aria-label="Close terminal"
				>
					<X class="h-4 w-4" />
				</button>
			</header>

			<!-- Modal Body -->
			<div
				class="relative flex-1 bg-zinc-950 flex items-center justify-center p-1"
			>
				{#if terminalType === "ssh"}
					<SshTerminal
						defaultHost={consoleTarget.dns_name ||
							consoleTarget.hostname}
						defaultIP={consoleTarget.IP}
						defaultUsername="root"
					/>
				{:else if consoleLoading}
					<div
						class="flex flex-col items-center gap-3 text-center p-8"
					>
						<RefreshCw class="h-8 w-8 text-accent animate-spin" />
						<p
							class="font-mono text-xs uppercase tracking-widest text-secondary-app animate-pulse"
						>
							// AUTHORIZING CONSOLE SESSION...
						</p>
					</div>
				{:else if consoleError}
					<div class="max-w-md text-center p-8 space-y-4">
						<p
							class="text-sm font-medium"
							style="color: var(--danger)"
						>
							{consoleError}
						</p>
						<p
							class="text-xs text-muted-app font-mono leading-relaxed"
						>
							Failed to establish connection to the Proxmox
							console. Please make sure the instance is running
							and the hypervisor is online.
						</p>
						<div class="flex justify-center gap-2 pt-2">
							<button
								type="button"
								onclick={() => openConsole(consoleTarget!)}
								class="inline-flex h-8 items-center justify-center rounded border border-app bg-elevated px-3 font-mono text-[11px] uppercase tracking-wider text-app transition-colors duration-200 hover:border-strong-app hover:text-accent cursor-pointer"
							>
								Retry
							</button>
							<button
								type="button"
								onclick={closeConsole}
								class="inline-flex h-8 items-center justify-center rounded border border-app bg-elevated px-3 font-mono text-[11px] uppercase tracking-wider text-secondary-app transition-colors duration-200 hover:border-strong-app cursor-pointer"
							>
								Close
							</button>
						</div>
					</div>
				{:else if consoleWsUrl && consoleTicket && consoleUser}
					<ProxmoxTerminal
						wsUrl={consoleWsUrl}
						ticket={consoleTicket}
						user={consoleUser}
					/>
				{/if}
			</div>
		</div>
	</div>
{/if}

