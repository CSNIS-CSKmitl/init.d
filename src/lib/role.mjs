/** @param {unknown} type */
export function isAppAdmin(type) {
	return typeof type === 'string' && type.trim().toLowerCase() === 'admin';
}
