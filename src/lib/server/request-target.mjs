export function normalizeRequestTarget(target = '/') {
	const value = String(target || '/');
	if (!value.startsWith('//')) return value;
	return `/${value.replace(/^\/+/, '')}`;
}
