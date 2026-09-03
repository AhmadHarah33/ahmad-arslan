// The auth cookie name, pinned explicitly on both the browser and the server.
//
// @supabase/ssr otherwise derives it from whatever URL it was handed, as
// `sb-${hostname.split(".")[0]}-auth-token`. Since the server talks to
// Supabase over SUPABASE_INTERNAL_URL (127.0.0.1) while the browser uses the
// public URL, the two derived names disagreed — the browser wrote
// `sb-db-auth-token` and the server looked for `sb-127-auth-token`, found no
// session, and bounced every request back to /login.
//
// Always derived from the PUBLIC url, so the name matches what already-issued
// cookies use and nobody is signed out when this changes.
export function authCookieName(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    return `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`;
  } catch {
    return "sb-auth-token";
  }
}
