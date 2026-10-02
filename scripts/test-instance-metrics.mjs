import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/instance-metrics.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { liveMetricPoint, appendLiveMetricPoint } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function sample(time = 100, current = {}, extra = {}) {
	return {
		sampledAt: time, status: 'running', qmpstatus: 'running', node: 'pve1', vmid: 100,
		current: { cpu: 25, memory: 1024, uptime: time, netIn: 1000, netOut: 2000, ...current },
		points: [], ...extra
	};
}

test('network speed uses counter differences and the actual sampling interval', () => {
	const point = liveMetricPoint(sample(102.5, { netIn: 3500, netOut: 7000 }), sample());
	assert.equal(point.netIn, 1000);
	assert.equal(point.netOut, 2000);
	assert.equal(point.cpu, 25);
	assert.equal(point.memory, 1024);
});

test('first sample and missing counters show unknown speed instead of total traffic', () => {
	assert.equal(liveMetricPoint(sample(), null).netIn, null);
	assert.equal(liveMetricPoint(sample(102, { netIn: null }), sample()).netIn, null);
	assert.equal(liveMetricPoint(sample(102), sample(100, { netOut: null })).netOut, null);
});

test('reboots, migrations, counter resets and long gaps reset the network baseline', () => {
	for (const next of [
		sample(102, { uptime: 1, netIn: 2000 }),
		sample(102, { netIn: 2000 }, { node: 'pve2' }),
		sample(102, { netIn: 2000 }, { vmid: 101 }),
		sample(102, { netIn: 10 }),
		sample(120, { netIn: 2000 }),
		sample(100, { netIn: 2000 })
	]) assert.equal(liveMetricPoint(next, sample()).netIn, null);
});

test('stopped and paused machines show zero traffic and resume starts a new baseline', () => {
	for (const extra of [{ status: 'stopped' }, { qmpstatus: 'paused' }]) {
		const inactive = sample(102, {}, extra);
		const point = liveMetricPoint(inactive, sample());
		assert.equal(point.netIn, 0);
		assert.equal(point.netOut, 0);
		assert.equal(point.cpu, 0);
		assert.equal(liveMetricPoint(sample(104, { netIn: 4000 }), inactive).netIn, null);
	}
});

test('live history stays within five minutes and a bounded point count', () => {
	let points = [];
	for (let time = 0; time <= 600; time += 2) points = appendLiveMetricPoint(points, liveMetricPoint(sample(time), null));
	assert.equal(points.length, 151);
	assert.equal(points[0].time, 300);
	assert.equal(points.at(-1).time, 600);
});

test('a connection gap breaks the chart and duplicate samples cannot reorder it', () => {
	const points = [liveMetricPoint(sample(100), null)];
	const resumed = appendLiveMetricPoint(points, liveMetricPoint(sample(120), null));
	assert.equal(resumed.length, 3);
	assert.equal(resumed[1].cpu, null);
	assert.equal(resumed[1].memory, null);
	assert.equal(resumed[1].netIn, null);
	assert.equal(appendLiveMetricPoint(resumed, liveMetricPoint(sample(119), null)), resumed);
	assert.equal(appendLiveMetricPoint(resumed, liveMetricPoint(sample(120), null)), resumed);
});
