// Browser-side PocketBase client.
// The PocketBase UMD bundle is loaded by `app.html` so the global
// `window.PocketBase` is available before any page script runs.
// We avoid importing the npm ESM build on the client because Vite's
// HMR transform mangles a class method literally named `import(...)`
// in the minified bundle.
//
// The auth state is mirrored from the cookie that hooks.server.ts
// writes on every request.

import { AUTH_COOKIE } from "../constants";

const PB_URL = import.meta.env.VITE_POCKETBASE_URL;
if (!PB_URL) {
  throw new Error("VITE_POCKETBASE_URL is not set in .env");
}

// Minimal structural types — enough for the calls we make on the
// client (authWithPassword, authWithOAuth2, collection().subscribe).
interface RecordModel {
  id: string;
  collectionId?: string;
  collectionName?: string;
  email?: string;
  username?: string;
  [key: string]: unknown;
}

interface StoredAuth {
  token: string;
  record: RecordModel;
}

interface RealtimeEvent {
  action: "create" | "update" | "delete" | string;
  record: RecordModel & { id: string };
}

interface CollectionService {
  authWithPassword(
    identity: string,
    password: string,
  ): Promise<RecordModel & { token: string }>;
  authWithOAuth2(opts: {
    provider: string;
  }): Promise<{ token: string; record: RecordModel }>;
  getList<T = RecordModel>(
    page: number,
    perPage: number,
    opts?: Record<string, unknown>,
  ): Promise<{ items: T[]; totalItems: number }>;
  subscribe(
    topic: string,
    cb: (e: RealtimeEvent) => void,
    opts?: { expand?: string },
  ): Promise<() => void>;
}

interface PocketBase {
  collection(name: string): CollectionService;
  autoCancellation(v: boolean): void;
  authStore: {
    save(token: string, record: RecordModel): void;
    clear(): void;
    isValid: boolean;
  };
}

declare global {
  interface Window {
    PocketBase: new (url: string) => PocketBase;
  }
}

let _client: PocketBase | null = null;

export function pbBrowser(): PocketBase {
  if (_client) return _client;
  if (typeof window === "undefined" || !window.PocketBase) {
    throw new Error("PocketBase UMD not loaded — check /pocketbase.umd.js");
  }

  const pb = new window.PocketBase(PB_URL);
  pb.autoCancellation(false);

  const cookies = document.cookie.split("; ");
  const raw = cookies.find((c) => c.startsWith(`${AUTH_COOKIE}=`));
  if (raw) {
    const value = decodeURIComponent(raw.split("=").slice(1).join("="));
    try {
      const parsed = JSON.parse(value) as StoredAuth;
      if (parsed?.token) pb.authStore.save(parsed.token, parsed.record);
    } catch {
      /* ignore corrupt cookie */
    }
  }

  _client = pb;
  return pb;
}
