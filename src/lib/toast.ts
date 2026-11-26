import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
	id: number;
	message: string;
	type: ToastType;
}

const DEFAULT_DURATION_MS = 3200;

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const toasts = writable<ToastItem[]>([]);

export function dismissToast(id: number): void {
	const timer = timers.get(id);
	if (timer) {
		clearTimeout(timer);
		timers.delete(id);
	}
	toasts.update((list) => list.filter((t) => t.id !== id));
}

export function showToast(
	message: string,
	type: ToastType = 'info',
	duration = DEFAULT_DURATION_MS
): number {
	const text = message.trim();
	if (!text) return 0;

	const id = nextId++;
	toasts.update((list) => [...list.slice(-3), { id, message: text, type }]);

	if (duration > 0) {
		const timer = setTimeout(() => {
			dismissToast(id);
		}, duration);
		timers.set(id, timer);
	}

	return id;
}

export const toast = {
	success: (message: string, duration = DEFAULT_DURATION_MS) =>
		showToast(message, 'success', duration),
	error: (message: string, duration = DEFAULT_DURATION_MS) =>
		showToast(message, 'error', duration),
	info: (message: string, duration = DEFAULT_DURATION_MS) =>
		showToast(message, 'info', duration),
	dismiss: dismissToast
};
