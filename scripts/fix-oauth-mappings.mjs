import PocketBase from "pocketbase";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
function loadDotEnv(p) {
  if (!existsSync(p)) return;
  for (const r of readFileSync(p, "utf8").split(/\r?\n/)) {
    const l = r.trim();
    if (!l || l.startsWith("#")) continue;
    const e = l.indexOf("=");
    if (e < 0) continue;
    const k = l.slice(0, e).trim();
    let v = l.slice(e + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnv(resolve(ROOT, ".env"));

for (const k of ["POCKETBASE_URL", "PB_ADMIN_EMAIL", "PB_ADMIN_PASSWORD"]) {
  if (!process.env[k]) {
    console.error("Missing " + k);
    process.exit(1);
  }
}

const pb = new PocketBase(process.env.POCKETBASE_URL);
pb.autoCancellation(false);
await pb.admins.authWithPassword(
  process.env.PB_ADMIN_EMAIL,
  process.env.PB_ADMIN_PASSWORD,
);

const before = await pb.collections.getOne("users");
console.log(
  "BEFORE mappedFields:",
  JSON.stringify(before.oauth2?.mappedFields),
);

// Use the full OAuth2 object so we don't lose other fields
const oauth2 = {
  ...(before.oauth2 ?? {}),
  enabled: true,
  mappedFields: {
    id: "sub",
    username: "preferred_username",
    name: "name",
    email: "email",
    avatarURL: "picture",
  },
};

const updated = await pb.collections.update(before.id, { oauth2 });
console.log(
  "AFTER  mappedFields:",
  JSON.stringify(updated.oauth2?.mappedFields),
);

// Re-fetch to confirm persisted
const after = await pb.collections.getOne("users");
console.log(
  "PERSISTED mappedFields:",
  JSON.stringify(after.oauth2?.mappedFields),
);
