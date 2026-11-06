#!/usr/bin/env node
/**
 * Seed the PocketBase `templates` collection with the FULL community-scripts
 * catalog (community-scripts.org / community-scripts/ProxmoxVE).
 */
// node scripts/seed-templates.mjs how to run

import PocketBase from "pocketbase";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    )
      val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotEnv(resolve(ROOT, ".env"));

for (const k of ["POCKETBASE_URL", "PB_ADMIN_EMAIL", "PB_ADMIN_PASSWORD"]) {
  if (!process.env[k]) {
    console.error(`Missing required env var: ${k}`);
    process.exit(1);
  }
}

const SITEMAP_URL = "https://community-scripts.org/sitemap.xml";
const REPO_MAIN = "community-scripts/ProxmoxVE";
const REPO_DEV = "community-scripts/ProxmoxVED";
const BRANCH = "main";
const UA = "init.d-seed";

const HELPER_PREFIXES = [
  "add-",
  "all-",
  "turnkey-",
  "clean-",
  "cron-",
  "kernel-",
  "lxc-",
  "microcode",
  "monitor-",
  "nic-",
  "partition",
  "post-",
  "update-",
  "whiptail",
];
const HELPER_NAMES = new Set([
  "execute",
  "fstrim",
  "host-backup",
  "move-disk",
  "move-lxc",
  "verbose",
  "filebrowser-quantum",
]);

