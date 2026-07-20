// Shared types for the LEASE system.

export type InstanceType = 'vm' | 'container';
export type NetworkType = 'local' | 'public';
export type LeaseStatus = 'pending' | 'completed';
export type UserRole = 'admin' | 'user';

export interface InstanceSpecs {
	cpu: number;
	ram: number; // GB
	disk: number; // GB
}

export interface PassionGroupRef {
	id: string;
	name: string;
}

export interface PbUser {
	id: string;
	email: string;
	name?: string;
	username?: string;
}

export interface LeaseInstance {
	id: string;
	collectionId: string;
	collectionName: string;
	created: string;
	updated: string;
	email: string; // The user ID of the creator (relation field named email)
	// Passion group is a relation in the actual PB schema — the field may
	// be a bare ID string (list API) or an expanded object (when `?expand`
	// is used). The display layer normalises both.
	passion_group: string | PassionGroupRef;
	expand?: {
		passion_group?: PassionGroupRef;
		email?: PbUser;
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
	// Optional admin reply shown back on /status. Populated by admins from
	// the `/admin` dashboard; users never set these directly.
	admin_reply?: string;
	admin_reply_at?: string;
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

export interface SessionUser {
	id: string;
	email: string;
	name?: string;
	username?: string;
	role: UserRole;
}
