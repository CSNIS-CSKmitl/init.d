export interface InstanceMetricPoint {
  time: number;
  cpu: number | null; // percent
  memory: number | null; // bytes
  netIn: number | null; // bytes per second
  netOut: number | null; // bytes per second
}

export interface InstanceMetrics {
  sampledAt: number; // Unix timestamp in seconds, measured after reading current status
  status: string;
  qmpstatus: string | null;
  node: string;
  vmid: number;
  current: {
    cpu: number | null; // percent
    memory: number | null; // bytes
    maxMemory: number | null; // bytes
    disk: number | null; // bytes
    maxDisk: number | null; // bytes
    cpus: number | null;
    uptime: number | null; // seconds
    netIn: number | null; // cumulative bytes received
    netOut: number | null; // cumulative bytes sent
  };
  points: InstanceMetricPoint[];
  chartError?: string;
}
