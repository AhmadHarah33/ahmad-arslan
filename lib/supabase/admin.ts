import { createClient } from "@supabase/supabase-js";
import { supabaseServerUrl } from "./internal-url";

// SERVER-ONLY admin client using the service-role key. Bypasses RLS, so it is
// only ever imported from server actions / route handlers guarded by an
// is-head check. NEVER import this into a Client Component.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(supabaseServerUrl(), key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
