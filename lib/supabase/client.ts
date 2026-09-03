"use client";

import { createBrowserClient } from "@supabase/ssr";
import { authCookieName } from "./cookie-name";

// Browser Supabase client. Sessions are stored in cookies (via @supabase/ssr),
// so a logged-in device stays remembered — no repeated logins.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { name: authCookieName() } }
  );
}
