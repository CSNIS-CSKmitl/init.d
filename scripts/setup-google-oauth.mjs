#!/usr/bin/env node
/**
 * Register Google as an OAuth2 provider on the `users` collection.
 *
 * Requires (from .env or process.env):
 *   PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD — PB superuser
 *   GOOGLE_OAUTH_CLIENT_ID            — from Google Cloud Console
 *   GOOGLE_OAUTH_CLIENT_SECRET        — from Google Cloud Console
 *   GOOGLE_OAUTH_REDIRECT_URI         — typically {PB_URL}/api/oauth2-redirect
 *   GOOGLE_AUTH_URL                   — optional, default: accounts.google.com
 *   GOOGLE_TOKEN_URL                  — optional, default: oauth2.googleapis.com
 *   GOOGLE_USERINFO_URL               — optional, default: openidconnect.googleapis.com
 *
 * The same redirect URI must be added to the Google Cloud OAuth client
 * under "Authorized redirect URIs".
 *
 * Idempotent — if a "google" provider is already registered, it is
 * updated in place rather than duplicated.
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
  "PB_ADMIN_EMAIL",
  "PB_ADMIN_PASSWORD",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "GOOGLE_AUTH_URL",
  "GOOGLE_TOKEN_URL",
  "GOOGLE_USERINFO_URL",
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

const users = await pb.collections.getOne("users");
const oauth2 = users.oauth2 ?? {};
oauth2.enabled = true;

// OIDC-style claim mapping — Google supports the same set.
oauth2.mappedFields = {
  id: "sub",
  username: "preferred_username",
  name: "name",
  email: "email",
  avatarURL: "picture",
};

const others = (oauth2.providers || []).filter((p) => p.name !== "google");
oauth2.providers = [
  ...others,
  {
    name: "google",
    displayName: "Google",
    pkce: true,
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    authURL: process.env.GOOGLE_AUTH_URL,
    tokenURL: process.env.GOOGLE_TOKEN_URL,
    userInfoURL: process.env.GOOGLE_USERINFO_URL,
    extra: null,
  },
];

await pb.collections.update(users.id, { oauth2 });
console.log("[ok] Google OAuth provider registered.");
console.log("     Make sure the Google Cloud console has this redirect URI:");
console.log(`     ${process.env.GOOGLE_OAUTH_REDIRECT_URI}`);
