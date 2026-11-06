import type { UserRole, DisplayRole } from './types/role';
export type { UserRole, DisplayRole };

export function getUserRoles(record: any): string[] {
	if (!record) return [];
	const roles = new Set<string>();

	if (Array.isArray(record.roles)) {
		for (const r of record.roles) {
			if (typeof r === 'string' && !isRawRoleId(r)) roles.add(r.toLowerCase().trim());
		}
	}

	const expanded = record.expand?.user_type;
	if (Array.isArray(expanded)) {
		for (const item of expanded) {
			if (item?.type && !isRawRoleId(item.type)) roles.add(item.type.toLowerCase().trim());
			if (item?.id) addIdRole(item.id, roles);
		}
	} else if (expanded && typeof expanded === 'object') {
		if (expanded.type && !isRawRoleId(expanded.type)) roles.add(expanded.type.toLowerCase().trim());
		if (expanded.id) addIdRole(expanded.id, roles);
	}

	const ut = record.user_type ?? record.user_type_id;
	if (Array.isArray(ut)) {
		for (const item of ut) {
			if (typeof item === 'string') {
				if (!isRawRoleId(item)) roles.add(item.toLowerCase().trim());
				addIdRole(item, roles);
			}
		}
	} else if (typeof ut === 'string') {
		if (!isRawRoleId(ut)) roles.add(ut.toLowerCase().trim());
		addIdRole(ut, roles);
	}

	return Array.from(roles);
}


function isRawRoleId(str: string): boolean {
	return typeof str === 'string' && /^0{10,}\d+$/.test(str.trim());
}

function addIdRole(id: string, set: Set<string>) {
	if (id === '000000000000000') set.add('admin');
	if (id === '000000000000001') set.add('students');
	if (id === '000000000000002') { set.add('teachers'); set.add('teacher'); }
	if (id === '000000000000003') { set.add('guests'); set.add('guest'); }
	if (id === '000000000000009') { set.add('superadmin'); set.add('super_admin'); }
	if (id === '000000000000004') { set.add('staff'); set.add('stuff'); }
	if (id === '000000000000005') set.add('head');
	if (id === '000000000000006') { set.add('teacher'); set.add('teachers'); }
	if (id === '000000000000007') { set.add('stuff'); set.add('staff'); }
	if (id === '000000000000008') { set.add('guest'); set.add('guests'); }
	if (id === '0000000000000010' || id === '000000000000010') { set.add('super_admin'); set.add('superadmin'); }
}

/**
 * In init.d: admin access is granted to admin, super_admin, head (or PB admin email)
 */

/**
 * แปลง Role ทางเทคนิคให้เป็นชื่อบทบาทที่อ่านง่ายสำหรับแสดงในอีเมลและหน้าจอ
 */
export function formatDisplayRole(userOrRoles: any): DisplayRole {
	const roleList = Array.isArray(userOrRoles) ? userOrRoles : getUserRoles(userOrRoles);
	const cleanRoles = roleList.filter((r) => !isRawRoleId(r));
	if (cleanRoles.some((r) => ['super_admin', 'superadmin', 'admin', 'staff', 'stuff'].includes(r))) return 'เจ้าหน้าที่ (Staff)';
	if (cleanRoles.includes('head')) return 'หัวหน้าภาควิชา (Head)';
	if (cleanRoles.some((r) => ['teacher', 'teachers'].includes(r))) return 'อาจารย์ (Teacher)';
	if (cleanRoles.some((r) => ['staff', 'stuff'].includes(r))) return 'เจ้าหน้าที่ (Staff)';
	if (cleanRoles.some((r) => ['student', 'students'].includes(r))) return 'นักศึกษา (Student)';
	if (cleanRoles.some((r) => ['guest', 'guests'].includes(r))) return 'บุคคลภายนอก (Guest)';
	return cleanRoles.length > 0 ? cleanRoles[0] : 'ผู้ใช้งาน';
}

export function isInitDAdmin(user: any): boolean {
	if (!user) return false;
	if (user.email === 'log@cskmitl.com') return true;
	const roles = getUserRoles(user);
	return roles.includes('admin') || roles.includes('superadmin') || roles.includes('super_admin') || roles.includes('head');
}
