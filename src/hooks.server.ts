// SvelteKit server hook — runs on every request.
// Resolves the authenticated `users` record into `event.locals.user`.

import type { Handle, ServerInit } from "@sveltejs/kit";
import { building, dev } from "$app/environment";
import { startProvisioningRecovery } from "$lib/proxmox";
import { startNightlyIpRefresh } from "$lib/server/nightly-ip-refresh";
import { createPb } from "$lib/pb/server";
import type { UserRole } from "$lib/types";
import {
  isDocumentRequest,
  writeServiceAccessLog,
} from "$lib/server/service-access-log";
import { getUserRoles, isInitDAdmin } from "$lib/roles";

export const init: ServerInit = () => {
  if (!building && !dev) startProvisioningRecovery();
  if (!building && !dev) startNightlyIpRefresh();
};

function resolveRole(record: any): UserRole {
  return isInitDAdmin(record) ? "admin" : "user";
}

function resolveEmail(record: any): string {
  if (record.email) return record.email;
  if (record.username) return `${record.username}@cskmitl.internal`;
  return "unknown@cskmitl.internal";
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.pb = createPb(event);

  const pb = event.locals.pb;
  if (pb.authStore.isValid) {
    try {
      // authRefresh lives in `users` (the regular auth collection).
      // Follow up with a getOne that expands `user_type` so the role
      // check can read its `type` field.
      await pb.collection("users").authRefresh();
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error("no user id in auth store");
      const full = (await pb.collection("users").getOne(userId, {
        expand: "user_type",
      })) as unknown as any;
      const isAdm = resolveRole(full) === "admin";
      event.locals.user = {
        id: full.id,
        email: resolveEmail(full),
        name: full.name ?? full.username,
        username: full.username,
        role: resolveRole(full),
        roles: getUserRoles(full),
        isAdmin: isAdm,
      };
    } catch {
      pb.authStore.clear();
      event.locals.user = null;
    }
  } else {
    event.locals.user = null;
  }

  const response = await resolve(event);
  if (isDocumentRequest(event))
    void writeServiceAccessLog(event, response.status);
  return response;
};
