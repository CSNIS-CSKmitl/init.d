#!/usr/bin/env node
/**
 * Bootstrap the LEASE system on an existing PocketBase server.
 *
 *   1. Create the `instances` collection (idempotent).
 *   2. Optionally create an admin user in the `users` collection and
 *      link it to a `user_type` row typed "admin" (idempotent — if the
 *      username already exists, that step is skipped).
 *
 * Env vars (read from process.env, then .env fills the gaps):
 *   PB_URL                default: http://192.168.15.14:8080
 *   PB_ADMIN_EMAIL        required — PB superuser (used to call admin APIs)
 *   PB_ADMIN_PASSWORD     required
 *
 *   PB_USER_USERNAME      optional — create an admin in `users`
 *   PB_USER_PASSWORD      optional
 *   PB_USER_EMAIL         optional
 *   PB_USER_NAME          optional
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

const REQUIRED = ["POCKETBASE_URL", "PB_ADMIN_EMAIL", "PB_ADMIN_PASSWORD"];
for (const k of REQUIRED) {
  if (!process.env[k]) {
    console.error(`Missing required env var: ${k}`);
    process.exit(1);
  }
}

const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);

await pb.admins.authWithPassword(
  process.env.PB_ADMIN_EMAIL,
  process.env.PB_ADMIN_PASSWORD,
);

// ---- 1. Ensure the `instances` collection exists -------------------------
const TARGET = "instances";

async function ensureInstances() {
  const existing = await pb.collections.getOne(TARGET).catch(() => null);
  if (existing) {
    console.log(`[skip] "${TARGET}" already exists (id=${existing.id}).`);
    return;
  }

  const collection = await pb.collections.create({
    name: TARGET,
    type: "base",
    listRule:
      'creator_email = @request.auth.email || @request.auth.user_type.type = "admin"',
    viewRule:
      'creator_email = @request.auth.email || @request.auth.user_type.type = "admin"',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.user_type.type = "admin"',
    deleteRule: '@request.auth.user_type.type = "admin"',
    fields: [
      { name: "creator_email", type: "email", required: true },
      {
        name: "passion_group",
        type: "relation",
        required: true,
        collectionId: "pbc_3779434195",
        cascadeDelete: false,
        maxSelect: 1,
        minSelect: 1,
      },
      {
        name: "type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["vm", "container"],
      },
      {
        name: "hostname",
        type: "text",
        required: true,
        options: { min: 1, max: 64, pattern: "^[a-z0-9-]+$" },
      },
      {
        name: "os_template",
        type: "text",
        required: true,
        options: { min: 1, max: 120 },
      },
      { name: "specs", type: "json", required: true },
      {
        name: "network_type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["local", "public"],
      },
      {
        name: "dns_name",
        type: "text",
        required: false,
        options: { max: 253 },
      },
      { name: "ports", type: "text", required: false, options: { max: 512 } },
      {
        name: "purpose_notes",
        type: "text",
        required: true,
        options: { max: 4096 },
      },
      { name: "start_date", type: "date", required: true },
      { name: "end_date", type: "date", required: true },
      {
        name: "quantity",
        type: "number",
        required: true,
        options: { min: 1, max: 64, noDecimal: true },
      },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["pending", "completed"],
      },
      {
        name: "admin_reply",
        type: "text",
        required: false,
        options: { max: 4096 },
      },
      { name: "admin_reply_at", type: "date", required: false },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: [
      "CREATE INDEX idx_creator_email ON instances (creator_email)",
      "CREATE INDEX idx_status ON instances (status)",
    ],
  });
  console.log(`[ok] created "${collection.name}" (id=${collection.id}).`);
}

// ---- 2. Optionally create an admin user in `users` ----------------------
async function ensureAdminUser() {
  const username = process.env.PB_USER_USERNAME;
  const password = process.env.PB_USER_PASSWORD;
  if (!username || !password) {
    console.log(
      "[skip] PB_USER_USERNAME / PB_USER_PASSWORD not set — no user created.",
    );
    return;
  }

  // Resolve the admin user_type row (create if missing).
  let adminType = null;
  try {
    const types = await pb.collection("user_type").getList(1, 1, {
      filter: 'type = "admin"',
    });
    adminType = types.items[0];
  } catch {
    /* ignore — fall through to create */
  }
  if (!adminType) {
    adminType = await pb.collection("user_type").create({ type: "admin" });
    console.log(`[ok] created user_type "admin" (id=${adminType.id}).`);
  }

  // Check whether the username already exists.
  try {
    await pb.collection("users").getFirstListItem(`username = "${username}"`);
    console.log(`[skip] user "${username}" already exists.`);
    return;
  } catch {
    // Not found — fall through to create.
  }

  const created = await pb.collection("users").create({
    username,
    password,
    passwordConfirm: password,
    email: process.env.PB_USER_EMAIL || "",
    name: process.env.PB_USER_NAME || username,
    verified: true,
    user_type: adminType.id,
  });
  console.log(
    `[ok] created admin user "${created.username}" (id=${created.id}).`,
  );
}

await ensureInstances();
await ensureAdminUser();
console.log("[done]");
