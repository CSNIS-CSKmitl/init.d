// Preset/template loader.
//
// Reads the `templates` collection in PocketBase and maps each row
// onto the form's preset shape. The catalog is populated by the
// `scripts/seed-templates.mjs` utility, which mirrors the community-
// scripts.org catalog (community-scripts/ProxmoxVED on GitHub) and
// can be re-run any time to pick up new scripts.
//
// Why DB-backed:
//   * The catalog can be edited/tuned through the PB admin UI
//     without redeploying.
//   * One PB query on page load is cheap; we don't pull 30+ files
//     from GitHub on every request.
//   * Admins can disable bad/retired presets without touching code.

import type PocketBase from "pocketbase";

export interface Preset {
  slug: string;
  name: string;
  type: "vm" | "container";
  os_template: string;
  default_cpu: number;
  default_ram: number; // GB
  default_disk: number; // GB
  default_network: "local" | "public";
  default_ports: string;
  description: string;
  category?: string;
  source_url?: string;
  logo_url?: string;
  // Mirrors the `status` select on the PocketBase `templates` collection.
  // 'Production' is the stable catalog; 'Develop' is sourced from the
  // ProxmoxVED mirror and may be unstable — the form surfaces a warning
  // when a Develop preset is picked.
  status?: "Production" | "Develop";
}

interface RawTemplateRecord {
  id?: string;
  slug?: string;
  name?: string;
  type?: string;
  os_template?: string;
  default_cpu?: number;
  default_ram?: number;
  default_disk?: number;
  default_network?: string;
  default_ports?: string;
  description?: string;
  category?: string;
  source_url?: string;
  logo_url?: string;
  status?: string;
}

function transform(record: RawTemplateRecord): Preset | null {
  if (!record.slug || !record.name || !record.type || !record.os_template)
    return null;
  if (record.type !== "vm" && record.type !== "container") return null;

  // Defensive: PB might have a stray value from an older rule; snap
  // it back to a known enum rather than letting it propagate.
  const network =
    record.default_network === "public" ? "public" : ("local" as const);

  return {
    slug: record.slug,
    name: record.name,
    type: record.type,
    os_template: record.os_template,
    default_cpu: Number(record.default_cpu) || 2,
    default_ram: Number(record.default_ram) || 1,
    default_disk: Number(record.default_disk) || 10,
    default_network: network,
    default_ports: record.default_ports ?? "",
    description: record.description ?? "",
    category: record.category || undefined,
    source_url: record.source_url || undefined,
    logo_url: record.logo_url || undefined,
    // Snap stray values back to a known enum so the UI's strict
    // equality check (`status === 'Develop'`) is always safe.
    status: record.status === "Develop" ? "Develop" : "Production",
  };
}

/**
 * Fetch the template catalog from PocketBase.
 *
 * Returns an empty array if the collection is missing or empty — the
 * form just won't show any preset options, which is the right behaviour
 * before the seed script has been run.
 */
export async function fetchPresets(pb: PocketBase): Promise<Preset[]> {
  try {
    // 1000 covers the full community-scripts catalog with room to grow
    // before we have to think about pagination. PB returns totalItems
    // either way, so this is just about the page size, not the visible
    // row count.
    const list = await pb
      .collection("templates")
      .getList<RawTemplateRecord>(1, 1000, {
        sort: "name",
        fields:
          "slug,name,type,os_template,default_cpu,default_ram,default_disk,default_network,default_ports,description,category,source_url,logo_url,status",
      });
    return list.items
      .map(transform)
      .filter((p): p is Preset => p !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e) {
    // Most common cause: the `templates` collection doesn't exist yet
    // (fresh PB, seed script hasn't been run). Treat as "no presets".
    console.warn("[presets] no templates available yet:", e);
    return [];
  }
}
