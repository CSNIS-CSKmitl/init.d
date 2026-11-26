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

export async function createAdminClient(): Promise<Microbase> {
  const mb = new Microbase(getMicrobaseUrl());
  mb.autoCancellation(false);
  const { email, password } = getAdminCredentials();
  await mb.collection("_superusers").authWithPassword(email, password);
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
