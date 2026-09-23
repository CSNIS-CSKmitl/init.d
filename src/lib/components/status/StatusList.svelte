<script lang="ts">
	import { tick } from 'svelte';
	import type { LeaseInstance } from '$lib/types';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import InstanceDashboard from './InstanceDashboard.svelte';
	import ProxmoxTerminal from './ProxmoxTerminal.svelte';
	import ProxmoxVnc from './ProxmoxVnc.svelte';
	import SshSessions from './SshSessions.svelte';
	import * as Empty from '$lib/components/ui/empty';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Inbox, Cpu, MemoryStick, HardDrive, Terminal, X } from '@lucide/svelte';

	let { items = [], userId, form }: { items: LeaseInstance[]; userId: string; form?: { id?: string; ownerError?: string; ownerEmails?: string } | null } = $props();
	let dashboardTarget = $state<LeaseInstance | null>(null);
	let consoleTarget = $state<LeaseInstance | null>(null);
	let consoleWsUrl = $state<string | null>(null);
	let consoleTicket = $state<string | null>(null);
	let consoleUser = $state<string | null>(null);
	let consoleType = $state<'terminal' | 'vnc' | null>(null);
	let consolePassword = $state<string | null>(null);
	let consoleLoading = $state(false);
	let consoleError = $state<string | null>(null);
	let terminalType = $state<'console' | 'ssh' | null>(null);

	async function openConsole(item: LeaseInstance) {
		terminalType = 'console';
		consoleTarget = item;
		consoleWsUrl = null;
		consoleTicket = null;
		consoleType = null;
		consolePassword = null;
		consoleLoading = true;
		consoleError = null;
		try {
			const response = await fetch('/api/console', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ instanceId: item.id })
			});
			const data = await response.json();
			if (!response.ok || !data.success || !data.wsUrl) throw new Error(data.error || 'ไม่สามารถเปิด Console ได้');
			if (data.consoleType !== 'vnc' && data.consoleType !== 'terminal') throw new Error('ชนิด Console ที่ Proxmox ส่งมาไม่ถูกต้อง');
			if (data.consoleType === 'vnc' && !data.vncPassword) throw new Error('Proxmox ไม่ส่งรหัส VNC มาให้ ลองอีกครั้ง');
			if (data.consoleType === 'terminal' && (!data.ticket || !data.user)) throw new Error('Proxmox ไม่ส่งข้อมูล Terminal มาให้ ลองอีกครั้ง');
			consoleWsUrl = data.wsUrl;
			consoleTicket = data.ticket;
			consoleUser = data.user;
			consoleType = data.consoleType;
			consolePassword = data.vncPassword ?? null;
		} catch (cause) {
			consoleError = cause instanceof Error ? cause.message : 'ไม่สามารถเปิด Console ได้';
		} finally {
			consoleLoading = false;
		}
	}

	function openSsh(item: LeaseInstance) {
		consoleTarget = item;
		terminalType = 'ssh';
	}

	// Let the dashboard dialog unmount before opening the terminal dialog.
	async function switchToConsole(item: LeaseInstance) {
		dashboardTarget = null;
		await tick();
		await openConsole(item);
	}

	async function switchToSsh(item: LeaseInstance) {
		dashboardTarget = null;
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

	function date(value: string) {
		return new Date(value).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
	}
</script>

{#if items.length === 0}
	<Empty.Root class="border border-dashed border-border bg-card">
		<Empty.Header>
			<Empty.Media variant="icon"><Inbox /></Empty.Media>
			<Empty.Title>ยังไม่มีคำขอ</Empty.Title>
			<Empty.Description>เมื่อส่งคำขอ VM/CT แล้วจะแสดงที่นี่</Empty.Description>
		</Empty.Header>
		<Empty.Content><Button href="/request">ขอเครื่อง</Button></Empty.Content>
	</Empty.Root>
{:else}
	<div class="space-y-3 md:hidden">
		{#each items as item (item.id)}
			<button type="button" onclick={() => (dashboardTarget = item)} aria-haspopup="dialog" class="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/30">
				<div class="flex items-start justify-between gap-2"><span class="break-all font-mono text-sm font-semibold text-primary">{item.hostname}</span><StatusBadge status={item.status} /></div>
				<p class="mt-1 text-xs text-muted-foreground">{item.os_template} · {item.type === 'vm' ? 'VM' : 'CT'}</p>
				<div class="mt-3 flex flex-wrap gap-3 text-xs text-foreground"><span class="inline-flex items-center gap-1"><Cpu class="size-3 text-muted-foreground" />{item.specs.cpu}C</span><span class="inline-flex items-center gap-1"><MemoryStick class="size-3 text-muted-foreground" />{item.specs.ram}G</span><span class="inline-flex items-center gap-1"><HardDrive class="size-3 text-muted-foreground" />{item.specs.disk}G</span></div>
				<p class="mt-3 text-xs text-muted-foreground">แตะเพื่อดูรายละเอียด{item.status === 'completed' ? 'และจัดการเครื่อง' : ''}</p>
			</button>
		{/each}
	</div>

	<div class="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
		<Table.Root class="min-w-[800px]">
			<Table.Header><Table.Row>
				<Table.Head>HOSTNAME</Table.Head><Table.Head>TYPE</Table.Head><Table.Head>SPECS</Table.Head><Table.Head>LEASE</Table.Head><Table.Head class="text-right">STATUS</Table.Head>
			</Table.Row></Table.Header>
			<Table.Body>
				{#each items as item (item.id)}
					<Table.Row
						role="button"
						tabindex={0}
						aria-label={`เปิดรายละเอียด ${item.hostname}`}
						aria-haspopup="dialog"
						class="cursor-pointer hover:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
						onclick={() => (dashboardTarget = item)}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								dashboardTarget = item;
							}
						}}
					>
						<Table.Cell><span class="font-mono text-sm text-primary">{item.hostname}</span><p class="mt-1 text-xs text-muted-foreground">{item.os_template}</p></Table.Cell>
						<Table.Cell><Badge variant="outline">{item.type}</Badge><p class="mt-1 text-xs text-muted-foreground">{item.network_type}</p></Table.Cell>
						<Table.Cell class="text-sm"><div class="flex items-center gap-3"><span class="inline-flex items-center gap-1"><Cpu class="size-3" />{item.specs.cpu}</span><span class="inline-flex items-center gap-1"><MemoryStick class="size-3" />{item.specs.ram}G</span><span class="inline-flex items-center gap-1"><HardDrive class="size-3" />{item.specs.disk}G</span></div></Table.Cell>
						<Table.Cell class="text-sm">{date(item.start_date)} → {date(item.end_date)}</Table.Cell>
						<Table.Cell class="text-right"><StatusBadge status={item.status} /><div class="mt-2"><span class="inline-flex rounded-md border border-border px-3 py-1.5 text-xs">{item.status === 'completed' ? 'จัดการเครื่อง' : 'รายละเอียด'}</span></div></Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/if}

