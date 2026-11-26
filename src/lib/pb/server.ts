// Server-side Microbase client.
// One client per request — auth is restored from the `pb_auth` cookie
// that SvelteKit forwards. Used by +page.server.ts / +server.ts files.

import Microbase, { type RecordModel } from "@techasit5415/microbase-sdk";
import { env } from "$env/dynamic/private";
import type { RequestEvent } from "@sveltejs/kit";
import { AUTH_COOKIE } from "../constants";

interface StoredAuth {
  token: string;
  record: RecordModel;
}

export function getMicrobaseUrl(): string {
  return (
    env.MICROBASE_URL?.trim() ||
    env.POCKETBASE_URL?.trim() ||
    "http://localhost:3000"
  );
}

export function getAdminCredentials(): { email: string; password: string } {
  const email =
    env.MICROBASE_ADMIN_EMAIL?.trim() || env.PB_ADMIN_EMAIL?.trim() || "";
  const password =
    env.MICROBASE_ADMIN_PASSWORD?.trim() || env.PB_ADMIN_PASSWORD?.trim() || "";
  if (!email || !password) {
    throw new Error(
      "MICROBASE_ADMIN_EMAIL / MICROBASE_ADMIN_PASSWORD (or PB_ADMIN_*) is not set in .env",
    );
  }
  return { email, password };
}

interface CachedAdminAuth {
  url: string;
  email: string;
  token: string;
  record: RecordModel | null;
  expiresAt: number;
}

let cachedAdmin: CachedAdminAuth | null = null;
let pendingAdminLogin: Promise<CachedAdminAuth> | null = null;

function decodeJwtExpMs(token: string): number {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return Date.now() + 10 * 60 * 1000;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    if (typeof payload?.exp === "number") {
      return payload.exp * 1000 - 60_000; // refresh 60s before expiry
    }
  } catch {
    // ignore decode errors
  }
  return Date.now() + 10 * 60 * 1000;
}

export async function createAdminClient(): Promise<Microbase> {
  const url = getMicrobaseUrl();
  const { email, password } = getAdminCredentials();

  const now = Date.now();
  if (
    cachedAdmin &&
    cachedAdmin.url === url &&
    cachedAdmin.email === email &&
    cachedAdmin.expiresAt > now
  ) {
    const mb = new Microbase(url);
    mb.autoCancellation(false);
    mb.authStore.save(cachedAdmin.token, cachedAdmin.record);
    return mb;
  }

  if (!pendingAdminLogin) {
    pendingAdminLogin = (async () => {
      const mb = new Microbase(url);
      mb.autoCancellation(false);
      await mb.collection("_superusers").authWithPassword(email, password);
      const next: CachedAdminAuth = {
        url,
        email,
        token: mb.authStore.token,
        record: mb.authStore.record,
        expiresAt: decodeJwtExpMs(mb.authStore.token),
      };
      cachedAdmin = next;
      return next;
    })().finally(() => {
      pendingAdminLogin = null;
    });
  }

  const auth = await pendingAdminLogin;
  const mb = new Microbase(url);
  mb.autoCancellation(false);
  mb.authStore.save(auth.token, auth.record);
  return mb;
}

export function createPb(event: RequestEvent): Microbase {
  const mb = new Microbase(getMicrobaseUrl());
  mb.autoCancellation(false);

  const raw = event.cookies.get(AUTH_COOKIE);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredAuth;
      if (parsed?.token) {
        mb.authStore.save(parsed.token, parsed.record);
      }
    } catch {
      event.cookies.delete(AUTH_COOKIE, { path: "/" });
    }
  }

  // Persist any auth changes (login, refresh, logout) back to the cookie.
  mb.authStore.onChange((token, record) => {
    if (!token) {
      event.cookies.delete(AUTH_COOKIE, { path: "/" });
      return;
    }
    event.cookies.set(AUTH_COOKIE, JSON.stringify({ token, record }), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: !import.meta.env.DEV,
      maxAge: 60 * 60 * 24 * 7,
    });
  }, true);

  return mb;
}
