import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAgreementFormData } from "@/lib/agreements.server";
import AgreementForm, { type FormInitial } from "@/components/agreements/agreement-form";
import type { Agreement } from "@/lib/types";

export default async function EditAgreementPage({
  params: paramsP,
}: {
  params: Promise<{ id: string }>;
}) {
  const params = await paramsP;
  await requireProfile();
  const supabase = await createClient();

  const [{ data: a }, { data: ms }, { data: ts }, { data: vs }, form] = await Promise.all([
    supabase.from("agreements").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("agreement_machines").select("machine_id").eq("agreement_id", params.id),
    supabase.from("agreement_assignees").select("profile_id").eq("agreement_id", params.id),
    supabase
      .from("agreement_visits")
      .select("id, due_date, done_at")
      .eq("agreement_id", params.id)
      .order("seq"),
    loadAgreementFormData(supabase),
  ]);
  if (!a) notFound();
  const ag = a as Agreement;
  if (ag.status === "cancelled") notFound();

  // The lead (assignee_id) goes first; the form treats the first as the lead.
  const techs = (ts ?? []).map((r) => r.profile_id as string);
  const technician_ids = ag.assignee_id
    ? [ag.assignee_id, ...techs.filter((id) => id !== ag.assignee_id)]
    : techs;

  const initial: FormInitial = {
    id: ag.id,
    status: ag.status,
    customer_id: ag.customer_id,
    plan: ag.plan,
    visits_per_year: ag.visits_per_year,
    start_date: ag.start_date,
    end_date: ag.end_date,
    machine_ids: (ms ?? []).map((r) => r.machine_id as string),
    technician_ids,
    includes_warranty: ag.includes_warranty,
    warranty_end: ag.warranty_end,
    coverage: ag.coverage,
    warranty_months: ag.warranty_months,
    remind_days: ag.remind_days,
    amount: ag.amount != null ? Number(ag.amount) : null,
    currency: ag.currency,
    payment_due: ag.payment_due,
    notes: ag.notes,
    contract_path: ag.contract_path,
    visits: (vs ?? []) as FormInitial["visits"],
  };

  return <AgreementForm {...form} initial={initial} />;
}
