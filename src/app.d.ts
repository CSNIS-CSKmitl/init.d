// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type Microbase from "@techasit5415/microbase-sdk";

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      pb: Microbase;
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
