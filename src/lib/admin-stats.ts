import { leaseBadgeStatus, type LeaseBadgeStatus, type LeaseProgress } from './leaseStatus';
import type { InstanceType, LeaseInstance } from './types';

export type AdminTimeRange = 'today' | '7d' | 'month' | 'year' | 'all';
export type AdminStatusFilter = 'all' | 'need-action' | LeaseBadgeStatus;
export type AdminTypeFilter = 'all' | InstanceType;

export interface AdminTrendBucket {
	key: string;
	label: string;
	vm: number;
	container: number;
	total: number;
}

export interface AdminStatsSummary {
	total: number;
	pending: number;
	provisioning: number;
	failed: number;
	completed: number;
	deleted: number;
	needAction: number;
	vm: number;
	container: number;
	cpu: number;
	ram: number;
	disk: number;
	averageProvisionMinutes: number;
	provisionedCount: number;
	trend: AdminTrendBucket[];
}

export const ADMIN_TIME_RANGES: ReadonlyArray<{ value: AdminTimeRange; label: string }> = [
	{ value: 'today', label: 'วันนี้' },
	{ value: '7d', label: '7 วัน' },
	{ value: 'month', label: 'เดือนนี้' },
	{ value: 'year', label: 'ปีนี้' },
	{ value: 'all', label: 'ทั้งหมด' }
];

const THAI_MONTHS_SHORT = [
	'ม.ค.',
	'ก.พ.',
	'มี.ค.',
	'เม.ย.',
	'พ.ค.',
	'มิ.ย.',
	'ก.ค.',
	'ส.ค.',
	'ก.ย.',
	'ต.ค.',
	'พ.ย.',
	'ธ.ค.'
];

export function parseInstanceTimestamp(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const normalized = trimmed.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');
	const ms = Date.parse(normalized);
	return Number.isFinite(ms) ? ms : null;
}

export function getTimeRangeBounds(
	range: AdminTimeRange,
	now: Date = new Date()
): { startMs: number | null; endMs: number | null } {
	if (range === 'all') {
		return { startMs: null, endMs: null };
	}
	const endMs = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		23,
		59,
		59,
		999
	).getTime();

	if (range === 'today') {
		const startMs = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate(),
			0,
			0,
			0,
			0
		).getTime();
		return { startMs, endMs };
	}

	if (range === '7d') {
		const startMs = new Date(
			now.getFullYear(),
			now.getMonth(),
			now.getDate() - 6,
			0,
			0,
			0,
			0
		).getTime();
		return { startMs, endMs };
	}

	if (range === 'month') {
		const startMs = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
		return { startMs, endMs };
	}

	const startMs = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime();
	return { startMs, endMs };
}