const PUBLIC_LXC = new Set([
  "nginxproxymanager",
  "traefik",
  "pihole",
  "adguardhome",
  "caddy",
  "homepage",
  "n8n",
  "ghost",
  "wordpress",
  "cockpit",
  "webmin",
  "phpmyadmin",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isUniqueViolation(e) {
  return e?.response?.data?.data?.slug?.code === "validation_not_unique";
}

const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);
await pb.admins.authWithPassword(
  process.env.PB_ADMIN_EMAIL,
  process.env.PB_ADMIN_PASSWORD,
);

// ---- 1. Ensure the `templates` collection exists ------------------------

async function ensureCollection() {
  const existing = await pb.collections.getOne("templates").catch(() => null);
  if (existing) {
    console.log(
      `[skip] "templates" collection already exists (id=${existing.id}).`,
    );
    return;
  }

  const collection = await pb.collections.create({
    name: "templates",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: '@request.auth.user_type.type = "admin"',
    updateRule: '@request.auth.user_type.type = "admin"',
    deleteRule: '@request.auth.user_type.type = "admin"',
    fields: [
      {
        name: "slug",
        type: "text",
        required: true,
        options: { min: 1, max: 80, pattern: "^[a-z0-9-]+$" },
      },
      {
        name: "name",
        type: "text",
        required: true,
        options: { min: 1, max: 120 },
      },
      {
        name: "type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["vm", "container"],
      },
      {
        name: "os_template",
        type: "text",
        required: true,
        options: { min: 1, max: 80 },
      },
      {
        name: "default_cpu",
        type: "number",
        required: true,
        options: { min: 1, max: 128, noDecimal: true },
      },
      {
        name: "default_ram",
        type: "number",
        required: true,
        options: { min: 1, max: 1024, noDecimal: true },
      },
      {
        name: "default_disk",
        type: "number",
        required: true,
        options: { min: 1, max: 16384, noDecimal: true },
      },
      {
        name: "default_network",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["local", "public"],
      },
      {
        name: "default_ports",
        type: "text",
        required: false,
        options: { max: 512 },
      },
      {
        name: "description",
        type: "text",
        required: false,
        options: { max: 4096 },
      },
      { name: "category", type: "text", required: false, options: { max: 80 } },
      { name: "source_url", type: "url", required: false, options: {} },
      { name: "logo_url", type: "url", required: false, options: {} },
      // สคริปต์จะพยายามเขียนฟิลด์นี้เพิ่มเข้าไปใน DB อัตโนมัติ (ตรวจสอบสเปก Schema คอลเลกชันให้เรียบร้อย)
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["Production", "Develop"],
      },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_slug ON templates (slug)"],
  });
  console.log(`[ok] created "templates" collection (id=${collection.id}).`);
}

// ---- 2. Catalog discovery ----------------------------------------------

async function getSlugs() {
  const xml = await fetch(SITEMAP_URL, { headers: { "User-Agent": UA } }).then(
    (r) => {
      if (!r.ok) throw new Error(`sitemap HTTP ${r.status}`);
      return r.text();
    },
  );
  const matches = [
    ...xml.matchAll(
      /<loc>https:\/\/community-scripts\.org\/scripts\/([^<]+)<\/loc>/g,
    ),
  ];

  return [
    ...new Set(
      matches.map((m) => {
        let rawSlug = m[1].trim();
        if (rawSlug.endsWith("/")) rawSlug = rawSlug.slice(0, -1);
        return rawSlug;
      }),
    ),
  ]
    .filter((slug) => !HELPER_PREFIXES.some((p) => slug.startsWith(p)))
    .filter((slug) => !HELPER_NAMES.has(slug))
    .sort();
}

async function fetchShellIndex() {
  const url = `https://api.github.com/repos/${REPO_MAIN}/git/trees/${BRANCH}?recursive=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`tree HTTP ${res.status}`);
  const tree = await res.json();

  const map = new Map();
  for (const node of tree.tree) {
    if (node.type !== "blob") continue;
    if (!node.path.endsWith(".sh")) continue;
    const parts = node.path.split("/");

    let dir, file, type;
    if (parts.length === 2 && (parts[0] === "ct" || parts[0] === "vm")) {
      [dir, file] = parts;
      type = dir === "vm" ? "vm" : "container";
    } else if (
      parts.length === 3 &&
      parts[0] === "tools" &&
      parts[1] === "addon"
    ) {
      dir = "tools/addon";
      file = parts[2];
      const base0 = file.replace(/\.sh$/, "");
      if (HELPER_PREFIXES.some((p) => base0.startsWith(p))) continue;
      type = "container";
    } else {
      continue;
    }

    const base = file.replace(/\.sh$/, "").toLowerCase().trim();
    map.set(base, { path: node.path, type });

    if (type === "vm") {
      const alt = base.endsWith("-vm") ? base.slice(0, -3) : `${base}-vm`;
      map.set(alt, { path: node.path, type });
    }
  }
  return map;
}

// ---- 3. Fetch Specific Shell & Parse Specifications ---------------------

// ✨ เพิ่มพารามิเตอร์repoStatus เพื่อส่งค่านิยามป้ายกำกับคลังเข้ามาบันทึก
function parseShellScript(slug, content, type, repoStatus = "Production") {
  const nameMatch =
    content.match(/^(?:\\s*)*APP="([^"]+)"/m)?.[1] ??
    content.match(/^(?:\\s*)*NSAPP="([^"]+)"/m)?.[1] ??
    null;

  const isVM = type === "vm" || slug.endsWith("-vm");

  const extractVar = (key) => {
    let patterns = [];
    if (key === "cpu") {
      patterns = [
        new RegExp(`^\\s*CORE_COUNT="([^"]+)"`, "m"),
        new RegExp(`^\\s*var_cpu="\\$\\{var_cpu:-([^}]+)\\}"`, "m"),
        new RegExp(`^\\s*var_cpu="([^"]+)"`, "m"),
      ];
    } else if (key === "ram") {
      patterns = [
        new RegExp(`^\\s*RAM_SIZE="([^"]+)"`, "m"),
        new RegExp(`^\\s*var_ram="\\$\\{var_ram:-([^}]+)\\}"`, "m"),
        new RegExp(`^\\s*var_ram="([^"]+)"`, "m"),
      ];
    } else if (key === "disk") {
      patterns = [
        new RegExp(`^\\s*DISK_SIZE="([^"]+)"`, "m"),
        new RegExp(`^\\s*var_disk="\\$\\{var_disk:-([^}]+)\\}"`, "m"),
        new RegExp(`^\\s*var_disk="([^"]+)"`, "m"),
        new RegExp(`check_disk_space\\s+"[^"]+"\\s+([0-9]+)`, "m"),
        new RegExp(`check_disk_space\\s+\\$[^\\s]+\\s+([0-9]+)`, "m"),
      ];
    } else if (key === "os") {
      patterns = [
        new RegExp(`^\\s*HN="([^"]+)"`, "m"),
        new RegExp(`^\\s*var_os="\\$\\{var_os:-([^}]+)\\}"`, "m"),
        new RegExp(`^\\s*var_os="([^"]+)"`, "m"),
      ];
    }

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match?.[1] && !match[1].includes("${")) return match[1];
    }
    return null;
  };

  const rawCpu = extractVar("cpu");
  const rawRam = extractVar("ram");
  const rawDisk = extractVar("disk");
  const osBase = extractVar("os");

  const missingCritical = [];
  if (!rawCpu) missingCritical.push("cpu");
  if (!rawRam) missingCritical.push("ram");

  if (missingCritical.length > 0) {
    return {
      error: `Missing critical layout variables: [${missingCritical.join(", ")}]`,
    };
  }

  let cpu = parseInt(rawCpu, 10);
  let ramMb = parseInt(rawRam, 10);

  if (!Number.isFinite(cpu) || cpu <= 0)
    return { error: "Invalid or Non-finite CPU count" };
  if (!Number.isFinite(ramMb) || ramMb <= 0)
    return { error: "Invalid or Non-finite RAM size" };

  let disk = rawDisk
    ? parseInt(rawDisk.replace(/[GgMm]/g, ""), 10)
    : isVM
      ? 32
      : 10;
  if (!Number.isFinite(disk) || disk <= 0) disk = isVM ? 32 : 10;

  let cleanOsBase = osBase;
  if (!cleanOsBase || cleanOsBase.trim() === "") {
    cleanOsBase = slug.replace(/-vm$/, "").split("-")[0];
  }

  let osVersionMatch = content.match(
    /^\s*var_version="\\$\\{var_version:-([^}]+)\\}"/m,
  );
  let osVersion = osVersionMatch ? osVersionMatch[1] : "";
  let finalOs = osVersion ? `${cleanOsBase}-${osVersion}` : cleanOsBase;

  if (!finalOs.includes("-")) {
    const versionExtract = slug.match(/-([0-9]+)/);
    finalOs = versionExtract
      ? `${cleanOsBase}-${versionExtract[1]}`
      : `${finalOs}-latest`;
  }

  const rawContentLower = content.toLowerCase();
  const isUnstable =
    rawContentLower.includes("development script") ||
    rawContentLower.includes("unstable script") ||
    rawContentLower.includes("incubator");

  let cleanName = nameMatch;
  if (!cleanName) {
    cleanName = slug
      .replace(/-vm$/, "")
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  if (isUnstable && !cleanName.toLowerCase().includes("unstable")) {
    cleanName = `${cleanName} (unstable)`;
  } else if (!isVM && !cleanName.toLowerCase().includes("(lxc)")) {
    cleanName = `${cleanName} (LXC)`;
  }

  const computedRam = Math.max(1, Math.ceil(ramMb / 1024));

  return {
    slug: slug,
    name: cleanName,
    type: isVM ? "vm" : "container",
    os_template: finalOs,
    default_cpu: cpu,
    default_ram: computedRam,
    default_disk: disk,
    default_network: isVM ? "local" : PUBLIC_LXC.has(slug) ? "public" : "local",
    default_ports:
      content.match(/^\s*var_port="\\$\\{var_port:-([^}]+)\\}"/m)?.[1] || "",
    description: isUnstable
      ? "Development script. Unstable/Incomplete."
      : "Community template installer.",
    category: isVM ? "VM" : "LXC",
    source_url: `https://community-scripts.org/scripts/${slug}`,
    status: repoStatus, // ✨ ส่งค่าลงออบเจกต์เพื่อเตรียมยิงเข้า PocketBase
  };
}

