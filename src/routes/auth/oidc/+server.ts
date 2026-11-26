import { json, redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import Microbase from "@techasit5415/microbase-sdk";
import { createAdminClient, getMicrobaseUrl } from "$lib/pb/server";
import { AUTH_COOKIE } from "$lib/constants";

// Microbase handles the OAuth2/OIDC flow and redirects back with ?code=...
// (or a client POSTs { token, record }). This endpoint persists the session
// as an HttpOnly cookie for server-rendered pages.
const ROLE_TYPE_IDS = {
  student: "000000000000001",
  staff: "000000000000002",
  guest: "000000000000003",
} as const;

function resolveDefaultUserTypeId(record: any): string {
  const iamRole = String(record?.iam_role ?? "").trim().toLowerCase();
  if (iamRole === "staff") return ROLE_TYPE_IDS.staff;
  if (iamRole === "guest") return ROLE_TYPE_IDS.guest;
  return ROLE_TYPE_IDS.student;
}

async function ensureDefaultRole(record: any) {
  const hasNoRole =
    !record?.user_type ||
    (Array.isArray(record.user_type) && record.user_type.length === 0);
  if (hasNoRole && record?.id) {
    const service = await createAdminClient();
    return service
      .collection("users")
      .update(record.id, { user_type: [resolveDefaultUserTypeId(record)] });
  }
  return record;
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const payload = await request.json().catch(() => null);
  const token = payload?.token;
  const claimedId = payload?.record?.id;
  if (typeof token !== "string" || typeof claimedId !== "string") {
    return json({ error: "Missing Microbase credentials." }, { status: 400 });
  }

  try {
    const mb = new Microbase(getMicrobaseUrl());
    mb.autoCancellation(false);
    mb.authStore.save(token, null);
    const refreshed = await mb.collection("users").authRefresh();
    let record = refreshed.record;
    if (!record?.id || record.id !== claimedId) {
      return json(
        { error: "Microbase account does not match." },
        { status: 401 },
      );
    }

    record = await ensureDefaultRole(record);

    cookies.set(
      AUTH_COOKIE,
      JSON.stringify({ token: refreshed.token, record }),
      {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: url.protocol === "https:",
        maxAge: 60 * 60 * 24 * 7,
      },
    );
    return json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    console.error(
      "[auth/oidc] Microbase sign-in failed:",
      cause instanceof Error ? cause.message : cause,
    );
    return json(
      { error: "Could not complete Microbase sign-in." },
      { status: 503 },
    );
  }
};

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get("code");
  if (!code) {
    throw redirect(303, "/");
  }

  try {
    const mb = new Microbase(getMicrobaseUrl());
    mb.autoCancellation(false);
    const auth = await mb.exchangeOAuth2Code(code);
    if (!auth.token || !auth.record?.id) {
      throw redirect(303, "/login?error=oidc_failed");
    }
    const record = await ensureDefaultRole(auth.record);
    cookies.set(AUTH_COOKIE, JSON.stringify({ token: auth.token, record }), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      maxAge: 60 * 60 * 24 * 7,
    });
  } catch (cause) {
    console.error(
      "[auth/oidc] OAuth code exchange failed:",
      cause instanceof Error ? cause.message : cause,
    );
    throw redirect(303, "/login?error=oidc_failed");
  }

  throw redirect(303, "/");
};