export function filterInstancesByTimeRange<T extends { created?: string }>(
	items: readonly T[],
	range: AdminTimeRange,
	now: Date = new Date()
): T[] {
	if (!Array.isArray(items) || items.length === 0) return [];
	if (range === 'all') return [...items];

	const { startMs, endMs } = getTimeRangeBounds(range, now);
	return items.filter((item) => {
		const createdMs = parseInstanceTimestamp(item?.created);
		if (createdMs === null) return false;
		if (startMs !== null && createdMs < startMs) return false;
		if (endMs !== null && createdMs > endMs) return false;
		return true;
	});
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

export function computeAdminTrend(
	items: readonly Pick<LeaseInstance, 'created' | 'type'>[],
	range: AdminTimeRange = 'all',
	now: Date = new Date()
): AdminTrendBucket[] {
	const safeItems = Array.isArray(items) ? items : [];

	if (range === 'today') {
		const buckets: AdminTrendBucket[] = [
			{ key: '00-04', label: '00:00', vm: 0, container: 0, total: 0 },
			{ key: '04-08', label: '04:00', vm: 0, container: 0, total: 0 },
			{ key: '08-12', label: '08:00', vm: 0, container: 0, total: 0 },
			{ key: '12-16', label: '12:00', vm: 0, container: 0, total: 0 },
			{ key: '16-20', label: '16:00', vm: 0, container: 0, total: 0 },
			{ key: '20-24', label: '20:00', vm: 0, container: 0, total: 0 }
		];
		for (const item of safeItems) {
			const ms = parseInstanceTimestamp(item?.created);
			if (ms === null) continue;
			const d = new Date(ms);
			if (
				d.getFullYear() !== now.getFullYear() ||
				d.getMonth() !== now.getMonth() ||
				d.getDate() !== now.getDate()
			) {
				continue;
			}
			const idx = Math.min(5, Math.max(0, Math.floor(d.getHours() / 4)));
			if (item.type === 'vm') buckets[idx].vm++;
			else if (item.type === 'container') buckets[idx].container++;
			buckets[idx].total = buckets[idx].vm + buckets[idx].container;
		}
		return buckets;
	}

	if (range === '7d') {
		const buckets: AdminTrendBucket[] = [];
		const map = new Map<string, AdminTrendBucket>();
		for (let i = 6; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
			const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
			const label = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
			const bucket: AdminTrendBucket = { key, label, vm: 0, container: 0, total: 0 };
			buckets.push(bucket);
			map.set(key, bucket);
		}
		for (const item of safeItems) {
			const ms = parseInstanceTimestamp(item?.created);
			if (ms === null) continue;
			const d = new Date(ms);
			const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
			const bucket = map.get(key);
			if (!bucket) continue;
			if (item.type === 'vm') bucket.vm++;
			else if (item.type === 'container') bucket.container++;
			bucket.total = bucket.vm + bucket.container;
		}
		return buckets;
	}

	if (range === 'month') {
		const year = now.getFullYear();
		const month = now.getMonth();
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const buckets: AdminTrendBucket[] = [];
		for (let day = 1; day <= daysInMonth; day++) {
			const key = `${year}-${pad2(month + 1)}-${pad2(day)}`;
			buckets.push({ key, label: String(day), vm: 0, container: 0, total: 0 });
		}
		for (const item of safeItems) {
			const ms = parseInstanceTimestamp(item?.created);
			if (ms === null) continue;
			const d = new Date(ms);
			if (d.getFullYear() !== year || d.getMonth() !== month) continue;
			const bucket = buckets[d.getDate() - 1];
			if (!bucket) continue;
			if (item.type === 'vm') bucket.vm++;
			else if (item.type === 'container') bucket.container++;
			bucket.total = bucket.vm + bucket.container;
		}
		return buckets;
	}

	if (range === 'year') {
		const year = now.getFullYear();
		const buckets: AdminTrendBucket[] = THAI_MONTHS_SHORT.map((label, idx) => ({
			key: `${year}-${pad2(idx + 1)}`,
			label,
			vm: 0,
			container: 0,
			total: 0
		}));
		for (const item of safeItems) {
			const ms = parseInstanceTimestamp(item?.created);
			if (ms === null) continue;
			const d = new Date(ms);
			if (d.getFullYear() !== year) continue;
			const bucket = buckets[d.getMonth()];
			if (!bucket) continue;
			if (item.type === 'vm') bucket.vm++;
			else if (item.type === 'container') bucket.container++;
			bucket.total = bucket.vm + bucket.container;
		}
		return buckets;
	}

	// range === 'all': last 6 months up to `now` (or expanded up to 12 months if items span earlier months)
	const buckets: AdminTrendBucket[] = [];
	const map = new Map<string, AdminTrendBucket>();
	for (let i = 5; i >= 0; i--) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
		const shortYear = String(d.getFullYear() + 543).slice(-2);
		const label = `${THAI_MONTHS_SHORT[d.getMonth()]} ${shortYear}`;
		const bucket: AdminTrendBucket = { key, label, vm: 0, container: 0, total: 0 };
		buckets.push(bucket);
		map.set(key, bucket);
	}
	for (const item of safeItems) {
		const ms = parseInstanceTimestamp(item?.created);
		if (ms === null) continue;
		const d = new Date(ms);
		const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
		let bucket = map.get(key);
		if (!bucket) {
			const shortYear = String(d.getFullYear() + 543).slice(-2);
			const label = `${THAI_MONTHS_SHORT[d.getMonth()]} ${shortYear}`;
			bucket = { key, label, vm: 0, container: 0, total: 0 };
			map.set(key, bucket);
			buckets.push(bucket);
		}
		if (item.type === 'vm') bucket.vm++;
		else if (item.type === 'container') bucket.container++;
		bucket.total = bucket.vm + bucket.container;
	}
	buckets.sort((a, b) => a.key.localeCompare(b.key));
	return buckets.slice(-12);
}

