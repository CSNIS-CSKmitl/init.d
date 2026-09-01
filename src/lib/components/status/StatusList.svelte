<script lang="ts">
	import type { LeaseInstance } from "$lib/types";
	import { passionGroupName } from "$lib/types";
	import { cn } from "$lib/utils";
	import StatusBadge from "$lib/components/StatusBadge.svelte";
	import ProxmoxTerminal from "$lib/components/status/ProxmoxTerminal.svelte";
	import SshTerminal from "$lib/components/status/SshTerminal.svelte";
	import * as Empty from "$lib/components/ui/empty";
	import * as Table from "$lib/components/ui/table";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import {
		Inbox,
		Cpu,
		MemoryStick,
		HardDrive,
		Calendar,
		ChevronDown,
		ChevronRight,
		MessageSquareText,
		Terminal,
		X,
		RefreshCw,
	} from "@lucide/svelte";

	let { items = [] }: { items: LeaseInstance[] } = $props();

	let expanded = $state<string | null>(null);

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

	// Automatically collapse deleted items if they were expanded
	$effect(() => {
		if (expanded && !items.some((i) => i.id === expanded)) {
			expanded = null;
		}
	});

	let powerStates = $state<Record<string, { status: 'running' | 'stopped' | 'loading' | 'unknown', actionLoading?: boolean }>>({});

	// Fetch power state for a specific instance
	async function fetchPowerState(id: string) {
		try {
			const res = await fetch(`/api/instance-power?instanceId=${id}`);
			if (res.ok) {
				const data = await res.json();
				powerStates[id] = { status: data.status };
			} else {
				powerStates[id] = { status: 'unknown' };
			}
		} catch {
			powerStates[id] = { status: 'unknown' };
		}
	}

	// Trigger start / shutdown
	async function togglePower(item: LeaseInstance) {
		const currentState = powerStates[item.id]?.status;
		if (!currentState || currentState === 'loading') return;
		const action = currentState === 'running' ? 'shutdown' : 'start';

		// Set loading state
		powerStates[item.id] = { status: currentState, actionLoading: true };

		try {
			const res = await requestPowerAction(item.id, action);
			if (res.success && res.upid) {
				// Poll task status until complete
				await pollTaskStatus(item.node ? `pve${item.node}` : '', res.upid);
			}
		} catch (err) {
			console.error('Power toggle failed:', err);
		} finally {
			// Pull status again from backend after action complete
			await fetchPowerState(item.id);
		}
	}

	async function requestPowerAction(instanceId: string, action: 'start' | 'shutdown') {
		const res = await fetch('/api/instance-power', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ instanceId, action }),
		});
		if (!res.ok) {
			const err = await res.json();
			throw new Error(err.error || 'Action failed');
		}
		return await res.json();
	}

	async function pollTaskStatus(node: string, upid: string) {
		return new Promise<void>((resolve) => {
			const interval = setInterval(async () => {
				try {
					const res = await fetch(`/api/instance-power/task?node=${node}&upid=${upid}`);
					if (res.ok) {
						const data = await res.json();
						if (data.status === 'stopped') {
							clearInterval(interval);
							resolve();
						}
					} else {
						clearInterval(interval);
						resolve();
					}
				} catch {
					clearInterval(interval);
					resolve();
				}
			}, 2000);
		});
	}

	// Trigger fetches for all completed instances on mount/update
	$effect(() => {
		for (const item of items) {
			if (item.status === 'completed' && item.vmid && item.node && !powerStates[item.id]) {
				powerStates[item.id] = { status: 'loading' };
				fetchPowerState(item.id);
			}
		}
	});

	const portsFor = (s: string | undefined) =>
		(s ?? "")
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean);

	const fmt = (iso: string) =>
		new Date(iso).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "2-digit",
		});
</script>

