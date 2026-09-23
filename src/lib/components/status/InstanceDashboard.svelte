<script lang="ts">
	import { onMount } from 'svelte';
	import type { InstanceMetrics, LeaseInstance } from '$lib/types';
	import { passionGroupName } from '$lib/types';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import MetricChart from './MetricChart.svelte';
	import OwnerManager from './OwnerManager.svelte';
	import { RefreshCw, Terminal, Power, RotateCw, Pause, Play, Square, Monitor } from '@lucide/svelte';

	let {
		item,
		userId,
		form,
		onClose,
		onConsole,
		onSsh
	}: {
		item: LeaseInstance;
		userId: string;
		form?: { id?: string; ownerError?: string; ownerEmails?: string } | null;
		onClose: () => void;
		onConsole: (item: LeaseInstance) => void;
		onSsh: (item: LeaseInstance) => void;
	} = $props();

	type PowerAction = 'start' | 'shutdown' | 'reboot' | 'stop' | 'reset' | 'suspend' | 'resume' | 'hibernate';
	let metrics = $state<InstanceMetrics | null>(null);
	let loading = $state(true);
	let refreshing = $state(false);
	let refreshVersion = 0;
	let loadError = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let actionLoading = $state<PowerAction | null>(null);
	let timeframe = $state<'hour' | 'day' | 'week' | 'month' | 'year'>('hour');

	let paused = $derived(metrics?.qmpstatus === 'paused');
	let running = $derived(metrics?.status === 'running');
	let vm = $derived(item.type === 'vm');
	let ready = $derived(item.status === 'completed' && !!item.vmid);
	let latest = $derived(metrics?.points.findLast((point) => point.netIn !== null || point.netOut !== null) ?? null);

	function bytes(value: number | null | undefined) {
		if (value === null || value === undefined) return '—';
		if (value < 1024) return `${Math.round(value)} B`;
		const units = ['KiB', 'MiB', 'GiB', 'TiB'];
		let amount = value;
		let index = -1;
		do { amount /= 1024; index++; } while (amount >= 1024 && index < units.length - 1);
		return `${amount.toFixed(amount < 10 ? 2 : 1)} ${units[index]}`;
	}

	function uptime(seconds: number | null | undefined) {
		if (seconds === null || seconds === undefined) return '—';
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		return days ? `${days} วัน ${hours} ชม.` : `${hours} ชม. ${minutes} นาที`;
	}

	async function refresh() {
		if (!ready) return;
		const version = ++refreshVersion;
		const selectedTimeframe = timeframe;
		refreshing = true;
		loadError = null;
		try {
			const response = await fetch(`/api/instance-metrics?instanceId=${encodeURIComponent(item.id)}&timeframe=${selectedTimeframe}`);
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || data.message || 'โหลดสถานะเครื่องไม่สำเร็จ');
			if (version === refreshVersion) metrics = data as InstanceMetrics;
		} catch (e) {
			if (version === refreshVersion) loadError = e instanceof Error ? e.message : 'โหลดสถานะเครื่องไม่สำเร็จ';
		} finally {
			if (version === refreshVersion) {
				loading = false;
				refreshing = false;
			}
		}
	}

	onMount(() => {
		if (ready) void refresh(); else loading = false;
		const timer = window.setInterval(() => { if (ready && !actionLoading && !refreshing) void refresh(); }, 30_000);
		return () => window.clearInterval(timer);
	});

	async function pollTask(upid: string) {
		for (let attempt = 0; attempt < 60; attempt++) {
			await new Promise((resolve) => setTimeout(resolve, 2000));
			const response = await fetch(`/api/instance-power/task?instanceId=${encodeURIComponent(item.id)}&upid=${encodeURIComponent(upid)}`);
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || data.message || 'ตรวจงานใน Proxmox ไม่สำเร็จ');
			if (data.status === 'stopped') {
				if (data.exitstatus !== 'OK') throw new Error(`Proxmox: ${data.exitstatus || 'คำสั่งล้มเหลว'}`);
				return;
			}
		}
		throw new Error('คำสั่งใช้เวลานานเกินไป กรุณารีเฟรชสถานะก่อนลองอีกครั้ง');
	}

	async function power(action: PowerAction) {
		const prompts: Partial<Record<PowerAction, string>> = {
			shutdown: 'ปิดเครื่องอย่างปลอดภัย? งานที่กำลังทำอาจหยุดลง',
			reboot: 'รีบูตเครื่อง? การเชื่อมต่อจะถูกตัดชั่วคราว',
			stop: 'บังคับหยุดเครื่องทันที? ข้อมูลที่ยังไม่บันทึกอาจสูญหาย',
			reset: 'บังคับรีเซ็ต VM ทันที? ข้อมูลที่ยังไม่บันทึกอาจสูญหาย',
			suspend: 'พักการทำงานของ VM?',
			hibernate: 'Hibernate VM ลงดิสก์? ต้องมีพื้นที่เก็บสถานะเพียงพอและการเชื่อมต่อจะถูกตัด'
		};
		if (prompts[action] && !window.confirm(prompts[action])) return;
		actionLoading = action;
		actionError = null;
		try {
			const response = await fetch('/api/instance-power', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ instanceId: item.id, action })
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || data.message || 'ส่งคำสั่งไม่สำเร็จ');
			if (data.upid) await pollTask(data.upid);
		} catch (e) {
			actionError = e instanceof Error ? e.message : 'ส่งคำสั่งไม่สำเร็จ';
		} finally {
			actionLoading = null;
			await refresh();
		}
	}

	function openConsole() { onConsole(item); }
	function openSsh() { onSsh(item); }
	let ports = $derived((item.ports ?? '').split(',').map((part) => part.trim()).filter(Boolean));