export function computeAdminStats(
	items: readonly LeaseInstance[],
	progressMap: Record<string, LeaseProgress> = {},
	options: { range?: AdminTimeRange; now?: Date } = {}
): AdminStatsSummary {
	const range = options.range ?? 'all';
	const now = options.now ?? new Date();
	const filtered = filterInstancesByTimeRange(items ?? [], range, now);

	const counts: AdminStatsSummary = {
		total: filtered.length,
		pending: 0,
		provisioning: 0,
		failed: 0,
		completed: 0,
		deleted: 0,
		needAction: 0,
		vm: 0,
		container: 0,
		cpu: 0,
		ram: 0,
		disk: 0,
		averageProvisionMinutes: 0,
		provisionedCount: 0,
		trend: []
	};

	const durationsMs: number[] = [];

	for (const item of filtered) {
		const badge = leaseBadgeStatus(item, progressMap?.[item.id]);
		counts[badge]++;

		if (item.type === 'vm') counts.vm++;
		else if (item.type === 'container') counts.container++;

		const cpu = Number(item.specs?.cpu);
		const ram = Number(item.specs?.ram);
		const disk = Number(item.specs?.disk);
		if (Number.isFinite(cpu) && cpu > 0) counts.cpu += cpu;
		if (Number.isFinite(ram) && ram > 0) counts.ram += ram;
		if (Number.isFinite(disk) && disk > 0) counts.disk += disk;

		const started = parseInstanceTimestamp(item.provision_started_at);
		const completed = parseInstanceTimestamp(item.provision_completed_at);
		if (started !== null && completed !== null && completed >= started) {
			durationsMs.push(completed - started);
		}
	}

	counts.needAction = counts.pending + counts.failed;
	counts.provisionedCount = durationsMs.length;
	counts.averageProvisionMinutes = durationsMs.length
		? Math.round(durationsMs.reduce((sum, value) => sum + value, 0) / durationsMs.length / 60000)
		: 0;
	counts.trend = computeAdminTrend(filtered, range, now);

	return counts;
}

export function matchesStatusFilter(
	item: Pick<LeaseInstance, 'status' | 'provision_state'>,
	progress: LeaseProgress,
	statusFilter: AdminStatusFilter
): boolean {
	if (statusFilter === 'all') return true;
	const badge = leaseBadgeStatus(item, progress);
	if (statusFilter === 'need-action') {
		return badge === 'pending' || badge === 'failed';
	}
	return badge === statusFilter;
}

export function filterInstancesForDrilldown(
	items: readonly LeaseInstance[],
	progressMap: Record<string, LeaseProgress> = {},
	filters: {
		range?: AdminTimeRange;
		status?: AdminStatusFilter;
		type?: AdminTypeFilter;
		now?: Date;
	} = {}
): LeaseInstance[] {
	const range = filters.range ?? 'all';
	const status = filters.status ?? 'all';
	const type = filters.type ?? 'all';
	const now = filters.now ?? new Date();

	const inRange = filterInstancesByTimeRange(items ?? [], range, now);
	return inRange.filter((item) => {
		if (!matchesStatusFilter(item, progressMap?.[item.id], status)) return false;
		if (type !== 'all' && item.type !== type) return false;
		return true;
	});
}

export function toggleDrilldownFilter<T extends string>(
	current: T,
	clicked: T,
	fallback: T = 'all' as T
): T {
	return current === clicked ? fallback : clicked;
}