{#if items.length === 0}
	<Empty.Root class="border border-dashed border-border bg-card">
		<Empty.Header>
			<Empty.Media variant="icon"><Inbox /></Empty.Media>
			<Empty.Title class="font-mono text-xs uppercase tracking-widest">
				No requests yet
			</Empty.Title>
			<Empty.Description>
				Once you file a lease it will appear here in real time.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<Button href="/request" class="font-mono text-xs uppercase tracking-widest">
				File a lease
			</Button>
		</Empty.Content>
	</Empty.Root>
{:else}
	<!-- Mobile cards (below md) — same data as the table but stacked. -->
	<div class="space-y-3 md:hidden">
		{#each items as item (item.id)}
			{@const isOpen = expanded === item.id}
			<div class="rounded-lg border border-border bg-card transition-colors duration-300">
				<button
					type="button"
					onclick={() => (expanded = isOpen ? null : item.id)}
					aria-expanded={isOpen}
					class="flex w-full items-start gap-3 p-4 text-left"
				>
					<div class="mt-0.5 text-muted-foreground">
						{#if isOpen}
							<ChevronDown class="size-4" />
						{:else}
							<ChevronRight class="size-4" />
						{/if}
					</div>
					<div class="min-w-0 flex-1 space-y-1">
						<div class="flex items-start justify-between gap-2">
							<span class="truncate font-mono text-sm text-foreground">
								{item.hostname}
							</span>
							<StatusBadge status={item.status} />
						</div>
						<div class="font-mono text-xs text-muted-foreground">
							{item.os_template}
						</div>
						<div class="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs">
							<span class="inline-flex items-center gap-1 text-foreground">
								<Cpu class="size-3 text-muted-foreground" />
								<span class="text-primary">{item.specs.cpu}</span>C
							</span>
							<span class="inline-flex items-center gap-1 text-foreground">
								<MemoryStick class="size-3 text-muted-foreground" />
								<span class="text-primary">{item.specs.ram}</span>G
							</span>
							<span class="inline-flex items-center gap-1 text-foreground">
								<HardDrive class="size-3 text-muted-foreground" />
								<span class="text-primary">{item.specs.disk}</span>G
							</span>
							<span class="text-muted-foreground">×{item.quantity}</span>
						</div>
					</div>
				</button>
				{#if isOpen}
					<div class="space-y-4 border-t border-border p-4 text-xs">
						{#if item.admin_reply}
							<div class="rounded-md border border-border bg-muted p-3">
								<div class="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
									<MessageSquareText class="size-3" />
									ตอบกลับจากแอดมิน
								</div>
								<p class="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
									{item.admin_reply}
								</p>
								{#if item.admin_reply_at}
									<p class="mt-1.5 font-mono text-[10px] text-muted-foreground">
										{fmt(item.admin_reply_at)}
									</p>
								{/if}
							</div>
						{/if}
						<div>
							<p class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
								Type
							</p>
							<p class="mt-1 flex items-center gap-1.5 font-mono text-foreground">
								<Badge variant="outline">{item.type}</Badge>
								<span class="text-muted-foreground">{item.network_type}</span>
							</p>
						</div>
						<div>
							<p class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
								Lease
							</p>
							<p class="mt-0.5 flex items-center gap-1 font-mono text-foreground">
								<Calendar class="size-3 text-muted-foreground" />
								{fmt(item.start_date)} → {fmt(item.end_date)}
							</p>
						</div>
						{#if item.dns_name}
							<div>
								<p class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
									Network
								</p>
								<p class="mt-0.5 break-all font-mono text-foreground/70">
									{item.dns_name}
								</p>
							</div>
						{/if}
						<div>
							<p class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
								Open ports
							</p>
							<p class="mt-1 flex flex-wrap gap-1.5 font-mono">
								{#each portsFor(item.ports) as port (port)}
									<Badge variant="outline" class="font-mono text-primary">
										{port}
									</Badge>
								{:else}
									<span class="text-foreground/70">—</span>
								{/each}
							</p>
						</div>
						<div>
							<p class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
								Group
							</p>
							<p class="mt-0.5 font-mono text-foreground">
								{passionGroupName(item)}
							</p>
						</div>
						<div>
							<p class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
								Purpose notes
							</p>
							<p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/70">
								{item.purpose_notes}
							</p>
						</div>
						{#if item.status === "pending"}
							<div class="mt-4 flex gap-2 border-t border-border pt-4">
								<Button
									href="/request?edit={item.id}"
									variant="outline"
									size="sm"
									class="font-mono text-[11px] uppercase tracking-wider"
								>
									Edit
								</Button>
								<form
									method="POST"
									action="?/cancel"
									onsubmit={(e) => {
										if (
											!confirm(
												"คุณต้องการยกเลิกคำขอนี้ใช่หรือไม่?",
											)
										)
											e.preventDefault();
									}}
								>
									<input
										type="hidden"
										name="id"
										value={item.id}
									/>
									<Button
										type="submit"
										variant="outline"
										size="sm"
										class="font-mono text-[11px] uppercase tracking-wider hover:text-destructive"
									>
										Cancel
									</Button>
								</form>
							</div>
						{/if}
						{#if item.status === "completed" && item.vmid && item.node}
							<div class="mt-4 flex gap-2 border-t border-border pt-4">
								<!-- <button
									type="button"
									onclick={() => openConsole(item)}
									class="inline-flex h-8 items-center justify-center rounded bg-accent border border-accent/20 px-3 font-mono text-[11px] uppercase tracking-wider text-zinc-950 transition-colors duration-200 hover:opacity-90 cursor-pointer"
								>
									Console
								</button> -->
								<Button
									variant="outline"
									size="sm"
									onclick={() => openSsh(item)}
									class="font-mono text-[11px] uppercase tracking-wider"
								>
									SSH (WebTTY)
								</Button>
								{#if powerStates[item.id]}
									{@const pState = powerStates[item.id]}
									{#if pState.status === "loading"}
										<Button
											variant="outline"
											size="sm"
											disabled
											class="font-mono text-[11px] uppercase tracking-wider"
										>
											<Spinner data-icon="inline-start" />
											Syncing
										</Button>
									{:else if pState.status === "running"}
										<Button
											variant="outline"
											size="sm"
											onclick={() => togglePower(item)}
											disabled={pState.actionLoading}
											class={cn(
												"font-mono text-[11px] uppercase tracking-wider",
												!pState.actionLoading &&
													"border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20",
											)}
										>
											{#if pState.actionLoading}
												<Spinner data-icon="inline-start" />
												Stopping...
											{:else}
												Stop
											{/if}
										</Button>
									{:else if pState.status === "stopped"}
										<Button
											variant="outline"
											size="sm"
											onclick={() => togglePower(item)}
											disabled={pState.actionLoading}
											class={cn(
												"font-mono text-[11px] uppercase tracking-wider",
												!pState.actionLoading &&
													"border-success/20 bg-success/10 text-success hover:bg-success/20",
											)}
										>
											{#if pState.actionLoading}
												<Spinner data-icon="inline-start" />
												Starting...
											{:else}
												Start
											{/if}
										</Button>
									{:else}
										<Button
											variant="outline"
											size="sm"
											onclick={() => fetchPowerState(item.id)}
											class="font-mono text-[11px] uppercase tracking-wider"
										>
											Retry Power
										</Button>
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Table for md and up. -->
	<div class="hidden overflow-x-auto rounded-lg border border-border bg-card transition-colors duration-300 md:block">
		<Table.Root class="min-w-[860px]">
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-8"></Table.Head>
					<Table.Head class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
						hostname
					</Table.Head>
					<Table.Head class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
						type
					</Table.Head>
					<Table.Head class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
						specs
					</Table.Head>
					<Table.Head class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
						lease
					</Table.Head>
					<Table.Head class="text-right font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
						status
					</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each items as item (item.id)}
					{@const isOpen = expanded === item.id}
					<Table.Row class="align-top">
						<Table.Cell class="pt-4">
							<button
								type="button"
								onclick={() =>
									(expanded = isOpen ? null : item.id)}
								aria-label="Toggle details"
								class="text-muted-foreground hover:text-foreground"
							>
								{#if isOpen}
									<ChevronDown class="size-4" />
								{:else}
									<ChevronRight class="size-4" />
								{/if}
							</button>
						</Table.Cell>
						<Table.Cell>
							<div class="font-mono text-sm text-foreground">
								{item.hostname}
							</div>
							<div class="mt-0.5 font-mono text-xs text-muted-foreground">
								{item.os_template}
							</div>
						</Table.Cell>
						<Table.Cell class="font-mono text-sm text-foreground">
							<Badge variant="outline">{item.type}</Badge>
							<div class="mt-1 text-xs text-muted-foreground">
								{item.network_type}
							</div>
						</Table.Cell>
						<Table.Cell class="font-mono text-sm">
							<div class="flex items-center gap-3 text-foreground">
								<span class="inline-flex items-center gap-1">
									<Cpu class="size-3 text-muted-foreground" />
									<span class="text-primary">{item.specs.cpu}</span>
								</span>
								<span class="inline-flex items-center gap-1">
									<MemoryStick class="size-3 text-muted-foreground" />
									<span class="text-primary">{item.specs.ram}G</span>
								</span>
								<span class="inline-flex items-center gap-1">
									<HardDrive class="size-3 text-muted-foreground" />
									<span class="text-primary">{item.specs.disk}G</span>
								</span>
							</div>
							<div class="mt-0.5 text-xs text-muted-foreground">
								ports: {portsFor(item.ports).join(", ") || "—"}
							</div>
						</Table.Cell>
						<Table.Cell class="font-mono text-sm">
							<div class="flex items-center gap-1 text-foreground">
								<Calendar class="size-3 text-muted-foreground" />
								{fmt(item.start_date)} → {fmt(item.end_date)}
							</div>
							<div class="mt-0.5 text-xs text-muted-foreground">
								×{item.quantity}
							</div>
						</Table.Cell>
						<Table.Cell class="text-right">
							<StatusBadge status={item.status} />
						</Table.Cell>
					</Table.Row>
					{#if isOpen}
						<Table.Row class="bg-muted transition-colors duration-200">
							<Table.Cell></Table.Cell>
							<Table.Cell colspan={5} class="py-5">
								{#if item.admin_reply}
									<div class="mb-5 flex gap-3 rounded-md border border-border bg-card p-4">
										<MessageSquareText class="mt-0.5 size-4 shrink-0 text-primary" />
										<div class="min-w-0 flex-1">
											<div class="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
												ตอบกลับจากแอดมิน
											</div>
											<p class="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
												{item.admin_reply}
											</p>
											{#if item.admin_reply_at}
												<p class="mt-2 font-mono text-[10px] text-muted-foreground">
													{fmt(item.admin_reply_at)}
												</p>
											{/if}
										</div>
									</div>
								{/if}
								<div class="grid gap-6 sm:grid-cols-3">
									<div>
										<p class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
											Network
										</p>
										<p class="mt-1 font-mono text-sm text-foreground">
											{item.network_type}
										</p>
										<p class="mt-1 break-all font-mono text-sm text-foreground/70">
											{item.dns_name || "—"}
										</p>
									</div>
									<div>
										<p class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
											Open ports
										</p>
										<p class="mt-1 flex flex-wrap gap-1.5 font-mono text-sm">
											{#each portsFor(item.ports) as port (port)}
												<Badge variant="outline" class="font-mono text-primary">
													{port}
												</Badge>
											{:else}
												<span class="text-foreground/70">—</span>
											{/each}
										</p>
									</div>
									<div>
										<p class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
											Group
										</p>
										<p class="mt-1 font-mono text-sm text-foreground">
											{passionGroupName(item)}
										</p>
									</div>
								</div>
								<div class="mt-5">
									<p class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
										Purpose notes
									</p>
									<p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground/70">
										{item.purpose_notes}
									</p>
								</div>
								{#if item.status === "pending"}
									<div class="mt-5 flex gap-2 border-t border-border pt-4">
										<Button
											href="/request?edit={item.id}"
											variant="outline"
											size="sm"
											class="font-mono text-[11px] uppercase tracking-wider"
										>
											Edit
										</Button>
										<form
											method="POST"
											action="?/cancel"
											onsubmit={(e) => {
												if (
													!confirm(
														"คุณต้องการยกเลิกคำขอนี้ใช่หรือไม่?",
													)
												)
													e.preventDefault();
											}}
										>
											<input
												type="hidden"
												name="id"
												value={item.id}
											/>
											<Button
												type="submit"
												variant="outline"
												size="sm"
												class="font-mono text-[11px] uppercase tracking-wider hover:text-destructive"
											>
												Cancel
											</Button>
										</form>
									</div>
								{/if}
								{#if item.status === "completed" && item.vmid && item.node}
									<div class="mt-5 flex gap-2 border-t border-border pt-4">
										<Button
											size="sm"
											onclick={() => openConsole(item)}
											class="font-mono text-[11px] uppercase tracking-wider"
										>
											Console
										</Button>
										<Button
											variant="outline"
											size="sm"
											onclick={() => openSsh(item)}
											class="font-mono text-[11px] uppercase tracking-wider"
										>
											SSH (WebTTY)
										</Button>
										{#if powerStates[item.id]}
											{@const pState = powerStates[item.id]}
											{#if pState.status === "loading"}
												<Button
													variant="outline"
													size="sm"
													disabled
													class="font-mono text-[11px] uppercase tracking-wider"
												>
													<Spinner data-icon="inline-start" />
													Syncing
												</Button>
											{:else if pState.status === "running"}
												<Button
													variant="outline"
													size="sm"
													onclick={() => togglePower(item)}
													disabled={pState.actionLoading}
													class={cn(
														"font-mono text-[11px] uppercase tracking-wider",
														!pState.actionLoading &&
															"border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20",
													)}
												>
													{#if pState.actionLoading}
														<Spinner data-icon="inline-start" />
														Stopping...
													{:else}
														Stop
													{/if}
												</Button>
											{:else if pState.status === "stopped"}
												<Button
													variant="outline"
													size="sm"
													onclick={() => togglePower(item)}
													disabled={pState.actionLoading}
													class={cn(
														"font-mono text-[11px] uppercase tracking-wider",
														!pState.actionLoading &&
															"border-success/20 bg-success/10 text-success hover:bg-success/20",
													)}
												>
													{#if pState.actionLoading}
														<Spinner data-icon="inline-start" />
														Starting...
													{:else}
														Start
													{/if}
												</Button>
											{:else}
												<Button
													variant="outline"
													size="sm"
													onclick={() => fetchPowerState(item.id)}
													class="font-mono text-[11px] uppercase tracking-wider"
												>
													Retry Power
												</Button>
											{/if}
										{/if}
									</div>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/if}
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}

<Dialog.Root
	open={!!(consoleTarget && terminalType)}
	onOpenChange={(o) => {
		if (!o) closeConsole();
	}}
>
	<Dialog.Content
		showCloseButton={false}
		class="flex h-[80vh] w-full max-w-5xl flex-col gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-2xl"
	>
		{#if consoleTarget && terminalType}
			<Dialog.Header class="flex-row items-center justify-between gap-2.5 space-y-0 border-b border-border bg-muted px-4 py-3 sm:px-6">
				<div class="flex min-w-0 items-center gap-2.5">
					<Terminal class="size-4 animate-pulse text-primary" />
					<div class="min-w-0">
						<Dialog.Title class="truncate font-mono text-sm font-semibold text-foreground">
							{consoleTarget.hostname}
							{terminalType === "ssh"
								? "SSH Terminal"
								: "Console"}
						</Dialog.Title>
						<p class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
							NODE: {consoleTarget.node} · VMID: {consoleTarget.vmid}
							· TYPE: {consoleTarget.type}
						</p>
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					onclick={closeConsole}
					aria-label="Close terminal"
				>
					<X data-icon="inline-start" />
				</Button>
			</Dialog.Header>

			<!-- Modal Body -->
			<div class="relative flex flex-1 items-center justify-center bg-zinc-950 p-1">
				{#if terminalType === "ssh"}
					<SshTerminal
						defaultHost={consoleTarget.dns_name ||
							consoleTarget.hostname}
						defaultIP={consoleTarget.IP}
						defaultUsername="root"
					/>
				{:else if consoleLoading}
					<div class="flex flex-col items-center gap-3 p-8 text-center">
						<Spinner class="size-8 text-primary" />
						<p class="animate-pulse font-mono text-xs uppercase tracking-widest text-zinc-400">
							// AUTHORIZING CONSOLE SESSION...
						</p>
					</div>
				{:else if consoleError}
					<div class="max-w-md space-y-4 p-8 text-center">
						<p class="text-sm font-medium text-destructive">
							{consoleError}
						</p>
						<p class="font-mono text-xs leading-relaxed text-zinc-500">
							Failed to establish connection to the Proxmox
							console. Please make sure the instance is running
							and the hypervisor is online.
						</p>
						<div class="flex justify-center gap-2 pt-2">
							<Button
								variant="outline"
								size="sm"
								onclick={() => openConsole(consoleTarget!)}
								class="font-mono text-[11px] uppercase tracking-wider"
							>
								Retry
							</Button>
							<Button
								variant="outline"
								size="sm"
								onclick={closeConsole}
								class="font-mono text-[11px] uppercase tracking-wider"
							>
								Close
							</Button>
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
		{/if}
	</Dialog.Content>
</Dialog.Root>
