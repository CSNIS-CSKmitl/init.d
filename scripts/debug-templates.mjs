#!/usr/bin/env node
/**
 * Diagnostic for the Quick Preset catalog.
 *
 * Prints four things so you can see exactly what the /request page
 * would see when it tries to load presets:
 *   1. The collection's rules (listRule / viewRule) and field list
 *      as the PB superuser sees them.
 *   2. A sample record — the first row in the catalog — so you can
 *      confirm the field names actually match what the loader reads.
 *   3. An anonymous (no auth) list request — this is the test that
 *      tells you whether the listRule is open or restricted. /request
 *      hits the templates collection through the user's cookie auth,
 *      so an unrestricted rule is what you want.
 *   4. The exact fields-string the loader uses, plus the error
 *      PocketBase would return if that string references a field the
 *      collection does not have.
 *
 * Run: node scripts/debug-templates.mjs
 */

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

const adminPb = new PocketBase(process.env.POCKETBASE_URL);
adminPb.autoCancellation(false);
await adminPb.admins.authWithPassword(
  process.env.PB_ADMIN_EMAIL,
  process.env.PB_ADMIN_PASSWORD,
);

// ---- 1. Collection schema + rules ---------------------------------------
let collection;
try {
  collection = await adminPb.collections.getOne("templates");
} catch (e) {
  console.error("[fatal] templates collection not found on this PB.");
  console.error("         Run `node scripts/seed-templates.mjs` first.");
  process.exit(1);
}

const fieldNames = new Set(collection.fields.map((f) => f.name));
console.log("--- Collection: templates ---");
console.log(`id              : ${collection.id}`);
console.log(`listRule        : ${JSON.stringify(collection.listRule)}`);
console.log(`viewRule        : ${JSON.stringify(collection.viewRule)}`);
console.log(
  `fields (${collection.fields.length}) : ${[...fieldNames].join(", ")}`,
);
console.log();

// ---- 2. Sample record ---------------------------------------------------
const fullList = await adminPb.collection("templates").getList(1, 1, {
  sort: "name",
});
console.log(`--- Records in DB: ${fullList.totalItems} ---`);
if (fullList.items[0]) {
  console.log("Sample record (first row):");
  console.log(JSON.stringify(fullList.items[0], null, 2));
} else {
  console.log("(no records — the collection is empty)");
}
console.log();

// ---- 3. Anonymous read (tests listRule) ---------------------------------
const anonPb = new PocketBase(process.env.POCKETBASE_URL);
anonPb.autoCancellation(false);
console.log("--- Anonymous read (no auth) ---");
try {
  const r = await anonPb.collection("templates").getList(1, 5);
  console.log(`OK — got ${r.items.length} of ${r.totalItems} records`);
  console.log("   listRule is wide open, /request should see presets.");
} catch (e) {
  console.log(`FAIL — ${e?.status || ""} ${e?.message || e}`);
  if (e?.status === 403 || e?.status === 404) {
    console.log("   The listRule is restricted. /request will silently get []");
    console.log("   because the loader swallows this error.");
  }
}
console.log();

// ---- 4. Field-name validation ------------------------------------------
// Mirrors the exact fields string used by src/lib/presets.ts.
const FIELDS =
  "slug,name,type,os_template,default_cpu,default_ram,default_disk,default_network,default_ports,description,category,source_url,logo_url,status";
const missing = FIELDS.split(",").filter((f) => !fieldNames.has(f));
console.log("--- Loader field check ---");
console.log(`loader asks for : ${FIELDS}`);
if (missing.length === 0) {
  console.log("all fields exist on the collection — good.");
} else {
  console.log(`MISSING fields: ${missing.join(", ")}`);
  console.log("   PB will 400 on this query, the loader swallows the error,");
  console.log("   /request ends up with an empty preset list.");
}
