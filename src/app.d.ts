// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type PocketBase from "pocketbase";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      pb: PocketBase;
      user: {
        id: string;
        email: string;
        name?: string;
        username?: string;
        role: "admin" | "user";
        roles?: string[];
        isAdmin?: boolean;
      } | null;
    }
    interface PageData {
      user?: App.Locals["user"];
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