async function fetchAndParseShell(slug, shellIndex) {
  const lookupKey = slug.toLowerCase().trim();

  const baseWithoutVm = lookupKey.replace(/-vm$/, "");
  const pureWordBase = baseWithoutVm.replace(/-[0-9]+$/, "");

  let entry =
    shellIndex.get(lookupKey) ||
    shellIndex.get(baseWithoutVm) ||
    shellIndex.get(`${baseWithoutVm}-vm`) ||
    shellIndex.get(pureWordBase) ||
    shellIndex.get(`${pureWordBase}-vm`);

  // ก๊อกแรก: คลังหลัก ProxmoxVE ประทับตราสถานะเป็น 'Production'
  if (entry) {
    try {
      const url = `https://raw.githubusercontent.com/${REPO_MAIN}/${BRANCH}/${entry.path}`;
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 429) {
        await sleep(2000);
        return fetchAndParseShell(slug, shellIndex);
      }

      if (res.ok) {
        const content = await res.text();
        return parseShellScript(slug, content, entry.type, "Production");
      }
    } catch (e) {
      /* ละไว้เพื่อไปก๊อกสอง */
    }
  }

  // ก๊อกสอง: ยิงตรงหาคลังสำรอง ProxmoxVED ประทับตราสถานะเป็น 'Develop'
  try {
    const isVM =
      slug.endsWith("-vm") ||
      [
        "debian",
        "ubuntu",
        "alpine",
        "fedora",
        "archlinux",
        "almalinux",
        "rockylinux",
        "freebsd",
        "openwrt",
      ].some((os) => slug.startsWith(os) && slug.includes("-vm"));
    const subFolder = isVM ? "vm" : "ct";
    const url = `https://raw.githubusercontent.com/${REPO_DEV}/${BRANCH}/${subFolder}/${slug}.sh`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });

    if (res.ok) {
      const content = await res.text();
      console.log(
        `\n[info] ${slug} successfully recovered from Develop repository (ProxmoxVED).`,
      );
      return parseShellScript(slug, content, subFolder, "Develop");
    }
  } catch (e) {
    /* ข้ามข้อผิดพลาด */
  }

  return {
    error:
      "No matching script file found on both ProxmoxVE and ProxmoxVED repositories",
  };
}

