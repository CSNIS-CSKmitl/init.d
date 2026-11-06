export type UserRole = 'admin' | 'user';

/**
 * บทบาทผู้ใช้งานทั้งหมดในระบบ
 */
export type SystemRole =
	| 'super_admin'
	| 'superadmin'
	| 'admin'
	| 'head'
	| 'teacher'
	| 'teachers'
	| 'staff'
	| 'stuff'
	| 'student'
	| 'students'
	| 'guest'
	| 'guests'
	| 'user';

export type DisplayRole =
	| 'เจ้าหน้าที่ (Staff)'
	| 'หัวหน้าภาควิชา (Head)'
	| 'อาจารย์ (Teacher)'
	| 'นักศึกษา (Student)'
	| 'บุคคลภายนอก (Guest)'
	| 'ผู้ใช้งาน';

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
