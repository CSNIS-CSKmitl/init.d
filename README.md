# init.d

The internal portal where folks at CS KMITL request VMs and LXC containers, and where admins work through the queue.

This used to be called **LEASE**. Same system, same data — just renamed. If you find old `LEASE` references in commits or scripts, that's why.

The app is the intake side only. It writes rows into PocketBase; whatever eventually builds the VMs is a different conversation.

## What's in the box

Sign in with your `@cskmitl.com` Google account, then:

- **`/request`** — the submission form. Pick `vm` or `container`, fill in CPU/RAM/disk, dates, optional DNS prefix, open ports, pick a passion group. There's a **Quick Preset** picker at the top that auto-fills from a catalog (try typing `nginx` or `postgres`). Picking a `Develop`-flagged preset triggers an "unstable, not for production" banner.
- **`/status`** — your own requests, expanded inline so you can see the full record. Live PocketBase stream — when admins add a reply, edit one, or resolve a request, it shows up here without a refresh.
- **`/admin`** — every request across all users, with a live PocketBase stream. New rows and edits show up without a refresh. Each row carries a `Reply` action: click it to leave a note for the requester (or edit/clear an existing one). Resolving still works the same way. Scoped to `user_type.type = "admin"`.

The UI is bilingual by design. Body copy that users actually read is in Thai; the code-y labels (`// INFRASTRUCTURE_QUEUE`, `send`, `PROVISION_NEW_INSTANCE`) stay in English. Two themes — **midnight** (default, amber accent) and **light** — toggleable from the navbar.

## Stack

- SvelteKit 2 + Svelte 5 in full runes mode (forced via `vite.config.ts`)
- PocketBase for auth, the `instances` collection, the `templates` catalog, and the realtime stream
- Tailwind CSS 4 with a small custom token layer in [`src/app.css`](src/app.css)
- TypeScript end-to-end
- Google OAuth via PocketBase's built-in OAuth2 flow

## Running it locally

You'll need a PocketBase instance the dev server can reach. Copy `.env.example` to `.env` and fill in:

```
POCKETBASE_URL=
VITE_POCKETBASE_URL=
PB_ADMIN_EMAIL=...
PB_ADMIN_PASSWORD=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=
```

`VITE_POCKETBASE_URL` must be the URL the browser actually hits — PocketBase bakes it into the OAuth redirect, so private IPs (`192.168.x`, `10.x`, `localhost`) will be rejected by Google. If you want to develop against a local PB, put it behind a tunnel (Cloudflare quick tunnel, ngrok, etc.) and use that URL here.

The same `GOOGLE_OAUTH_REDIRECT_URI` also has to be added to your Google Cloud OAuth client under *Authorized redirect URIs*, or the OAuth handshake will fail at Google's end.

Then:

```sh
npm install
npm run dev
```

## VM/CT node synchronization

The dev and production servers check Proxmox every 60 seconds and update the PocketBase `instances.node` field when a VM or CT moves. A record is matched by its guest type and VMID/CTID. The ID remains unchanged; records missing from Proxmox or with ambiguous matches are skipped.

Set `NODE_SYNC_INTERVAL_SECONDS` to a value from 30 to 3600 to change the interval, or set `NODE_SYNC_ENABLED=false` to disable the built-in loop. The loop requires the PocketBase admin and Proxmox credentials in `.env`.

```sh
npm run sync:nodes             # preview proposed changes
npm run sync:nodes -- --apply  # synchronize once now
npm run sync:nodes:watch       # standalone recurring worker
```

## First-time bootstrap

If you're standing up a fresh PocketBase, run these from the repo root in order:

```sh
# 1. Create the `instances` collection (and optionally an admin user).
node scripts/setup-instances.mjs

# 2. Register Google as an OAuth2 provider on the `users` collection.
node scripts/setup-google-oauth.mjs

# 3. (Optional) Seed the Quick Preset catalog from community-scripts.org.
node scripts/seed-templates.mjs
```

All three are idempotent — re-running them just updates existing rows. The PocketBase JS migration for `instances` lives in [`pb_migrations/`](pb_migrations/1700000000_create_instances.js); if you'd rather drive collection creation through `pocketbase migrate up`, that does the same job.

If you're upgrading an existing PB and don't want to re-run the migration, [`scripts/patch-instances.mjs`](scripts/patch-instances.mjs) is the easier path — it adds any fields the collection is missing (including `admin_reply` / `admin_reply_at`) without touching rows that already exist.

[`scripts/seed-templates.mjs`](scripts/seed-templates.mjs) is the interesting one. It pulls the sitemap from community-scripts.org, then for each slug fetches the matching shell script from GitHub:

1. First try [`community-scripts/ProxmoxVE`](https://github.com/community-scripts/ProxmoxVE) — marked `Production`.
2. Fall back to [`community-scripts/ProxmoxVED`](https://github.com/community-scripts/ProxmoxVED) — marked `Develop`.

Each template gets parsed for CPU/RAM/disk defaults and pushed into the `templates` collection. The form reads `status` to decide whether to surface the warning banner.

## Layout

```
src/
  hooks.server.ts           resolves auth + role into event.locals
  lib/
    pb.ts                   server-side PB client (per-request)
    pb.client.ts            browser PB client (singleton via window)
    presets.ts              loads the Quick Preset catalog from PB
    types.ts                shared types
    components/             Navbar, StatusBadge, ThemeSwitcher
  routes/
    +layout.svelte          global shell
    login/                  Google sign-in
    auth/google/            OAuth callback
    request/                submission form
    status/                 your own requests
    admin/                  admin realtime dashboard
    logout/
scripts/                    PB admin scripts (Node, ESM)
pb_migrations/              PocketBase JS migration for `instances`
```

## Permissions model

- `users` is the built-in PocketBase auth collection. Each user has a relation to a `user_type` row; `user_type.type === "admin"` is what grants the admin role (resolved in `hooks.server.ts`).
- `instances` collection rules: read scoped to the creator's email (or admins); writes locked to admins; users can only insert their own rows. See [`pb_migrations/1700000000_create_instances.js`](pb_migrations/1700000000_create_instances.js).
- The `templates` collection is admin-write-only by rule, but reads are wide open so the form can render the picker for any signed-in user.

## A few honest notes

- `svelte-check` will flag around 13 a11y warnings about `<label>` association. They're pre-existing — the rest of the codebase uses the same pattern. Worth fixing in a sweep, but not blocking anything right now.
- The `templates` collection is created on the fly by `seed-templates.mjs` rather than being declared in `pb_migrations/`. If you want collection-as-code for it, port the spec over.
- The PocketBase JS migration file refers to the old project name (`LEASE`) in its comment header. It's the same collection; just a stale comment.

## Other scripts

[`scripts/`](scripts/) also has a handful of one-shot utilities for when things go sideways:

- `update-pb-url.mjs` — rewrites the `url` setting on a PB instance (useful when you move it behind a tunnel).
- `fix-oauth-mappings.mjs` — repairs the field mappings on the Google OAuth2 provider after a PB upgrade.
- `patch-instances.mjs` — adds/alters fields on `instances` if you don't want to write a fresh migration.
- `reset-pw.mjs` — admin password reset against the PB API.
- `debug-auth.mjs` — prints out the current auth store / user_type expansion so you can see what's wrong with a login.