// ---- 4. Core Upsert Engine ----------------------------------------------

async function upsertAll() {
  const slugs = await getSlugs();
  console.log(`[info] ${slugs.length} targets discovered from Sitemap.`);

  const shellIndex = await fetchShellIndex();
  console.log(
    `[info] ${shellIndex.size} index keys successfully synchronized from ProxmoxVE tree.`,
  );

  const existing = await pb
    .collection("templates")
    .getFullList({ fields: "id,slug" });
  const bySlug = new Map(existing.map((r) => [r.slug, r.id]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const CONCURRENCY = 4;
  const queue = [...slugs];

  async function worker() {
    while (queue.length > 0) {
      const slug = queue.shift();
      if (!slug) return;
      try {
        await sleep(150);

        const preset = await fetchAndParseShell(slug, shellIndex);

        if (!preset || preset.error) {
          skipped++;
          console.log(
            `\n[skip] ${slug}: ${preset?.error || "Unknown parsing breakdown"}`,
          );
          continue;
        }

        if (bySlug.has(preset.slug)) {
          await pb
            .collection("templates")
            .update(bySlug.get(preset.slug), preset);
          updated++;
        } else {
          try {
            await pb.collection("templates").create(preset);
            created++;
          } catch (e) {
            if (isUniqueViolation(e)) {
              const rec = await pb
                .collection("templates")
                .getFirstListItem(`slug="${preset.slug}"`);
              await pb.collection("templates").update(rec.id, preset);
              updated++;
              bySlug.set(preset.slug, rec.id);
            } else {
              throw e;
            }
          }
        }
        process.stdout.write(".");
      } catch (e) {
        failed++;
        const errorData = e?.response?.data;
        const inner =
          errorData && typeof errorData === "object"
            ? Object.entries(errorData)
                .map(
                  ([f, info]) =>
                    `${f}: ${info?.message || JSON.stringify(info)}`,
                )
                .join(", ")
            : e?.message || String(e);
        console.warn(`\n[fail] ${slug}: ${inner}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(
    `\n[done] created=${created}  updated=${updated}  skipped=${skipped}  failed=${failed}  total_in_db=${bySlug.size + created}`,
  );
}

await ensureCollection();
await upsertAll();
