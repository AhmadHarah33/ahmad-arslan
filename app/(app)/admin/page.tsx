import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  // E-mails live in auth, not profiles. Head-only page, so the admin client is safe here.
  const { data: authList } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  const emails: Record<string, string> = {};
  for (const u of authList?.users ?? []) emails[u.id] = u.email ?? "";
  const audit = log ?? [];

  return (
    <div className="space-y-8">
      <TeamView me={profile} members={members} emails={emails} />
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Recent activity
        </h2>
        <AuditLog rows={audit} />
      </section>
    </div>
  );
}
