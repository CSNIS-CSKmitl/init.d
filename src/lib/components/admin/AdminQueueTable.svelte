<script lang="ts">
  import type { LeaseInstance } from "$lib/types";
  import { passionGroupName, creatorEmail, creatorName } from "$lib/types";
  import { enhance } from "$app/forms";
  import { cn } from "$lib/utils";
  import { leaseBadgeStatus, type LeaseBadgeStatus } from "$lib/leaseStatus";
  import SshTerminal from "$lib/components/status/SshTerminal.svelte";
  import ProxmoxTerminal from "$lib/components/status/ProxmoxTerminal.svelte";
  import AdminLeaseDetail from "$lib/components/admin/AdminLeaseDetail.svelte";
  import * as Table from "$lib/components/ui/table";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Empty from "$lib/components/ui/empty";
  import * as Tabs from "$lib/components/ui/tabs";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Spinner } from "$lib/components/ui/spinner";
  import {
    Terminal,
    MessageSquareText,
    Inbox,
    ChevronRight,
    ChevronDown,
    Check,
    X,
  } from "@lucide/svelte";

  // ---------------------------------------------------------------------
  // Console / SSH — a genuine full-takeover terminal session, so this one
  // stays a real modal Dialog (you can't usefully triage other rows while
  // SSH'd into a box anyway). Everything else in this file is NOT modal —
  // see the detail pane below.
  // ---------------------------------------------------------------------
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
        throw new Error(data.error || "Failed to fetch console ticket.");
      }
      if (!data.success || !data.wsUrl) {
        throw new Error(data.error || "Invalid ticket response from server.");
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

  // ---------------------------------------------------------------------
  // Detail rows — every per-lease action (reply, resolve/retry, edit
  // fields, provision, console/ssh entry points) lives in ONE place, one
  // consistent shape, expanding directly beneath its own row so it's never
  // ambiguous which lease it belongs to. `openIds` is a set, not a single
  // id, so several requests can be open and worked on at once — each gets
  // its own <AdminLeaseDetail> instance below with fully independent form
  // state (see that component for why).
  // ---------------------------------------------------------------------
  let openIds = $state<Set<string>>(new Set());
  function toggleDetail(id: string) {
    const next = new Set(openIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    openIds = next;
  }

  // Status filter above the table so a long queue can be narrowed to
  // "what actually needs me right now" while triaging in bulk.
  let filterTab = $state<"all" | LeaseBadgeStatus>("all");
  const filteredItems = $derived(
    filterTab === "all"
      ? items
      : items.filter(
          (i) => leaseBadgeStatus(i, progressMap[i.id]) === filterTab,
        ),
  );
  const filterCounts = $derived.by(() => {
    const c: Record<"all" | LeaseBadgeStatus, number> = {
      all: items.length,
      pending: 0,
      provisioning: 0,
      failed: 0,
      completed: 0,
    };
    for (const i of items) c[leaseBadgeStatus(i, progressMap[i.id])]++;
    return c;
  });

  const statusMeta: Record<LeaseBadgeStatus, { label: string }> = {
    failed: { label: "Failed" },
    provisioning: { label: "Provisioning" },
    pending: { label: "Pending" },
    completed: { label: "Completed" },
  };
</script>

{#if items.length === 0}
  <Empty.Root class="border border-border bg-card">
    <Empty.Header>
      <Empty.Media variant="icon"><Inbox /></Empty.Media>
      <Empty.Title
        class="font-mono text-xs uppercase tracking-widest text-muted-foreground"
      >
        Queue is empty
      </Empty.Title>
    </Empty.Header>
  </Empty.Root>
{:else}
  <!-- Row-expansion: clicking a row opens its detail directly beneath it,
	     right there in the table. Never an overlay, never a separate panel
	     elsewhere on screen — the detail is physically attached to the row
	     it belongs to, so there's no ambiguity about what's being viewed,
	     and the rest of the queue stays fully visible and clickable above
	     and below it the whole time. -->
  <div>
    <Tabs.Root bind:value={filterTab} class="mb-3 gap-3">
      <Tabs.List class="font-mono text-xs">
        <Tabs.Trigger value="all">All ({filterCounts.all})</Tabs.Trigger>
        <Tabs.Trigger value="pending"
          >Pending ({filterCounts.pending})</Tabs.Trigger
        >
        <Tabs.Trigger value="provisioning"
          >Provisioning ({filterCounts.provisioning})</Tabs.Trigger
        >
        <Tabs.Trigger value="failed"
          >Failed ({filterCounts.failed})</Tabs.Trigger
        >
        <Tabs.Trigger value="completed"
          >Completed ({filterCounts.completed})</Tabs.Trigger
        >
      </Tabs.List>
    </Tabs.Root>

    {#if filteredItems.length === 0}
      <Empty.Root class="border border-dashed border-border bg-card">
        <Empty.Header>
          <Empty.Title
            class="font-mono text-xs uppercase tracking-widest text-muted-foreground"
          >
            Nothing in this filter
          </Empty.Title>
        </Empty.Header>
      </Empty.Root>
    {:else}
      <div
        class="overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <Table.Root class="text-left">
          <Table.Header>
            <Table.Row
              class="bg-muted font-mono text-xs uppercase tracking-wider text-muted-foreground hover:bg-muted"
            >
              <Table.Head class="p-4 font-bold text-muted-foreground"
                >Status</Table.Head
              >
              <Table.Head class="p-4 font-bold text-muted-foreground"
                >Request</Table.Head
              >
              <Table.Head class="p-4 font-bold text-muted-foreground"
                >Requester</Table.Head
              >
              <Table.Head class="p-4 font-bold text-muted-foreground"
                >Specs</Table.Head
              >
              <Table.Head class="p-4 text-right font-bold text-muted-foreground"
              ></Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each filteredItems as item (item.id)}
              {@const badgeStatus = leaseBadgeStatus(
                item,
                progressMap[item.id],
              )}
              {@const meta = statusMeta[badgeStatus]}
              {@const hasReply = !!item.admin_reply}
              {@const isActive = openIds.has(item.id)}
              <Table.Row
                onclick={() => toggleDetail(item.id)}
                class={cn(
                  "cursor-pointer align-top transition-colors hover:bg-muted/40",
                  isActive && "bg-primary/5 hover:bg-primary/10",
                )}
              >
                <Table.Cell class="p-4 align-middle">
                  <Badge
                    variant="outline"
                    class={cn(
                      "gap-1 text-[10px] font-bold tracking-wider uppercase",
                      badgeStatus === "failed" &&
                        "border-destructive/20 bg-destructive/10 text-destructive",
                      badgeStatus === "provisioning" &&
                        "border-info/20 bg-info/10 text-info",
                      badgeStatus === "pending" &&
                        "border-warning/20 bg-warning/10 text-warning",
                      badgeStatus === "completed" &&
                        "border-success/20 bg-success/10 text-success",
                    )}
                  >
                    <span
                      class={cn(
                        "h-1.5 w-1.5 rounded-full",
                        badgeStatus === "failed" && "bg-destructive",
                        badgeStatus === "provisioning" &&
                          "animate-pulse bg-info",
                        badgeStatus === "pending" && "animate-pulse bg-warning",
                        badgeStatus === "completed" && "bg-success",
                      )}
                    ></span>
                    {meta.label}
                  </Badge>
                </Table.Cell>

                <Table.Cell class="max-w-xs p-4 align-middle">
                  <div class="flex flex-col gap-1">
                    <div
                      class="flex items-center gap-1.5 font-mono text-sm font-semibold text-foreground"
                    >
                      {item.hostname}
                      {#if hasReply}
                        <MessageSquareText
                          class="h-3 w-3 shrink-0 text-primary"
                        />
                      {/if}
                    </div>
                    <div class="line-clamp-2 text-xs text-foreground/70">
                      {item.purpose_notes}
                    </div>
                  </div>
                </Table.Cell>

                <Table.Cell class="p-4 align-middle">
                  <div class="flex flex-col gap-0.5">
                    <div class="text-xs font-bold text-foreground flex">
                      <div class="mr-auto">
                        {item.expand?.email?.name}
                      </div>
                      <div>{passionGroupName(item)}</div>
                    </div>
                    <div class="font-mono text-[11px] text-muted-foreground">
                      {creatorEmail(item)}
                    </div>
                  </div>
                </Table.Cell>

                <Table.Cell class="p-4 align-middle">
                  <div
                    class="flex flex-wrap items-center gap-1 font-mono text-[10px]"
                  >
                    <Badge
                      variant="outline"
                      class="font-bold text-muted-foreground uppercase"
                      >{item.type === "vm" ? "VM" : "CT"}</Badge
                    >
                    <span class="text-muted-foreground"
                      >{item.specs.cpu}C·{item.specs.ram}G·{item.specs
                        .disk}G</span
                    >
                    {#if item.quantity > 1}<Badge variant="secondary"
                        >x{item.quantity}</Badge
                      >{/if}
                  </div>
                </Table.Cell>

                <Table.Cell class="p-4 text-right align-middle">
                  <div
                    class="flex items-center justify-end gap-1.5"
                    role="presentation"
                    onclick={(e) => e.stopPropagation()}
                  >
                    {#if badgeStatus === "pending"}
                      <!-- Zero-input quick action: Manual resolve needs nothing but the
											     id, so the single most common bulk-triage action never has to
											     touch the detail pane at all. -->
                      <form method="POST" action="?/resolve" use:enhance>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="mode" value="manual" />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          class="font-mono"
                          title="Mark complete — the VM/CT already exists on Proxmox"
                        >
                          <Check data-icon="inline-start" />
                          Complete
                        </Button>
                      </form>
                    {/if}
                    <Button
                      type="button"
                      variant={isActive ? "secondary" : "ghost"}
                      size="sm"
                      onclick={() => toggleDetail(item.id)}
                      class="font-mono"
                    >
                      {isActive ? "Close" : "Open"}
                      {#if isActive}
                        <ChevronDown data-icon="inline-end" />
                      {:else}
                        <ChevronRight data-icon="inline-end" />
                      {/if}
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
              {#if isActive}
                <Table.Row class="hover:bg-transparent">
                  <Table.Cell colspan={5} class="bg-muted/20 p-0">
                    <div
                      class="flex items-center justify-between border-t border-border px-6 py-3"
                    >
                      <span
                        class="font-mono text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
                        >Details</span
                      >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onclick={() => toggleDetail(item.id)}
                        aria-label="Collapse detail"
                        class="shrink-0"
                      >
                        <X />
                      </Button>
                    </div>
                    <AdminLeaseDetail
                      {item}
                      {form}
                      {provisioning}
                      {progressMap}
                      onOpenConsole={openConsole}
                      onOpenSsh={openSsh}
                    />
                  </Table.Cell>
                </Table.Row>
              {/if}
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </div>
{/if}

<Dialog.Root
  open={!!(consoleTarget && terminalType)}
  onOpenChange={(o: boolean) => {
    if (!o) closeConsole();
  }}
>
  <Dialog.Content
    class="flex h-[80vh] w-full max-w-5xl flex-col gap-0 overflow-hidden rounded-xl p-0"
  >
    <Dialog.Header
      class="flex-row items-center justify-between border-b border-border bg-muted px-4 py-3 sm:px-6"
    >
      <div class="flex items-center gap-2.5">
        <Terminal class="h-4 w-4 animate-pulse text-primary" />
        <div class="min-w-0">
          <Dialog.Title
            class="truncate font-mono text-sm font-semibold text-foreground"
          >
            {consoleTarget?.hostname}
            {terminalType === "ssh" ? "SSH Terminal" : "Console"}
          </Dialog.Title>
          <Dialog.Description
            class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase"
          >
            NODE: {consoleTarget?.node} · VMID: {consoleTarget?.vmid} · TYPE: {consoleTarget?.type}
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div
      class="relative flex flex-1 items-center justify-center bg-zinc-950 p-1"
    >
      {#if terminalType === "ssh" && consoleTarget}
        <SshTerminal
          defaultHost={consoleTarget.dns_name || consoleTarget.hostname}
          defaultIP={consoleTarget.IP}
          defaultUsername="root"
        />
      {:else if consoleLoading}
        <div class="flex flex-col items-center gap-3 p-8 text-center">
          <Spinner class="size-8 text-primary" />
          <p
            class="animate-pulse font-mono text-xs tracking-widest text-foreground/70 uppercase"
          >
            // AUTHORIZING CONSOLE SESSION...
          </p>
        </div>
      {:else if consoleError}
        <div class="flex max-w-md flex-col gap-4 p-8 text-center">
          <p class="text-sm font-medium text-destructive">{consoleError}</p>
          <p class="font-mono text-xs leading-relaxed text-muted-foreground">
            Failed to establish connection to the Proxmox console. Please make
            sure the instance is running and the hypervisor is online.
          </p>
          <div class="flex justify-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={() => openConsole(consoleTarget!)}
              class="font-mono">Retry</Button
            >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onclick={closeConsole}
              class="font-mono">Close</Button
            >
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
  </Dialog.Content>
</Dialog.Root>
