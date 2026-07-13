<script lang="ts">
	import type { LeaseInstance } from "$lib/types";
	import { passionGroupName } from "$lib/types";
	import { enhance } from "$app/forms";

	type Props = {
		items: LeaseInstance[];
		form: { error?: string; id?: string; recordId?: string } | null;
		provisioning?: boolean;
		progressMap?: Record<string, { status: string; error?: string }>;
	};

	let { items = [], form, provisioning = false, progressMap = {} }: Props = $props();

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
					<th class="p-4 font-medium">Instance Specs & Details</th>
					<th class="p-4 font-medium">Group / Requester</th>
					<th class="p-4 font-medium">Network & Firewall (Ports)</th>
					<th class="p-4 text-right font-medium">Action</th>
				</tr>
			</thead>
			<tbody>
				{#each items as item (item.id)}
					{@const isPending = item.status === "pending" && progressMap[item.id]?.status !== "Complete"}
					{@const isEditing = replyOpen === item.id}
					{@const isResolving = resolveOpen === item.id}
					{@const isFieldEditing = editOpen === item.id}
					<tr
						class="border-b border-app transition-colors last:border-0 {isPending
							? 'bg-accent-soft hover:bg-elevated'
							: 'text-muted-app hover:bg-elevated'}"
					>
						<!-- Specs column -->
						<td class="space-y-2 p-4">
							<div class="flex flex-wrap items-center gap-2">
								<span
									class="font-mono-app text-sm font-semibold {isPending
										? 'text-app'
										: 'text-muted-app line-through'}"
								>
									{item.hostname}
								</span>
								<span
									class="rounded border border-app bg-elevated px-1.5 py-0.5 font-mono-app text-[10px] uppercase {isPending
										? 'text-secondary-app'
										: 'text-muted-app'}"
								>
									{item.type === "vm" ? "VM" : "CT"}
								</span>
								<span
									class="rounded border border-app bg-elevated px-1.5 py-0.5 font-mono-app text-[10px] font-bold {isPending
										? 'text-accent'
										: 'text-muted-app'}"
								>
									x{item.quantity}
								</span>
							</div>
							<div class="font-mono-app text-xs text-muted-app">
								{item.os_template} | {item.specs.cpu} Cores | {item
									.specs.ram} GB RAM | {item.specs.disk} GB Disk
							</div>
							{#if progressMap[item.id]}
								<div class="mt-2 max-w-md rounded-lg border border-accent bg-accent-soft p-3 font-mono-app text-xs text-accent">
									<div class="flex items-center gap-2">
										<span class="relative flex h-2 w-2">
											<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
											<span class="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
										</span>
										<span class="font-bold uppercase tracking-wider text-[10px] text-accent">Provisioning Status:</span>
									</div>
									<div class="mt-1 text-app font-medium">{progressMap[item.id].status}</div>
									{#if progressMap[item.id].error}
										<div class="mt-1.5 text-xs text-red-500 font-bold leading-normal">
											Error: {progressMap[item.id].error}
										</div>
									{/if}
								</div>
							{/if}
							{#if isPending}
								<div
									class="max-w-md rounded border border-app bg-elevated p-2"
								>
									<div
										class="font-mono-app text-[10px] font-bold uppercase text-muted-app"
									>
										Purpose / Notes:
									</div>
									<div
										class="mt-0.5 font-mono-app text-xs leading-relaxed text-secondary-app"
									>
										{item.purpose_notes}
									</div>
								</div>
							{:else}
								<div
									class="font-mono-app text-[11px] text-muted-app"
								>
									Purpose: {item.purpose_notes}
								</div>
							{/if}
						</td>

						<!-- Group / Requester column -->
						<td class="space-y-3 p-4">
							<div>
								<div
									class="text-sm {isPending
										? 'text-app'
										: 'text-muted-app'}"
								>
									{passionGroupName(item)}
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
											class="rounded border border-app bg-surface px-2.5 py-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition hover:bg-elevated hover:text-app"
										>
											Resolve
										</button>
									{/if}
								{/if}
								<div
									class="font-mono-app text-xs text-muted-app"
								>
									{item.creator_email}
								</div>
							</div>
							<div
								class="space-y-0.5 font-mono-app text-[11px] text-muted-app"
							>
								<div>
									Start: <span class="text-secondary-app"
										>{fmt(item.start_date)}</span
									>
								</div>
								<div>
									{isPending ? "Expire" : "Expired"}:
									<span
										class={isPending
											? "text-accent"
											: "text-muted-app"}
										>{fmt(item.end_date)}</span
									>
								</div>
							</div>
						</td>

						<!-- Network & Firewall column -->
						<td class="space-y-1.5 p-4 font-mono-app text-xs">
							<div>
								Zone: <span
									class="font-bold {isPending
										? 'text-app'
										: 'text-muted-app'}"
									>{item.network_type === "local"
										? "LOCAL IP"
										: "PUBLIC"}</span
								>
							</div>
							{#if item.dns_name}
								<div class="max-w-45 truncate text-muted-app">
									DNS: <span
										class={isPending
											? "text-secondary-app underline"
											: "text-muted-app"}
										>{item.dns_name}</span
									>
								</div>
							{/if}
							<div
								class={isPending
									? "text-secondary-app"
									: "text-muted-app"}
							>
								Custom Ports:
								{#if portsFor(item.ports).length > 0}
									<span
										class="ml-1 rounded border border-app bg-accent-soft px-1.5 py-0.5 font-bold text-accent"
									>
										{portsFor(item.ports).join(", ")}
									</span>
								{:else}
									<span class="text-muted-app"
										>Default Only</span
									>
								{/if}
							</div>
						</td>

						<!-- Action column -->
						<td class="space-y-3 p-4 text-right">
							<div class="text-left">
								<div class="mb-2 flex flex-wrap gap-1.5">
									{#if !isFieldEditing}
										<button
											type="button"
											onclick={() => openEdit(item)}
											class="rounded border border-app bg-surface px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition hover:bg-elevated hover:text-app"
										>
											Edit Fields
										</button>
									{:else}
										<button
											type="button"
											onclick={cancelEdit}
											class="rounded border border-app bg-surface px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition hover:bg-elevated hover:text-app"
										>
											Close Fields
										</button>
									{/if}
								</div>
								{#if !isEditing && item.admin_reply}
									<div
										class="rounded border border-app bg-elevated p-2"
									>
										<div
											class="font-mono-app text-[10px] font-bold uppercase text-muted-app"
										>
											Reply_Sent
										</div>
										<div
											class="mt-0.5 whitespace-pre-wrap font-mono-app text-xs leading-relaxed text-secondary-app"
										>
											{item.admin_reply}
										</div>
										{#if item.admin_reply_at}
											<div
												class="mt-1 font-mono-app text-[10px] text-muted-app"
											>
												{fmt(item.admin_reply_at)}
											</div>
										{/if}
									</div>
									<div class="mt-1 flex justify-end gap-1.5">
										<button
											type="button"
											onclick={() => openReply(item)}
											class="rounded border border-app bg-surface px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition hover:bg-elevated hover:text-app"
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
												class="rounded border border-app bg-surface px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition hover:bg-elevated hover:text-app"
											>
												Clear
											</button>
										</form>
									</div>
								{:else if isEditing}
									<form
										method="POST"
										action="?/reply"
										class="space-y-1.5"
									>
										<input
											type="hidden"
											name="id"
											value={item.id}
										/>
										<textarea
											name="reply"
											bind:value={replyDraft}
											rows="3"
											maxlength="4096"
											placeholder="พิมพ์ข้อความถึงผู้ขอ เช่น กำลังเตรียม VM อยู่ คาดว่าพร้อมใช้ภายใน 1 ชม."
											class="w-full rounded border border-app bg-surface p-2 font-mono-app text-xs text-app placeholder:text-muted-app focus:border-accent focus:outline-none"
										></textarea>
										<div class="flex justify-end gap-1.5">
											<button
												type="button"
												onclick={cancelReply}
												class="rounded border border-app bg-surface px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition hover:bg-elevated hover:text-app"
											>
												Cancel
											</button>
											<button
												type="submit"
												disabled={replyDraft.trim()
													.length === 0}
												class="rounded bg-accent px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-zinc-950 shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
											>
												{item.admin_reply
													? "Update"
													: "Send"}
											</button>
										</div>
									</form>
								{:else}
									<button
										type="button"
										onclick={() => openReply(item)}
										class="rounded border border-app bg-surface px-2.5 py-1 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition hover:bg-elevated hover:text-app"
									>
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
								<span
									class="inline-flex items-center rounded-md border border-app bg-elevated px-2.5 py-1 font-mono-app text-xs text-muted-app"
								>
									Synced_Ok
								</span>
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
							class="border-b border-app bg-elevated/70 last:border-0"
						>
							<td colspan="4" class="p-4">
								<form
									method="POST"
									action="?/update"
									class="space-y-3 rounded-lg border border-app bg-surface p-4 shadow-inner"
								>
									<input
										type="hidden"
										name="id"
										value={item.id}
									/>
									<div class="grid gap-3 md:grid-cols-3">
										<label class="space-y-1">
											<span
												class="font-mono-app text-[10px] uppercase tracking-wider text-muted-app"
												>spec cpu</span
											>
											<input
												name="cpu"
												type="number"
												step="1"
												bind:value={editCpu}
												required
												class="w-full rounded border border-app bg-elevated px-2 py-1 font-mono-app text-xs text-app focus:border-accent focus:outline-none"
											/>
										</label>
										<label class="space-y-1">
											<span
												class="font-mono-app text-[10px] uppercase tracking-wider text-muted-app"
												>spec ram</span
											>
											<input
												name="ram"
												type="number"
												step="1"
												bind:value={editRam}
												required
												class="w-full rounded border border-app bg-elevated px-2 py-1 font-mono-app text-xs text-app focus:border-accent focus:outline-none"
											/>
										</label>
										<label class="space-y-1">
											<span
												class="font-mono-app text-[10px] uppercase tracking-wider text-muted-app"
												>spec disk</span
											>
											<input
												name="disk"
												type="number"
												step="1"
												bind:value={editDisk}
												required
												class="w-full rounded border border-app bg-elevated px-2 py-1 font-mono-app text-xs text-app focus:border-accent focus:outline-none"
											/>
										</label>
										<label class="space-y-1 md:col-span-3">
											<span
												class="font-mono-app text-[10px] uppercase tracking-wider text-muted-app"
												>ports</span
											>
											<input
												name="ports"
												bind:value={editPorts}
												class="w-full rounded border border-app bg-elevated px-2 py-1 font-mono-app text-xs text-app focus:border-accent focus:outline-none"
												placeholder="80, 443, 3000"
											/>
										</label>
										<label class="space-y-1">
											<span
												class="font-mono-app text-[10px] uppercase tracking-wider text-muted-app"
												>vmid</span
											>
											<input
												name="vmid"
												type="number"
												bind:value={editVmid}
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
												bind:value={editNode}
												class="w-full rounded border border-app bg-elevated px-2 py-1 font-mono-app text-xs text-app focus:border-accent focus:outline-none"
												placeholder="3"
											/>
										</label>
									</div>
									<div class="flex justify-end gap-1.5">
										<button
											type="button"
											onclick={cancelEdit}
											class="rounded border border-app bg-surface px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-secondary-app transition hover:bg-elevated hover:text-app"
										>
											Cancel
										</button>
										<button
											type="submit"
											class="rounded bg-accent px-2 py-0.5 font-mono-app text-[10px] font-bold uppercase tracking-wider text-zinc-950 shadow-sm transition hover:opacity-90"
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
