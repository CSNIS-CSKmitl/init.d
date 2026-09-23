type PowerTask = {
	instanceId: string;
	userId: string;
	node: string;
	expiresAt: number;
};

const tasks = new Map<string, PowerTask>();

export function rememberPowerTask(upid: string, instanceId: string, userId: string, node: string) {
	const now = Date.now();
	for (const [key, task] of tasks) {
		if (task.expiresAt <= now) tasks.delete(key);
	}
	tasks.set(upid, { instanceId, userId, node, expiresAt: now + 10 * 60_000 });
}

export function findPowerTask(upid: string, instanceId: string, userId: string): PowerTask | null {
	const task = tasks.get(upid);
	if (!task || task.expiresAt <= Date.now()) {
		tasks.delete(upid);
		return null;
	}
	return task.instanceId === instanceId && task.userId === userId ? task : null;
}
