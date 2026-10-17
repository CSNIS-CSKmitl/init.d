import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function loadModule(path, dependencies = {}) {
	const source = readFileSync(new URL(path, import.meta.url), 'utf8');
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS }
	});
	const module = { exports: {} };
	new Function('require', 'module', 'exports', outputText)(
		(name) => {
			if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
			return dependencies[name];
		},
		module,
		module.exports
	);
	return module.exports;
}

const leaseStatus = loadModule('../src/lib/leaseStatus.ts');
const {
	ADMIN_TIME_RANGES,
	computeAdminStats,
	computeAdminTrend,
	filterInstancesByTimeRange,
	filterInstancesForDrilldown,
	parseInstanceTimestamp,
	toggleDrilldownFilter
} = loadModule('../src/lib/admin-stats.ts', {
	'./leaseStatus': leaseStatus
});

const fixedNow = new Date(2026, 9, 17, 15, 30, 0, 0); // Oct 17, 2026 15:30 local time

function makeInstance(overrides = {}) {
	return {
		id: overrides.id ?? 'inst-1',
		created: overrides.created ?? new Date(2026, 9, 17, 10, 0, 0).toISOString(),
		updated: overrides.updated ?? new Date(2026, 9, 17, 10, 0, 0).toISOString(),
		status: overrides.status ?? 'pending',
		provision_state: overrides.provision_state ?? '',
		type: overrides.type ?? 'vm',
		hostname: overrides.hostname ?? 'vm-test',
		specs: overrides.specs ?? { cpu: 2, ram: 4, disk: 20 },
		provision_started_at: overrides.provision_started_at,
		provision_completed_at: overrides.provision_completed_at
	};
}

test('computeAdminStats handles empty data and invalid fields safely', () => {
	const empty = computeAdminStats([], {}, { range: 'all', now: fixedNow });
	assert.equal(empty.total, 0);
	assert.equal(empty.needAction, 0);
	assert.equal(empty.vm, 0);
	assert.equal(empty.container, 0);
	assert.equal(empty.cpu, 0);
	assert.equal(empty.ram, 0);
	assert.equal(empty.disk, 0);
	assert.equal(empty.averageProvisionMinutes, 0);
	assert.equal(empty.provisionedCount, 0);
	assert.equal(empty.trend.length, 6);

	const malformed = computeAdminStats(
		[
			makeInstance({
				id: 'bad-1',
				created: 'not-a-date',
				specs: { cpu: Number.NaN, ram: -8, disk: null },
				provision_started_at: '2026-10-17T10:10:00.000Z',
				provision_completed_at: '2026-10-17T10:00:00.000Z' // completed before started
			})
		],
		{},
		{ range: 'all', now: fixedNow }
	);
	assert.equal(malformed.total, 1);
	assert.equal(malformed.cpu, 0);
	assert.equal(malformed.ram, 0);
	assert.equal(malformed.disk, 0);
	assert.equal(malformed.averageProvisionMinutes, 0);
	assert.equal(malformed.provisionedCount, 0);
});

test('computeAdminStats calculates status counts, VM vs Container, resources, and average provision minutes', () => {
	const items = [
		makeInstance({
			id: 'i1',
			status: 'pending',
			type: 'vm',
			specs: { cpu: 4, ram: 8, disk: 40 }
		}),
		makeInstance({
			id: 'i2',
			status: 'pending',
			provision_state: 'provisioning',
			type: 'container',
			specs: { cpu: 2, ram: 4, disk: 20 }
		}),
		makeInstance({
			id: 'i3',
			status: 'failed',
			provision_state: 'failed',
			type: 'vm',
			specs: { cpu: 8, ram: 16, disk: 80 }
		}),
		makeInstance({
			id: 'i4',
			status: 'completed',
			provision_state: 'completed',
			type: 'vm',
			specs: { cpu: 2, ram: 4, disk: 30 },
			provision_started_at: '2026-10-17T10:00:00.000Z',
			provision_completed_at: '2026-10-17T10:04:00.000Z' // 4 min
		}),
		makeInstance({
			id: 'i5',
			status: 'completed',
			provision_state: 'completed',
			type: 'container',
			specs: { cpu: 1, ram: 2, disk: 10 },
			provision_started_at: '2026-10-17 11:00:00.000Z', // PocketBase space format
			provision_completed_at: '2026-10-17 11:08:00.000Z' // 8 min
		}),
		makeInstance({
			id: 'i6',
			status: 'deleted',
			provision_state: 'deleted',
			type: 'container',
			specs: { cpu: 1, ram: 1, disk: 10 }
		})
	];

	const stats = computeAdminStats(items, {}, { range: 'all', now: fixedNow });
	assert.equal(stats.total, 6);
	assert.equal(stats.pending, 1);
	assert.equal(stats.provisioning, 1);
	assert.equal(stats.failed, 1);
	assert.equal(stats.completed, 2);
	assert.equal(stats.deleted, 1);
	assert.equal(stats.needAction, 2); // pending + failed
	assert.equal(stats.vm, 3);
	assert.equal(stats.container, 3);
	assert.equal(stats.cpu, 18);
	assert.equal(stats.ram, 35);
	assert.equal(stats.disk, 190);
	assert.equal(stats.provisionedCount, 2);
	assert.equal(stats.averageProvisionMinutes, 6); // (4 + 8) / 2
});

