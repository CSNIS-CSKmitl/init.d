/** @param {unknown} typeOrUser */
export function isAppAdmin(typeOrUser) {
	if (!typeOrUser) return false;
	const roles = new Set();
	if (typeof typeOrUser === 'string') {
		roles.add(typeOrUser.trim().toLowerCase());
	} else if (Array.isArray(typeOrUser)) {
		for (const item of typeOrUser) {
			if (typeof item === 'string') roles.add(item.trim().toLowerCase());
			else if (item && typeof item === 'object' && item.type) roles.add(String(item.type).trim().toLowerCase());
		}
	} else if (typeof typeOrUser === 'object') {
		if (typeOrUser.type) roles.add(String(typeOrUser.type).trim().toLowerCase());
		if (Array.isArray(typeOrUser.expand?.user_type)) {
			for (const item of typeOrUser.expand.user_type) {
				if (item?.type) roles.add(String(item.type).trim().toLowerCase());
			}
		} else if (typeOrUser.expand?.user_type?.type) {
			roles.add(String(typeOrUser.expand.user_type.type).trim().toLowerCase());
		}
		const ut = typeOrUser.user_type;
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
