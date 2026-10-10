import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  generateDueAgreementVisits,
  loadAgreementsDashboardData,
} from "@/lib/agreements.server";
import AgreementsDashboard from "@/components/agreements/dashboard";

export default async function AgreementsPage() {
  await requireProfile();
  const supabase = await createClient();
  // Visits that have come due become board tasks (idempotent).
  await generateDueAgreementVisits(supabase);

  const data = await loadAgreementsDashboardData(supabase);
  return <AgreementsDashboard {...data} />;
}
