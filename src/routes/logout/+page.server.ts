// Sign-out endpoint — clears the PocketBase auth cookie and bounces home.
import { redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";
import { AUTH_COOKIE } from "$lib/constants";

export const actions: Actions = {
  default: async ({ locals, cookies }) => {
    locals.pb.authStore.clear();
    cookies.delete(AUTH_COOKIE, { path: "/" });
    throw redirect(303, "/");
  },
};
