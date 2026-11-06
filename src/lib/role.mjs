/** @param {any} typeOrUser */
export function isAppAdmin(typeOrUser) {
	if (!typeOrUser) return false;
	const roles = new Set();
	/** @type {any} */
	const u = typeOrUser;
	if (typeof u === 'string') {
		roles.add(u.trim().toLowerCase());
	} else if (Array.isArray(u)) {
		for (const item of u) {
			if (typeof item === 'string') roles.add(item.trim().toLowerCase());
			else if (item && typeof item === 'object' && item.type) roles.add(String(item.type).trim().toLowerCase());
		}
	} else if (typeof u === 'object') {
		if (u.type) roles.add(String(u.type).trim().toLowerCase());
		if (Array.isArray(u.expand?.user_type)) {
			for (const item of u.expand.user_type) {
				if (item?.type) roles.add(String(item.type).trim().toLowerCase());
			}
		} else if (u.expand?.user_type?.type) {
			roles.add(String(u.expand.user_type.type).trim().toLowerCase());
		}
		const ut = u.user_type;
		if (Array.isArray(ut)) {
			for (const item of ut) {
				if (['000000000000000', '000000000000009', '000000000000005'].includes(item)) roles.add('admin');
			}
		} else if (['000000000000000', '000000000000009', '000000000000005'].includes(ut)) {
			roles.add('admin');
		}
	}
	return ['admin', 'super_admin', 'superadmin', 'head'].some((r) => roles.has(r));
}
