// Browser-side Microbase client.
// Uses @techasit5415/microbase-sdk directly (no UMD script needed).
// The auth state is mirrored from the cookie that hooks.server.ts writes.

import Microbase, { type RecordModel } from "@techasit5415/microbase-sdk";
import { AUTH_COOKIE } from "../constants";

const MB_URL =
  import.meta.env.VITE_MICROBASE_URL ||
  import.meta.env.VITE_POCKETBASE_URL ||
  "/api/db";

interface StoredAuth {
  token: string;
  record: RecordModel;
}

let _client: Microbase | null = null;

export function mbBrowser(): Microbase {
  if (_client) return _client;

  const client = new Microbase(MB_URL);
  client.autoCancellation(false);

  if (typeof document !== "undefined") {
    const cookies = document.cookie.split("; ");
    const raw = cookies.find((c) => c.startsWith(`${AUTH_COOKIE}=`));
    if (raw) {
      const value = decodeURIComponent(raw.split("=").slice(1).join("="));
      try {
        const parsed = JSON.parse(value) as StoredAuth;
        if (parsed?.token) client.authStore.save(parsed.token, parsed.record);
      } catch {
        /* ignore corrupt cookie */
      }
    }
  }

  _client = client;
  return client;
}

export const pbBrowser = mbBrowser;
