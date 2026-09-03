// The URL server-side code should use to reach Supabase.
//
// NEXT_PUBLIC_SUPABASE_URL is the *public* address (https://db.marsmeddenterp.site),
// which is correct for the browser but wrong for the server: the app and
// Supabase run on the same machine, so using the public URL sends every query
// out to the Cloudflare edge and back in again. Measured on the live box:
// ~300ms per call through the tunnel vs ~8ms direct. Middleware, the layout
// and every page each make at least one call, so that was the bulk of the
// "screen switching is slow" delay.
//
// Falls back to the public URL when SUPABASE_INTERNAL_URL is unset, so a
// deployment where Supabase genuinely is remote still works.
export function supabaseServerUrl(): string {
  return (
    process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
  );
}
