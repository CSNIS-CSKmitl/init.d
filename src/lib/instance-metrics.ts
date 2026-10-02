import type { InstanceMetricPoint, InstanceMetrics } from './types.ts';

export const METRICS_POLL_MS = 2000;
export const LIVE_WINDOW_SECONDS = 300;

export function liveMetricPoint(sample: InstanceMetrics, previous: InstanceMetrics | null): InstanceMetricPoint {
	const elapsed = previous ? sample.sampledAt - previous.sampledAt : 0;
	const active = sample.status === 'running' && sample.qmpstatus !== 'paused';
	const sameRun = previous !== null && previous.status === 'running' && previous.qmpstatus !== 'paused'
		&& previous.node === sample.node && previous.vmid === sample.vmid
		&& sample.current.uptime !== null && previous.current.uptime !== null
		&& sample.current.uptime >= previous.current.uptime && elapsed > 0 && elapsed <= 15;
	function rate(current: number | null, before: number | null | undefined) {
		if (!active) return 0;
		if (!sameRun || current === null || before == null || current < before) return null;
		return (current - before) / elapsed;
	}
	return {
		time: sample.sampledAt,
		cpu: active ? sample.current.cpu : 0,
		memory: sample.current.memory,
		netIn: rate(sample.current.netIn, previous?.current.netIn),
		netOut: rate(sample.current.netOut, previous?.current.netOut)
	};
}

export function appendLiveMetricPoint(points: InstanceMetricPoint[], point: InstanceMetricPoint): InstanceMetricPoint[] {
	// Preserve gaps after a suspended tab or connection failure instead of drawing across them.
	const last = points.at(-1);
	if (last && point.time <= last.time) return points;
	const gap: InstanceMetricPoint[] = last && point.time - last.time > 15
		? [{ time: last.time + METRICS_POLL_MS / 1000, cpu: null, memory: null, netIn: null, netOut: null }]
		: [];
	return [...points, ...gap, point]
		.filter((sample) => sample.time >= point.time - LIVE_WINDOW_SECONDS)
		.slice(-Math.ceil(LIVE_WINDOW_SECONDS / (METRICS_POLL_MS / 1000)) - 1);
}
