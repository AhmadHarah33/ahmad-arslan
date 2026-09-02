import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import TeamView from "@/components/admin/team-view";
import AuditLog from "@/components/admin/audit-log";
import type { Profile } from "@/lib/types";

export default async function AdminPage() {
  const profile = await requireProfile();
  if (profile.role !== "head") redirect("/");

  const supabase = createClient();
  const [{ data: profs }, { data: log }] = await Promise.all([
    supabase.from("profiles").select("*").order("role").order("full_name"),
    supabase
      .from("audit_log")
      .select("id, entity, action, summary, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const members = (profs ?? []) as Profile[];
  const audit = log ?? [];

  return (
    <div className="space-y-8">
      <TeamView me={profile} members={members} />
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Recent activity
        </h2>
        <AuditLog rows={audit} />
      </section>
    </div>
  );
}
