import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getProxmoxGuestNetwork,
  getProxmoxNodeBridges,
} from "$lib/proxmox";

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user || locals.user.role !== "admin") {
    throw error(403, "Admin access required.");
  }

  const nodeParam = url.searchParams.get("node")?.trim();
  const vmidParam = url.searchParams.get("vmid")?.trim();
  const typeParam = url.searchParams.get("type")?.trim();

  if (!nodeParam) {
    return json({ error: "Missing node parameter." }, { status: 400 });
  }

  try {
    const bridges = await getProxmoxNodeBridges(nodeParam);
    let current: { net0: string; bridge: string; vlanTag: string } | null = null;

    if (vmidParam && (typeParam === "vm" || typeParam === "ct" || typeParam === "container")) {
      const vmid = Number(vmidParam);
      if (Number.isInteger(vmid) && vmid > 0) {
        current = await getProxmoxGuestNetwork(nodeParam, vmid, typeParam).catch(
          () => null,
        );
      }
    }

    return json({ node: nodeParam, bridges, current });
  } catch (e: any) {
    console.error("Proxmox network API error:", e?.message || e);
    return json(
      { error: e?.message || "Failed to fetch Proxmox network information" },
      { status: 502 },
    );
  }
};
