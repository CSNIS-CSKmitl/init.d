<script lang="ts">
  import { tick } from "svelte";
  import type { LeaseInstance } from "$lib/types";
  import { passionGroupName, creatorEmail, creatorName } from "$lib/types";
  import { cn } from "$lib/utils";
  import { leaseBadgeStatus, type LeaseBadgeStatus } from "$lib/leaseStatus";
  import SshSessions from "$lib/components/status/SshSessions.svelte";
  import ProxmoxTerminal from "$lib/components/status/ProxmoxTerminal.svelte";
  import ProxmoxVnc from "$lib/components/status/ProxmoxVnc.svelte";
  import AdminLeaseDetail from "$lib/components/admin/AdminLeaseDetail.svelte";
  import InstanceDashboard from "$lib/components/status/InstanceDashboard.svelte";
  import * as Table from "$lib/components/ui/table";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Empty from "$lib/components/ui/empty";
  import * as Tabs from "$lib/components/ui/tabs";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { Spinner } from "$lib/components/ui/spinner";
  import {
    Terminal,
    X,
    MessageSquareText,
    Inbox,
    ChevronRight,
    ChevronDown,
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
  let consoleType = $state<"terminal" | "vnc" | null>(null);
  let consolePassword = $state<string | null>(null);
  let consoleLoading = $state<boolean>(false);
  let consoleError = $state<string | null>(null);
  let terminalType = $state<"console" | "ssh" | null>(null);

  async function openConsole(item: LeaseInstance) {
    terminalType = "console";
    consoleTarget = item;
    consoleWsUrl = null;
    consoleTicket = null;
    consoleType = null;
    consolePassword = null;
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
      consoleType = data.consoleType;
      consolePassword = data.vncPassword ?? null;
    } catch (err: any) {
      consoleError = err.message || "An unexpected error occurred.";
    } finally {
      consoleLoading = false;
    }
  }

  async function openDetailConsole(item: LeaseInstance) {
    openIds = new Set();
    await tick();
    await openConsole(item);
  }

  async function openDetailSsh(item: LeaseInstance) {
    openIds = new Set();
    await tick();
    openSsh(item);
  }

  function closeConsole() {
    consoleTarget = null;
    consoleWsUrl = null;
    consoleTicket = null;
    consoleUser = null;
    consoleType = null;
    consolePassword = null;
    consoleLoading = false;
    consoleError = null;
    terminalType = null;
  }

  function openSsh(item: LeaseInstance) {
    consoleTarget = item;
    terminalType = "ssh";
  }

  import {
    matchesStatusFilter,
    type AdminStatusFilter,
    type AdminTypeFilter,
  } from "$lib/admin-stats";

  type Props = {
    items: LeaseInstance[];
    form: { error?: string; id?: string; recordId?: string } | null;
    provisioning?: boolean;
    progressMap?: Record<string, { status: string; error?: string }>;
    userId: string;
    filterTab?: AdminStatusFilter;
    typeFilter?: AdminTypeFilter;
  };

  let {
    items = [],
    form,
    provisioning = false,
    progressMap = {},
    userId,
    filterTab = $bindable<AdminStatusFilter>("all"),
    typeFilter = $bindable<AdminTypeFilter>("all"),
  }: Props = $props();

  // ---------------------------------------------------------------------
  // Open one request at a time so the queue stays visible while reviewing it.
  // ---------------------------------------------------------------------
  let openIds = $state<Set<string>>(new Set());
  function toggleDetail(id: string) {
    openIds = openIds.has(id) ? new Set() : new Set([id]);
  }
  const activeItem = $derived.by(() => items.find((item) => openIds.has(item.id)) ?? null);
  let dashboardTarget = $state<LeaseInstance | null>(null);

  async function openDashboard(item: LeaseInstance) {
    openIds = new Set();
    await tick();
    dashboardTarget = item;
  }

  // Search and status filters stay together so the queue is easy to scan.
  let searchQuery = $state("");
  const normalizedSearch = $derived(searchQuery.trim().toLocaleLowerCase());

  function searchableText(item: LeaseInstance): string {
    return [
      item.id,
      item.hostname,
      item.dns_name,
      item.IP,
      item.vmid,
      item.node,
      item.purpose_notes,
      item.ports,
      item.expand?.email?.name,
      item.expand?.email?.email,
      creatorEmail(item),
      creatorName(item),
      passionGroupName(item),
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
      .toLocaleLowerCase();
  }

  const filteredItems = $derived(
    items.filter((i) => {
      const matchesStatus = matchesStatusFilter(i, progressMap[i.id], filterTab);
      const matchesType = typeFilter === "all" || i.type === typeFilter;
      const matchesSearch = !normalizedSearch || searchableText(i).includes(normalizedSearch);
      return matchesStatus && matchesType && matchesSearch;
    }),
  );
  const filterCounts = $derived.by(() => {
    const c: Record<AdminStatusFilter, number> = {
      all: items.length,
      "need-action": 0,
      pending: 0,
      provisioning: 0,
      failed: 0,
      completed: 0,
      deleted: 0,
    };
    for (const i of items) {
      const status = leaseBadgeStatus(i, progressMap[i.id]);
      c[status]++;
      if (status === "pending" || status === "failed") c["need-action"]++;
    }
    return c;
  });

  const statusMeta: Record<LeaseBadgeStatus, { label: string }> = {
    failed: { label: "ผิดพลาด" },
    provisioning: { label: "กำลังทำงาน" },
    pending: { label: "รอดำเนินการ" },
    completed: { label: "เสร็จแล้ว" },
    deleted: { label: "เก็บเป็นประวัติ" },
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
    <div class="mb-3 flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
      <label class="relative block min-w-0 flex-1 sm:max-w-md">
        <span class="sr-only">ค้นหารายการคำขอ</span>
        <input
          type="search"
          bind:value={searchQuery}
          placeholder="ค้นหา hostname, อีเมล, VMID หรือ IP"
          class="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
          autocomplete="off"
        />
      </label>
      {#if normalizedSearch || typeFilter !== "all" || filterTab !== "all"}
        <span class="font-mono text-[11px] text-muted-foreground">
          พบ {filteredItems.length} จาก {items.length} รายการ
        </span>
      {/if}
    </div>

    <Tabs.Root bind:value={filterTab} class="mb-3 gap-3">
      <Tabs.List class="flex-wrap font-mono text-xs">
        <Tabs.Trigger value="all">ทั้งหมด ({filterCounts.all})</Tabs.Trigger>
        <Tabs.Trigger value="need-action"
          >ต้องดำเนินการ ({filterCounts["need-action"]})</Tabs.Trigger
        >
        <Tabs.Trigger value="pending"
          >รอดำเนินการ ({filterCounts.pending})</Tabs.Trigger
        >
        <Tabs.Trigger value="provisioning"
          >กำลังทำงาน ({filterCounts.provisioning})</Tabs.Trigger
        >
        <Tabs.Trigger value="failed"
          >ผิดพลาด ({filterCounts.failed})</Tabs.Trigger
        >
        <Tabs.Trigger value="completed"
          >เสร็จแล้ว ({filterCounts.completed})</Tabs.Trigger
        >
        <Tabs.Trigger value="deleted">ประวัติที่ลบ ({filterCounts.deleted})</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>

    {#if filteredItems.length === 0}
      <Empty.Root class="border border-dashed border-border bg-card">
        <Empty.Header>
          <Empty.Title
            class="font-mono text-xs uppercase tracking-widest text-muted-foreground"
          >
            ไม่พบรายการที่ตรงกับเงื่อนไข
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
                >สถานะ</Table.Head
              >
              <Table.Head class="p-4 font-bold text-muted-foreground"
                >คำขอ</Table.Head
              >
              <Table.Head class="p-4 font-bold text-muted-foreground"
                >ผู้ขอ</Table.Head
              >
              <Table.Head class="p-4 font-bold text-muted-foreground"
                >ทรัพยากร</Table.Head
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
                onkeydown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleDetail(item.id);
                  }
                }}
                role="button"
                tabindex={0}
                class={cn(
                  "cursor-pointer align-top transition-colors hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset",
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
                      badgeStatus === "deleted" &&
                        "border-border bg-muted text-muted-foreground",
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
                        badgeStatus === "deleted" && "bg-muted-foreground",
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
                    <Button
                      type="button"
                      variant={isActive ? "secondary" : "ghost"}
                      size="sm"
                      onclick={() => toggleDetail(item.id)}
                      class="font-mono"
                    >
                      {isActive ? "ปิดรายละเอียด" : "ดูรายละเอียด"}
                      {#if isActive}
                        <ChevronDown data-icon="inline-end" />
                      {:else}
                        <ChevronRight data-icon="inline-end" />
                      {/if}
                    </Button>
                  </div>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </div>
{/if}

<Dialog.Root
  open={!!activeItem}
  onOpenChange={(open) => {
    if (!open) openIds = new Set();
  }}
>
  <Dialog.Content showCloseButton={false} class="!w-[calc(100vw-1rem)] !max-w-4xl max-h-[calc(100dvh-1rem)] overflow-x-hidden overflow-y-auto p-0 sm:!w-[calc(100vw-2rem)]">
    {#if activeItem}
      <Dialog.Header class="sticky top-0 z-10 border-b border-border bg-card px-5 py-4 pr-14">
        <div class="min-w-0">
          <Dialog.Title class="truncate text-base font-semibold text-foreground">แก้ไขคำขอ · {activeItem.hostname}</Dialog.Title>
          <Dialog.Description class="sr-only">รายละเอียดคำขอ {activeItem.hostname}</Dialog.Description>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" class="absolute top-3 right-4" onclick={() => (openIds = new Set())} aria-label="ปิดรายละเอียด">
          <X />
        </Button>
      </Dialog.Header>
      <AdminLeaseDetail
        item={activeItem}
        {form}
        {provisioning}
        {progressMap}
        onOpenConsole={openDetailConsole}
        onOpenSsh={openDetailSsh}
        onOpenDashboard={openDashboard}
      />
    {/if}
  </Dialog.Content>
</Dialog.Root>

{#if dashboardTarget}
  <InstanceDashboard
    item={dashboardTarget}
    {userId}
    form={null}
    onClose={() => (dashboardTarget = null)}
    onConsole={openConsole}
    onSsh={openSsh}
  />
{/if}

<Dialog.Root
  open={!!(consoleTarget && terminalType)}
  onOpenChange={(o: boolean) => {
    if (!o) closeConsole();
  }}
>
  <Dialog.Content
    class="flex h-[calc(100dvh-1rem)] !w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:h-[92vh] sm:!w-[96vw] sm:!max-w-[96vw]"
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
      class="relative flex min-h-0 flex-1 items-center justify-center bg-zinc-950 p-1"
    >
      {#if terminalType === "ssh" && consoleTarget}
        <SshSessions
		  instanceId={consoleTarget.id}
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
      {:else if consoleWsUrl && consoleType === "vnc" && consolePassword}
        <ProxmoxVnc wsUrl={consoleWsUrl} password={consolePassword} onRetry={() => openConsole(consoleTarget!)} />
      {:else if consoleWsUrl && consoleType === "terminal" && consoleTicket && consoleUser}
        <ProxmoxTerminal
          wsUrl={consoleWsUrl}
          ticket={consoleTicket}
          user={consoleUser}
        />
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
