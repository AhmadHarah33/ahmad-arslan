import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import TeamView from "@/components/admin/team-view";
import AuditLog from "@/components/admin/audit-log";
import type { Profile } from "@/lib/types";
import { PREVIEW, previewEngineers } from "@/lib/preview";

const previewAudit = [
  { id: 1, entity: "tasks", action: "update", summary: "Repair chair unit at Nile Dental", created_at: new Date(Date.now() - 1800_000).toISOString() },
  { id: 2, entity: "customers", action: "insert", summary: "Bright Smile Center", created_at: new Date(Date.now() - 7200_000).toISOString() },
  { id: 3, entity: "spare_parts", action: "update", summary: "Tube head assembly", created_at: new Date(Date.now() - 86_400_000).toISOString() },
];

export default async function AdminPage() {
  const profile = await requireProfile();
  if (profile.role !== "head") redirect("/");

  let members: Profile[];
  let audit: any[];

  if (PREVIEW) {
    members = previewEngineers;
    audit = previewAudit;
  } else {
    const supabase = createClient();
    const [{ data: profs }, { data: log }] = await Promise.all([
      supabase.from("profiles").select("*").order("role").order("full_name"),
      supabase
        .from("audit_log")
        .select("id, entity, action, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    members = (profs ?? []) as Profile[];
    audit = log ?? [];
  }

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
