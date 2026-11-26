#!/usr/bin/env node
/**
 * Update the PocketBase `url` setting so it advertises the public-facing
 * domain rather than the LAN address. PB embeds this URL in every OAuth
 * redirect, so it must match what Google (or any other OAuth provider)
 * sees in the user's browser.
 *
 * Reads from .env (no fallbacks — if a var is missing, the script exits):
 *   PB_URL              — admin API endpoint (LAN)
 *   PB_ADMIN_EMAIL      — PB superuser
 *   PB_ADMIN_PASSWORD   — PB superuser
 *   PB_PUBLIC_URL       — what to set as the new `url` (public)
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

const REQUIRED = [
  "POCKETBASE_URL",
  "VITE_POCKETBASE_URL",
  "PB_ADMIN_EMAIL",
  "PB_ADMIN_PASSWORD",
];
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

await pb.settings.update({ url: process.env.VITE_POCKETBASE_URL });
console.log(
  `[ok] PB url setting updated to: ${process.env.VITE_POCKETBASE_URL}`,
);
console.log("     OAuth redirects will now resolve to:");
console.log(`     ${process.env.VITE_POCKETBASE_URL}/api/oauth2-redirect`);
