export type UserRole = 'admin' | 'user';

export interface PbUser {
	id: string;
	email: string;
	name?: string;
	username?: string;
}

export interface PassionGroupRef {
	id: string;
	name: string;
}

export interface SessionUser {
	id: string;
	email: string;
	name?: string;
	username?: string;
	role: UserRole;
	roles?: string[];
}
