import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadAgreementsDashboardData } from "@/lib/agreements.server";
import AgreementsTable from "@/components/agreements/agreements-table";

export default async function CustomersWithAgreementPage() {
  await requireProfile();
  const { today, agreements } = await loadAgreementsDashboardData(await createClient());
  return <AgreementsTable today={today} agreements={agreements} />;
}
