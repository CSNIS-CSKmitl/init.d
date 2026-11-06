import type { PbUser, PassionGroupRef } from './user';

export type InstanceType = 'vm' | 'container';
export type NetworkType = 'local' | 'public';
export type LeaseStatus = 'pending' | 'completed' | 'failed' | 'deleted';

export interface InstanceSpecs {
	cpu: number;
	ram: number; // GB
	disk: number; // GB
}

export interface InstanceDeletionRecord {
	id?: string;
	instance?: string;
	instance_ref?: string;
	hostname?: string;
	deleted_vmid?: number;
	deleted_node?: string | number;
	deleted_ip?: string;
	deleted_mac?: string;
	deleted_at?: string;
	deleted_by?: string;
	created?: string;
}

export interface LeaseInstance {
	id: string;
	collectionId: string;
	collectionName: string;
	created: string;
	updated: string;
	email: string; // The user ID of the creator (relation field named email)
	owners?: string[]; // Additional users with access to this instance
	owner_emails?: string[]; // Resolved on the server for display/editing
	requester_email?: string;
	passion_group: string | PassionGroupRef;
	expand?: {
		passion_group?: PassionGroupRef;
		email?: PbUser;
		owners?: PbUser[];
		created_by?: PbUser;
		updated_by?: PbUser;
		approved_by?: PbUser;
		[key: string]: any;
	};
	type: InstanceType;
	vmid?: number;
	node?: string | number;
	hostname: string;
	os_template: string;
	specs: InstanceSpecs;
	network_type: NetworkType;
	dns_name?: string;
	ports?: string;
	purpose_notes: string;
	start_date: string;
	end_date: string;
	quantity: number;
	status: LeaseStatus;
	IP?: string;
	provision_state?: string;
	provision_error?: string;
	provision_started_at?: string;
	provision_completed_at?: string;
	provision_progress?: { status: string; error?: string; taskState?: string };
	datedelete?: string;
	deleted_vmid?: number;
	deleted_node?: string | number;
	deleted_ip?: string;
	deleted_mac?: string;
	deletion?: InstanceDeletionRecord | null;
	admin_reply?: string;
	admin_reply_at?: string;
}

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

export function creatorEmail(item: LeaseInstance): string {
	return item.expand?.email?.email ?? item.email;
}

export function creatorName(item: LeaseInstance): string {
	return item.expand?.email?.name ?? item.expand?.email?.username ?? 'Unknown';
}

export function passionGroupName(item: LeaseInstance): string {
	if (typeof item.passion_group === 'object' && item.passion_group) {
		return item.passion_group.name;
	}
	return item.expand?.passion_group?.name ?? item.passion_group;
}
