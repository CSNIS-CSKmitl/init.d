// Login server action — authenticates against the regular `users`
// collection using username + password (PB identityFields).
// The `_superusers` collection is reserved for PB administration
// only and is NOT a login path.

import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) throw redirect(303, "/");
  return {};
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const data = await request.formData();
    // Accept either a PB `username` or an `email` — PB's identityFields
    // resolves whichever matches first.
    const identity = String(
      data.get("identity") ?? data.get("username") ?? "",
    ).trim();
    const password = String(data.get("password") ?? "");

    if (!identity || !password) {
      return fail(400, {
        username: identity,
        error: "Username/email and password are required.",
      });
    }

    try {
      await locals.pb.collection("users").authWithPassword(identity, password);
    } catch {
      return fail(401, {
        username: identity,
        error: "Invalid username, email, or password.",
      });
    }

    throw redirect(303, "/");
  },
};