</script>

<Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
	<Dialog.Content class="max-h-[92vh] w-[min(96vw,1120px)] max-w-[96vw] gap-5 overflow-y-auto p-4 sm:max-w-[1120px] sm:p-6">
		<Dialog.Header>
			<div class="flex flex-wrap items-start justify-between gap-3 pr-8">
				<div>
					<Dialog.Title class="break-all font-mono text-xl">{item.hostname}</Dialog.Title>
					<Dialog.Description class="mt-1">{vm ? 'Virtual Machine' : 'Container'}{ready ? ` · VMID ${item.vmid} · ${metrics?.node ?? item.node ?? '—'}` : ' · รอดำเนินการ'}</Dialog.Description>
				</div>
				<Badge variant={running ? 'default' : 'secondary'}>{ready ? (loading ? 'กำลังโหลด' : paused ? 'paused' : metrics?.status ?? 'unknown') : item.status}</Badge>
			</div>
		</Dialog.Header>

		{#if ready}<div class="flex flex-wrap gap-2 border-b border-border pb-4">
			<Button size="sm" onclick={openConsole} disabled={!!metrics && (!running || paused)}><Monitor class="size-4" /> Console</Button>
			<Button size="sm" variant="outline" onclick={openSsh} disabled={!!metrics && (!running || paused)}><Terminal class="size-4" /> SSH</Button>
			<div class="mx-1 hidden w-px bg-border sm:block"></div>
			{#if metrics}
				{#if metrics.status === 'stopped'}
					<Button size="sm" variant="outline" onclick={() => power('start')} disabled={!!actionLoading}><Power class="size-4" /> Start</Button>
				{:else if paused}
					<Button size="sm" variant="outline" onclick={() => power('resume')} disabled={!!actionLoading}><Play class="size-4" /> Resume</Button>
				{:else if running}
					<Button size="sm" variant="outline" onclick={() => power('shutdown')} disabled={!!actionLoading}><Power class="size-4" /> Shutdown</Button>
					<Button size="sm" variant="outline" onclick={() => power('reboot')} disabled={!!actionLoading}><RotateCw class="size-4" /> Reboot</Button>
					{#if vm}<Button size="sm" variant="outline" onclick={() => power('suspend')} disabled={!!actionLoading}><Pause class="size-4" /> Pause</Button>{/if}
					{#if vm}<Button size="sm" variant="outline" onclick={() => power('hibernate')} disabled={!!actionLoading}><Pause class="size-4" /> Hibernate</Button>{/if}
					<Button size="sm" variant="outline" onclick={() => power('stop')} disabled={!!actionLoading} class="text-destructive"><Square class="size-4" /> Force Stop</Button>
					{#if vm}<Button size="sm" variant="outline" onclick={() => power('reset')} disabled={!!actionLoading} class="text-destructive"><RotateCw class="size-4" /> Reset</Button>{/if}
				{/if}
			{/if}
			<Button size="sm" variant="ghost" onclick={() => refresh()} disabled={refreshing || !!actionLoading} aria-label="รีเฟรชสถานะ"><RefreshCw class={refreshing ? 'size-4 animate-spin' : 'size-4'} /></Button>
		</div>{/if}

		{#if actionLoading}<p class="flex items-center gap-2 text-xs text-primary" role="status"><Spinner class="size-4" /> กำลังทำคำสั่ง {actionLoading}…</p>{/if}
		{#if actionError}<p class="text-sm text-destructive" role="alert">{actionError}</p>{/if}
		{#if loadError}<p class="text-sm text-destructive" role="alert">{loadError}</p>{/if}

		{#if loading}
			<div class="flex min-h-52 items-center justify-center gap-2 text-muted-foreground"><Spinner class="size-5" /> กำลังโหลดสถิติ...</div>
	{:else if metrics}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div class="rounded-lg border border-border bg-muted/30 p-3"><p class="text-xs text-muted-foreground">CPU</p><p class="mt-1 text-lg font-semibold">{metrics.current.cpu?.toFixed(1) ?? '—'}%</p><p class="text-xs text-muted-foreground">{metrics.current.cpus ?? item.specs.cpu} vCPU</p></div>
				<div class="rounded-lg border border-border bg-muted/30 p-3"><p class="text-xs text-muted-foreground">Memory</p><p class="mt-1 text-lg font-semibold">{bytes(metrics.current.memory)}</p><p class="text-xs text-muted-foreground">จาก {bytes(metrics.current.maxMemory)}</p></div>
				<div class="rounded-lg border border-border bg-muted/30 p-3"><p class="text-xs text-muted-foreground">Network</p><p class="mt-1 text-sm font-semibold">↓ {bytes(latest?.netIn)}/s</p><p class="text-xs text-muted-foreground">↑ {bytes(latest?.netOut)}/s</p></div>
				<div class="rounded-lg border border-border bg-muted/30 p-3"><p class="text-xs text-muted-foreground">Uptime / Disk</p><p class="mt-1 text-sm font-semibold">{uptime(metrics.current.uptime)}</p><p class="text-xs text-muted-foreground">{vm ? `Disk ${bytes(metrics.current.maxDisk)}` : `${bytes(metrics.current.disk)} / ${bytes(metrics.current.maxDisk)}`}</p></div>
			</div>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-xs text-muted-foreground">สถิติจาก Proxmox · รีเฟรชทุก 30 วินาที</p>
				<label class="flex items-center gap-2 text-xs text-muted-foreground">ช่วงเวลา
					<select bind:value={timeframe} onchange={() => refresh()} class="rounded-md border border-border bg-background px-2 py-1.5 text-foreground">
						<option value="hour">1 ชั่วโมง</option><option value="day">1 วัน</option><option value="week">1 สัปดาห์</option><option value="month">1 เดือน</option><option value="year">1 ปี</option>
					</select>
				</label>
			</div>
			{#if metrics.chartError}<p class="text-xs text-muted-foreground">{metrics.chartError}</p>{/if}
			<div class="grid gap-3 lg:grid-cols-2">
				<MetricChart title="CPU Usage" times={metrics.points.map((p) => p.time)} series={[{ label: 'CPU', color: '#a3e635', values: metrics.points.map((p) => p.cpu) }]} maxValue={Math.min(100, Math.max(5, ...metrics.points.map((p) => (p.cpu ?? 0) * 1.2)))} formatValue={(value) => `${value.toFixed(0)}%`} />
				<MetricChart title="Memory Usage" times={metrics.points.map((p) => p.time)} series={[{ label: 'Used', color: '#38bdf8', values: metrics.points.map((p) => p.memory) }]} maxValue={metrics.current.maxMemory ?? undefined} formatValue={bytes} />
				<MetricChart title="Network Traffic" times={metrics.points.map((p) => p.time)} series={[{ label: 'Incoming', color: '#a3e635', values: metrics.points.map((p) => p.netIn) }, { label: 'Outgoing', color: '#38bdf8', values: metrics.points.map((p) => p.netOut) }]} formatValue={(value) => `${bytes(value)}/s`} />
			</div>
		{/if}

		<section class="space-y-4 border-t border-border pt-4" aria-label="รายละเอียดคำขอ">
			<h3 class="text-sm font-semibold">รายละเอียดคำขอ</h3>
			{#if item.admin_reply}
				<div class="rounded-lg border border-border bg-muted/40 p-3"><p class="text-xs font-semibold text-primary">ข้อความจากแอดมิน</p><p class="mt-1 whitespace-pre-wrap text-sm">{item.admin_reply}</p></div>
			{/if}
			<div class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
				<div><p class="text-xs text-muted-foreground">Network</p><p>{item.network_type} · {item.dns_name || 'ไม่มี DNS'}</p>{#if item.IP}<p class="text-xs text-muted-foreground">IP {item.IP}</p>{/if}</div>
				<div><p class="text-xs text-muted-foreground">Open ports</p><p>{ports.join(', ') || '—'}</p></div>
				<div><p class="text-xs text-muted-foreground">Group</p><p>{passionGroupName(item)}</p></div>
			</div>
			<div><p class="text-xs text-muted-foreground">Purpose notes</p><p class="mt-1 whitespace-pre-wrap text-sm">{item.purpose_notes || '—'}</p></div>
			<OwnerManager {item} {userId} {form} />
			{#if item.status === 'pending'}
				<div class="flex flex-wrap gap-2">
					<Button href={`/request?edit=${item.id}`} variant="outline" size="sm">แก้คำขอ</Button>
					<form method="POST" action="?/cancel" onsubmit={(event) => { if (!window.confirm('ยกเลิกคำขอนี้?')) event.preventDefault(); }}>
						<input type="hidden" name="id" value={item.id} />
						<Button type="submit" variant="outline" size="sm" class="text-destructive">ยกเลิกคำขอ</Button>
					</form>
				</div>
			{/if}
		</section>
	</Dialog.Content>
</Dialog.Root>
