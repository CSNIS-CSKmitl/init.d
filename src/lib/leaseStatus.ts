// Single source of truth for how a lease's admin-facing status is derived
// from its stored `status` field plus the live provisioning progress map.
// AdminStats and AdminQueueTable both consume this so the numbers in the
// stats bar always agree with the badges rendered in the table.

export type LeaseBadgeStatus = "failed" | "provisioning" | "pending" | "completed";

export type LeaseProgress = { status: string; error?: string } | undefined;

export function leaseBadgeStatus(
	item: { status: string },
	progress: LeaseProgress,
): LeaseBadgeStatus {
	if (progress?.status === "Failed") return "failed";
	if (progress && progress.status !== "Complete") return "provisioning";
	if (item.status === "pending") return "pending";
	return "completed";
}

// True when the row still needs the admin to resolve/retry it — i.e. it's
// either freshly pending or a previous provisioning attempt failed.
export function leaseNeedsResolve(item: { status: string }, progress: LeaseProgress): boolean {
	const badge = leaseBadgeStatus(item, progress);
	return badge === "pending" || badge === "failed";
}