{#if dashboardTarget}
	<InstanceDashboard item={dashboardTarget} {userId} {form} onClose={() => (dashboardTarget = null)} onConsole={switchToConsole} onSsh={switchToSsh} />
{/if}

<Dialog.Root open={!!(consoleTarget && terminalType)} onOpenChange={(open) => { if (!open) closeConsole(); }}>
	<Dialog.Content showCloseButton={false} class="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-2xl sm:max-w-[96vw]">
		{#if consoleTarget && terminalType}
			<Dialog.Header class="flex-row items-center justify-between gap-2.5 space-y-0 border-b border-border bg-muted px-4 py-3 sm:px-6">
				<div class="flex min-w-0 items-center gap-2.5"><Terminal class="size-4 text-primary" /><div class="min-w-0"><Dialog.Title class="truncate font-mono text-sm font-semibold">{consoleTarget.hostname} {terminalType === 'ssh' ? 'SSH Terminal' : 'Console'}</Dialog.Title><p class="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">NODE: {consoleTarget.node} · VMID: {consoleTarget.vmid} · TYPE: {consoleTarget.type}</p></div></div>
				<Button variant="ghost" size="icon-sm" onclick={closeConsole} aria-label="Close terminal"><X /></Button>
			</Dialog.Header>
			<div class="relative flex min-h-0 flex-1 items-center justify-center bg-zinc-950 p-1">
				{#if terminalType === 'ssh'}
					<SshSessions defaultHost={consoleTarget.dns_name || consoleTarget.hostname} defaultIP={consoleTarget.IP} defaultUsername="root" />
				{:else if consoleLoading}
					<div class="flex flex-col items-center gap-3 p-8 text-center"><Spinner class="size-8 text-primary" /><p class="font-mono text-xs text-zinc-400">กำลังเชื่อมต่อ Proxmox Console...</p></div>
				{:else if consoleError}
					<div class="max-w-md space-y-4 p-8 text-center"><p class="text-sm font-medium text-destructive">{consoleError}</p><p class="text-xs text-zinc-400">ตรวจว่าเครื่องกำลังทำงานและ Proxmox เข้าถึงได้</p><div class="flex justify-center gap-2"><Button variant="outline" size="sm" onclick={() => openConsole(consoleTarget!)}>ลองอีกครั้ง</Button><Button variant="outline" size="sm" onclick={closeConsole}>ปิด</Button></div></div>
				{:else if consoleWsUrl && consoleType === 'vnc' && consolePassword}
					<ProxmoxVnc wsUrl={consoleWsUrl} password={consolePassword} onRetry={() => openConsole(consoleTarget!)} />
				{:else if consoleWsUrl && consoleType === 'terminal' && consoleTicket && consoleUser}
					<ProxmoxTerminal wsUrl={consoleWsUrl} ticket={consoleTicket} user={consoleUser} />
				{/if}
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
