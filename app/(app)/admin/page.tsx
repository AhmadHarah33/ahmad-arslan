import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import TeamView from "@/components/admin/team-view";
import type { Profile } from "@/lib/types";
import { PREVIEW, previewEngineers } from "@/lib/preview";

export default async function AdminPage() {
  const profile = await requireProfile();
  if (profile.role !== "head") redirect("/");

  if (PREVIEW) {
    return <TeamView me={profile} members={previewEngineers} />;
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("role")
    .order("full_name");

  return (
    <TeamView me={profile} members={(data ?? []) as Profile[]} />
  );
}
