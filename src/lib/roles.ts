export function getUserRoles(record: any): string[] {
	if (!record) return [];
	const roles = new Set<string>();

	if (Array.isArray(record.roles)) {
		for (const r of record.roles) {
			if (typeof r === 'string') roles.add(r.toLowerCase().trim());
		}
	}

	const expanded = record.expand?.user_type;
	if (Array.isArray(expanded)) {
		for (const item of expanded) {
			if (item?.type) roles.add(item.type.toLowerCase().trim());
			if (item?.id) addIdRole(item.id, roles);
		}
	} else if (expanded && typeof expanded === 'object') {
		if (expanded.type) roles.add(expanded.type.toLowerCase().trim());
		if (expanded.id) addIdRole(expanded.id, roles);
	}

	const ut = record.user_type ?? record.user_type_id;
	if (Array.isArray(ut)) {
		for (const item of ut) {
			if (typeof item === 'string') {
				roles.add(item.toLowerCase().trim());
				addIdRole(item, roles);
			}
		}
	} else if (typeof ut === 'string') {
		roles.add(ut.toLowerCase().trim());
		addIdRole(ut, roles);
	}

	return Array.from(roles);
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
export function isInitDAdmin(user: any): boolean {
	if (!user) return false;
	if (user.email === 'log@cskmitl.com') return true;
	const roles = getUserRoles(user);
	return roles.includes('admin') || roles.includes('superadmin') || roles.includes('super_admin') || roles.includes('head');
}
