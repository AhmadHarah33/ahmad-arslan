import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

// Returns the current user's profile, or null if not signed in.
//
// Memoized per request with React's cache(): the app layout and every page
// under it both call this, so without it a single navigation cost two
// identical `auth.getUser()` round trips to GoTrue plus two identical
// `profiles` SELECTs. cache() is request-scoped, so there is no cross-user
// or cross-navigation staleness.
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
});

// Use in protected Server Components — redirects to /login when signed out.
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}