test('filterInstancesByTimeRange filters today, 7d, month, year, and all accurately', () => {
	assert.equal(ADMIN_TIME_RANGES.length, 5);
	const items = [
		makeInstance({ id: 'today', created: new Date(2026, 9, 17, 9, 0, 0).toISOString() }),
		makeInstance({ id: '3d-ago', created: new Date(2026, 9, 14, 12, 0, 0).toISOString() }),
		makeInstance({ id: 'this-month', created: new Date(2026, 9, 2, 12, 0, 0).toISOString() }),
		makeInstance({ id: 'this-year', created: new Date(2026, 2, 15, 12, 0, 0).toISOString() }),
		makeInstance({ id: 'last-year', created: new Date(2025, 11, 20, 12, 0, 0).toISOString() }),
		makeInstance({ id: 'invalid', created: 'invalid-date' })
	];

	assert.deepEqual(
		filterInstancesByTimeRange(items, 'today', fixedNow).map((i) => i.id),
		['today']
	);
	assert.deepEqual(
		filterInstancesByTimeRange(items, '7d', fixedNow).map((i) => i.id),
		['today', '3d-ago']
	);
	assert.deepEqual(
		filterInstancesByTimeRange(items, 'month', fixedNow).map((i) => i.id),
		['today', '3d-ago', 'this-month']
	);
	assert.deepEqual(
		filterInstancesByTimeRange(items, 'year', fixedNow).map((i) => i.id),
		['today', '3d-ago', 'this-month', 'this-year']
	);
	assert.equal(filterInstancesByTimeRange(items, 'all', fixedNow).length, 6);
});

test('computeAdminTrend builds buckets for each time range', () => {
	const items = [
		makeInstance({
			id: 't1',
			type: 'vm',
			created: new Date(2026, 9, 17, 9, 15, 0).toISOString()
		}),
		makeInstance({
			id: 't2',
			type: 'container',
			created: new Date(2026, 9, 17, 10, 45, 0).toISOString()
		}),
		makeInstance({
			id: 't3',
			type: 'vm',
			created: new Date(2026, 9, 15, 14, 0, 0).toISOString()
		})
	];

	const todayBuckets = computeAdminTrend(items, 'today', fixedNow);
	assert.equal(todayBuckets.length, 6);
	assert.equal(todayBuckets[2].vm, 1);
	assert.equal(todayBuckets[2].container, 1);
	assert.equal(todayBuckets[2].total, 2);

	const weekBuckets = computeAdminTrend(items, '7d', fixedNow);
	assert.equal(weekBuckets.length, 7);
	assert.equal(weekBuckets.reduce((sum, b) => sum + b.total, 0), 3);

	const yearBuckets = computeAdminTrend(items, 'year', fixedNow);
	assert.equal(yearBuckets.length, 12);
	assert.equal(yearBuckets[9].total, 3);
});

test('filterInstancesForDrilldown and toggleDrilldownFilter support status and type drill-downs', () => {
	const items = [
		makeInstance({ id: 'p-vm', status: 'pending', type: 'vm' }),
		makeInstance({ id: 'f-ct', status: 'failed', type: 'container' }),
		makeInstance({ id: 'c-vm', status: 'completed', type: 'vm' }),
		makeInstance({ id: 'c-ct', status: 'completed', type: 'container' })
	];

	assert.deepEqual(
		filterInstancesForDrilldown(items, {}, { status: 'need-action', now: fixedNow }).map(
			(i) => i.id
		),
		['p-vm', 'f-ct']
	);
	assert.deepEqual(
		filterInstancesForDrilldown(
			items,
			{},
			{ status: 'need-action', type: 'container', now: fixedNow }
		).map((i) => i.id),
		['f-ct']
	);
	assert.deepEqual(
		filterInstancesForDrilldown(items, {}, { status: 'completed', type: 'vm', now: fixedNow }).map(
			(i) => i.id
		),
		['c-vm']
	);

	assert.equal(toggleDrilldownFilter('all', 'need-action'), 'need-action');
	assert.equal(toggleDrilldownFilter('need-action', 'need-action'), 'all');
	assert.equal(toggleDrilldownFilter('vm', 'container'), 'container');
	assert.equal(toggleDrilldownFilter('container', 'container'), 'all');
	assert.equal(parseInstanceTimestamp(''), null);
});
